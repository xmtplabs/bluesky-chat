# Nostr ↔ XMTP Identity Binding: Verify and Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure the Nostr identity binding (npub ↔ XMTP inbox) works end-to-end per the [HackMD spec](https://hackmd.io/x43UXu6VS5y88YTIo3K5tw), fix the critical `hasRepoWriteAccess` gap that prevents publishing, and add tests proving the mapping round-trips correctly.

**Architecture:** The binding stores an `xmtp` field in the Nostr kind 0 (metadata) event: `{ inboxId, verificationSignature, createdAt }`. The signature is created by `client.signWithInstallationKey(npub)` — the XMTP installation key signs the user's bech32-encoded npub. Verification fetches the inbox state from the XMTP network and checks each installation's public key against the signature.

**Tech Stack:** nostr-tools (kind 0 events, relays), @xmtp/browser-sdk (signing, verification), vitest (tests)

---

## Audit: Current State vs HackMD Spec

| Spec Requirement | Status | Notes |
|---|---|---|
| Sign npub with `signWithInstallationKey` | ✅ Done | `signDidWithInstallationKey(client, profile.id)` where `profile.id = npub` |
| Publish to kind 0 `xmtp: { inboxId, verificationSignature, createdAt }` | ✅ Code exists | `NostrService.publishInboxBinding()` merges xmtp into kind 0 |
| **But: authStore never calls it** | ❌ **BUG** | `provider.hasRepoWriteAccess?.() ?? false` → `false` because Nostr provider doesn't implement it |
| Lookup: fetch kind 0, extract xmtp field | ✅ Done | `NostrService.lookupInboxBinding()` + `extractXmtpBinding()` |
| Verify signature against installation keys | ✅ Done | `verifyInboxOwnership()` in `src/services/xmtp.ts` |
| Delete binding (republish kind 0 without xmtp) | ✅ Done | `NostrService.deleteInboxBinding()` |

**Root cause:** The Nostr provider is missing `hasRepoWriteAccess()`. The authStore gates ALL publish/republish/re-sign operations behind this check. Without it, bindings are never written to relays.

---

## Task 1: Add `hasRepoWriteAccess()` to Nostr Provider

**Files:**
- Modify: `packages/provider-nostr/src/provider.ts`

**Step 1: Write the failing test**

Add to `packages/provider-nostr/src/provider.test.ts`:

```typescript
it('should report write access via hasRepoWriteAccess', () => {
  // After the mock NostrService is constructed, the provider delegates to it.
  // The mock always has a logged-in state, so hasRepoWriteAccess should be true.
  expect(provider.hasRepoWriteAccess).toBeTypeOf('function')
  expect(provider.hasRepoWriteAccess!()).toBe(true)
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run -c packages/provider-nostr/vitest.config.ts`
Expected: FAIL — `hasRepoWriteAccess` is undefined on the provider

**Step 3: Implement `hasRepoWriteAccess` on the provider**

In `packages/provider-nostr/src/provider.ts`, add to the `provider` object:

```typescript
hasRepoWriteAccess() {
  return service.isLoggedIn()
},
```

Place it after `deleteInboxBinding` and before `getProfile`.

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run -c packages/provider-nostr/vitest.config.ts`
Expected: PASS — all tests including the new one

**Step 5: Commit**

```bash
git add packages/provider-nostr/src/provider.ts packages/provider-nostr/src/provider.test.ts
git commit -m "fix(nostr): add hasRepoWriteAccess to enable identity binding publish"
```

---

## Task 2: Add Round-Trip Test for Publish → Lookup

Verify that the kind 0 metadata structure matches the HackMD spec exactly.

**Files:**
- Modify: `packages/provider-nostr/src/nostr.test.ts`

**Step 1: Write the test**

Add a new `describe('binding round-trip')` block to `nostr.test.ts`:

```typescript
describe('binding round-trip', () => {
  it('should publish xmtp binding to kind 0 and look it up again', async () => {
    // Setup: login via extension so we can sign
    ;(window as any).nostr = {
      getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)),
      signEvent: vi.fn((t: any) => ({ ...t, id: 'id', pubkey: 'a'.repeat(64), sig: 'sig' })),
    }

    mockPool.get.mockResolvedValue({
      kind: 0,
      content: JSON.stringify({ name: 'alice' }),
      pubkey: 'a'.repeat(64),
    })
    await service.loginWithExtension()

    // Publish: merge xmtp into kind 0
    mockPool.get.mockResolvedValue({
      kind: 0,
      content: JSON.stringify({ name: 'alice', about: 'bio' }),
      pubkey: 'a'.repeat(64),
    })
    await service.publishInboxBinding('inbox-abc123', 'c2lnbmF0dXJl')

    // Verify the signed event has correct structure per HackMD spec
    const signCall = (window as any).nostr.signEvent.mock.calls.at(-1)[0]
    const metadata = JSON.parse(signCall.content)
    expect(metadata.name).toBe('alice')
    expect(metadata.about).toBe('bio')
    expect(metadata.xmtp).toEqual({
      inboxId: 'inbox-abc123',
      verificationSignature: 'c2lnbmF0dXJl',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })

    // Lookup: should find the binding from a kind 0 event containing the xmtp field
    mockPool.get.mockResolvedValue({
      kind: 0,
      content: signCall.content,
      pubkey: 'a'.repeat(64),
    })
    const result = await service.lookupInboxBinding('npub1mock')
    expect(result.found).toBe(true)
    if (result.found) {
      expect(result.inboxId).toBe('inbox-abc123')
      expect(result.verificationSignature).toBe('c2lnbmF0dXJl')
    }
  })
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm exec vitest run -c packages/provider-nostr/vitest.config.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/provider-nostr/src/nostr.test.ts
git commit -m "test(nostr): add binding round-trip test matching HackMD spec"
```

---

## Task 3: Add `extractXmtpBinding` Spec-Compliance Test

Verify the utility handles the exact HackMD JSON structure.

**Files:**
- Modify: `packages/provider-nostr/src/utils.test.ts`

**Step 1: Write the test**

Add to the `extractXmtpBinding` describe block in `utils.test.ts`:

```typescript
it('should extract binding from HackMD spec example', () => {
  // Exact structure from https://hackmd.io/x43UXu6VS5y88YTIo3K5tw
  const content = JSON.stringify({
    name: 'Your Name',
    picture: 'https://example.com/pic.jpg',
    about: 'Your bio',
    nip05: '_@yourdomain.com',
    lud16: 'you@getalby.com',
    xmtp: {
      inboxId: 'inbox-abc123',
      verificationSignature: 'base64sig',
      createdAt: '2026-02-01T12:00:00Z',
    },
  })
  const result = extractXmtpBinding(content)
  expect(result).not.toBeNull()
  expect(result!.inboxId).toBe('inbox-abc123')
  expect(result!.verificationSignature).toBe('base64sig')
  expect(result!.createdAt).toBe('2026-02-01T12:00:00Z')
})

it('should handle xmtp field without createdAt', () => {
  const content = JSON.stringify({
    xmtp: { inboxId: 'inbox-x', verificationSignature: 'sig-y' },
  })
  const result = extractXmtpBinding(content)
  expect(result).not.toBeNull()
  expect(result!.inboxId).toBe('inbox-x')
  expect(result!.createdAt).toBeUndefined()
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm exec vitest run -c packages/provider-nostr/vitest.config.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/provider-nostr/src/utils.test.ts
git commit -m "test(nostr): add HackMD spec compliance tests for extractXmtpBinding"
```

---

## Task 4: Run Full Suite + TypeScript Check

**Step 1: Run provider tests**

Run: `pnpm exec vitest run -c packages/provider-nostr/vitest.config.ts`
Expected: All pass (should be ~30+ tests now)

**Step 2: Run full test suite**

Run: `pnpm exec vitest run`
Expected: All pass (75+ tests)

**Step 3: TypeScript check**

Run: `CHAT_PROVIDER=nostr pnpm exec tsc --noEmit`
Expected: Only pre-existing `app.dock` errors (3 total)

**Step 4: Commit if any fixups needed**

---

## Verification Checklist

After all tasks, verify these properties hold:

- [ ] `provider.hasRepoWriteAccess()` returns `true` when logged in
- [ ] `publishInboxBinding(inboxId, sig)` merges `xmtp: { inboxId, verificationSignature, createdAt }` into kind 0 metadata
- [ ] `lookupInboxBinding(npub)` fetches kind 0 and returns `{ found: true, inboxId, verificationSignature }`
- [ ] `deleteInboxBinding()` removes the `xmtp` field from kind 0
- [ ] `extractXmtpBinding()` parses the exact JSON structure from the HackMD spec
- [ ] The signed message is the bech32 npub (via `signDidWithInstallationKey(client, profile.id)`)
- [ ] Verification uses `verifySignedWithPublicKey(npub, signatureBytes, installation.bytes)`

### Manual Runtime Test (with Primal)

1. `pnpm run dev:nostr`
2. Login via NIP-46 QR (Primal)
3. Open DevTools Console
4. Look for: `Publishing new identity binding via provider...` (was previously blocked)
5. Look for: `Identity published via provider`
6. Verify kind 0 on a relay viewer (e.g. nostr.band) contains the `xmtp` field
