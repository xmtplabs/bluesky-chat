import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Helper to get a fresh MappingBackendClient instance per test
async function createClient() {
  vi.resetModules()
  const mod = await import('./mappingBackend')
  return mod.mappingBackend
}

// Helper to create a mock Response
function mockResponse(status: number, body?: object): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(body ?? {})
  } as Response
}

// Helper: start a registerMapping call and advance fake timers to let fetchWithRetry sleeps resolve.
// Uses 10s advancement — enough for retry backoffs (~3s) but under the 30s retry interval.
async function registerWithTimers(
  client: Awaited<ReturnType<typeof createClient>>,
  did: string
): Promise<boolean> {
  const promise = client.registerMapping({ id: did })
  await vi.advanceTimersByTimeAsync(10_000)
  return promise
}

describe('MappingBackendClient - retry queue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockClear()
    vi.mocked(localStorage.removeItem).mockClear()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should add failed registration to pending set and persist to localStorage', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))
    const client = await createClient()

    await registerWithTimers(client, 'did:plc:failed')

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'pending-mapping-registrations',
      JSON.stringify(['did:plc:failed'])
    )
  })

  it('should remove successful registration from pending set', async () => {
    // Pre-populate pending registrations
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === 'pending-mapping-registrations') {
        return JSON.stringify(['did:plc:pending'])
      }
      return null
    })

    vi.mocked(global.fetch).mockResolvedValue(mockResponse(200))
    const client = await createClient()

    await registerWithTimers(client, 'did:plc:pending')

    expect(localStorage.removeItem).toHaveBeenCalledWith('pending-mapping-registrations')
  })

  it('should remove 400 rejected registration from pending set', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))
    const client = await createClient()

    // First: fail to add to pending
    await registerWithTimers(client, 'did:plc:bad')

    expect(localStorage.setItem).toHaveBeenCalledWith(
      'pending-mapping-registrations',
      JSON.stringify(['did:plc:bad'])
    )

    // Now: 400 response — should treat as success (removed from pending)
    vi.mocked(global.fetch).mockResolvedValue(mockResponse(400, { error: 'Invalid DID' }))
    const result = await registerWithTimers(client, 'did:plc:bad')

    expect(result).toBe(true)
    expect(localStorage.removeItem).toHaveBeenCalledWith('pending-mapping-registrations')
  })

  it('should load pending registrations from localStorage and retry them', async () => {
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === 'pending-mapping-registrations') {
        return JSON.stringify(['did:plc:a', 'did:plc:b'])
      }
      return null
    })

    vi.mocked(global.fetch).mockResolvedValue(mockResponse(200))
    await createClient()

    // Trigger the retry loop (fires every 30s)
    await vi.advanceTimersByTimeAsync(30_000)

    const fetchCalls = vi.mocked(global.fetch).mock.calls
    const registerCalls = fetchCalls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/v1/register')
    )
    expect(registerCalls).toHaveLength(2)
  })

  it('should handle corrupted localStorage gracefully', async () => {
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === 'pending-mapping-registrations') {
        return '{"not": "an array"}'
      }
      return null
    })

    const client = await createClient()
    expect(client.isAvailable()).toBe(true)
  })

  it('should handle non-string entries in localStorage gracefully', async () => {
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === 'pending-mapping-registrations') {
        return JSON.stringify(['did:plc:valid', 123, null])
      }
      return null
    })

    vi.mocked(global.fetch).mockResolvedValue(mockResponse(200))
    await createClient()

    // Trigger retry — should only retry the valid string entry
    await vi.advanceTimersByTimeAsync(30_000)

    const fetchCalls = vi.mocked(global.fetch).mock.calls
    const registerCalls = fetchCalls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/v1/register')
    )
    expect(registerCalls).toHaveLength(1)
    expect(registerCalls[0][1]?.body).toBe(JSON.stringify({ id: 'did:plc:valid' }))
  })

  it('should skip retry loop when circuit breaker is open', async () => {
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === 'pending-mapping-registrations') {
        return JSON.stringify(['did:plc:queued'])
      }
      return null
    })

    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))
    const client = await createClient()

    // Trigger 5 failures to open circuit breaker
    for (let i = 0; i < 5; i++) {
      await registerWithTimers(client, `did:plc:fail-${i}`)
    }
    expect(client.getState().circuitState).toBe('open')

    vi.mocked(global.fetch).mockClear()

    // Trigger retry loop — should skip because circuit is open
    await vi.advanceTimersByTimeAsync(30_000)

    const registerCalls = vi.mocked(global.fetch).mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/v1/register')
    )
    expect(registerCalls).toHaveLength(0)
  })

  it('should stop retrying mid-loop when circuit breaker opens', async () => {
    // Pre-load 10 pending registrations — more than the circuit breaker threshold (5)
    const pending = Array.from({ length: 10 }, (_, i) => `did:plc:pending-${i}`)
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === 'pending-mapping-registrations') {
        return JSON.stringify(pending)
      }
      return null
    })

    vi.mocked(global.fetch).mockRejectedValue(new Error('Server down'))
    const client = await createClient()

    // Trigger retry loop — should process some, then circuit breaker opens and stops
    // 30s for interval + ~15s for fetchWithRetry backoffs across 5 doRegister calls
    // Stay under 60s circuit breaker reset to avoid re-opening
    await vi.advanceTimersByTimeAsync(50_000)

    // Circuit breaker should be open after 5 consecutive failures
    expect(client.getState().circuitState).toBe('open')

    // Should NOT have attempted all 10 — circuit breaker stopped the loop
    // Each doRegister call triggers 3 fetch attempts (fetchWithRetry), so
    // 5 doRegister calls × 3 attempts = 15 fetch calls
    const registerCalls = vi.mocked(global.fetch).mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/v1/register')
    )
    expect(registerCalls.length).toBeLessThan(10 * 3) // fewer than processing all 10
    expect(registerCalls.length).toBe(5 * 3) // exactly 5 doRegister calls
  })
})
