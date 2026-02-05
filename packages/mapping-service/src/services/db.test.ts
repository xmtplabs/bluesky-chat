import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getMappingByDid,
  getMappingByInboxId,
  getMappingsByDids,
  getMappingsByInboxIds,
  upsertMapping,
  deleteMapping,
  getTotalMappings
} from './db'

// Mock D1Database
function createMockDb() {
  const mockFirst = vi.fn()
  const mockAll = vi.fn()
  const mockRun = vi.fn()
  const mockBind = vi.fn(() => ({
    first: mockFirst,
    all: mockAll,
    run: mockRun
  }))
  const mockPrepare = vi.fn(() => ({
    bind: mockBind,
    first: mockFirst
  }))

  return {
    prepare: mockPrepare,
    _mocks: { mockFirst, mockAll, mockRun, mockBind, mockPrepare }
  }
}

describe('db service', () => {
  describe('getMappingByDid', () => {
    it('returns mapping when found', async () => {
      const mockDb = createMockDb()
      mockDb._mocks.mockFirst.mockResolvedValue({
        did: 'did:plc:test123',
        inbox_id: '0xabcdef',
        signature: 'base64sig',
        created_at: 1700000000000
      })

      const result = await getMappingByDid(mockDb as any, 'did:plc:test123')

      expect(result).toEqual({
        did: 'did:plc:test123',
        inboxId: '0xabcdef',
        signature: 'base64sig',
        createdAt: 1700000000000
      })
    })

    it('returns null when not found', async () => {
      const mockDb = createMockDb()
      mockDb._mocks.mockFirst.mockResolvedValue(null)

      const result = await getMappingByDid(mockDb as any, 'did:plc:notfound')

      expect(result).toBeNull()
    })
  })

  describe('getMappingByInboxId', () => {
    it('returns mapping when found', async () => {
      const mockDb = createMockDb()
      mockDb._mocks.mockFirst.mockResolvedValue({
        did: 'did:plc:test123',
        inbox_id: '0xabcdef',
        signature: 'base64sig',
        created_at: 1700000000000
      })

      const result = await getMappingByInboxId(mockDb as any, '0xabcdef')

      expect(result).toEqual({
        did: 'did:plc:test123',
        inboxId: '0xabcdef',
        signature: 'base64sig',
        createdAt: 1700000000000
      })
    })
  })

  describe('getMappingsByDids', () => {
    it('returns empty array for empty input', async () => {
      const mockDb = createMockDb()

      const result = await getMappingsByDids(mockDb as any, [])

      expect(result).toEqual([])
      expect(mockDb.prepare).not.toHaveBeenCalled()
    })

    it('returns mappings for valid DIDs', async () => {
      const mockDb = createMockDb()
      mockDb._mocks.mockAll.mockResolvedValue({
        results: [
          {
            did: 'did:plc:a',
            inbox_id: '0x111',
            signature: 'sig1',
            created_at: 1700000000000
          },
          {
            did: 'did:plc:b',
            inbox_id: '0x222',
            signature: 'sig2',
            created_at: 1700000000000
          }
        ]
      })

      const result = await getMappingsByDids(mockDb as any, ['did:plc:a', 'did:plc:b'])

      expect(result).toHaveLength(2)
      expect(result[0].did).toBe('did:plc:a')
      expect(result[1].did).toBe('did:plc:b')
    })
  })

  describe('getTotalMappings', () => {
    it('returns count from database', async () => {
      const mockDb = createMockDb()
      mockDb._mocks.mockFirst.mockResolvedValue({ count: 42 })

      const result = await getTotalMappings(mockDb as any)

      expect(result).toBe(42)
    })

    it('returns 0 when result is null', async () => {
      const mockDb = createMockDb()
      mockDb._mocks.mockFirst.mockResolvedValue(null)

      const result = await getTotalMappings(mockDb as any)

      expect(result).toBe(0)
    })
  })
})
