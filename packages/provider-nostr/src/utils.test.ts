import { describe, it, expect } from 'vitest'
import {
  decodeNostrIdentity,
  parseKind0Content,
  extractXmtpBinding,
  hexToNpub,
  npubToHex,
} from './utils'

describe('decodeNostrIdentity', () => {
  it('should decode an npub to hex pubkey', () => {
    // Known test vector: npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6
    const npub = 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6'
    const result = decodeNostrIdentity(npub)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('npub')
    expect(typeof result!.pubkey).toBe('string')
    expect(result!.pubkey).toHaveLength(64) // hex pubkey is 64 chars
  })

  it('should decode a hex pubkey as-is', () => {
    const hex = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'
    const result = decodeNostrIdentity(hex)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('hex')
    expect(result!.pubkey).toBe(hex)
  })

  it('should return null for invalid input', () => {
    expect(decodeNostrIdentity('not-valid')).toBeNull()
    expect(decodeNostrIdentity('')).toBeNull()
  })
})

describe('hexToNpub / npubToHex', () => {
  it('should round-trip hex <-> npub', () => {
    const hex = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'
    const npub = hexToNpub(hex)
    expect(npub).toMatch(/^npub1/)
    expect(npubToHex(npub)).toBe(hex)
  })
})

describe('parseKind0Content', () => {
  it('should parse standard metadata fields into UserProfile', () => {
    const content = JSON.stringify({
      name: 'alice',
      display_name: 'Alice',
      picture: 'https://example.com/avatar.jpg',
      about: 'Hello world',
    })
    const hexPubkey = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'

    const profile = parseKind0Content(content, hexPubkey)
    expect(profile.id).toMatch(/^npub1/) // stored as npub
    expect(profile.handle).toBe('alice')
    expect(profile.displayName).toBe('Alice')
    expect(profile.avatar).toBe('https://example.com/avatar.jpg')
    expect(profile.description).toBe('Hello world')
  })

  it('should use nip05 as handle when name is missing', () => {
    const content = JSON.stringify({ nip05: 'alice@example.com' })
    const hex = 'abcd'.repeat(16)
    const profile = parseKind0Content(content, hex)
    expect(profile.handle).toBe('alice@example.com')
  })

  it('should fallback to truncated npub when no name or nip05', () => {
    const content = JSON.stringify({})
    const hex = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'
    const profile = parseKind0Content(content, hex)
    expect(profile.handle).toMatch(/^npub1.+…$/)
  })

  it('should handle invalid JSON gracefully', () => {
    const hex = 'abcd'.repeat(16)
    const profile = parseKind0Content('not json', hex)
    expect(profile.id).toMatch(/^npub1/)
    expect(profile.handle).toMatch(/^npub1/)
  })
})

describe('extractXmtpBinding', () => {
  it('should extract xmtp binding from kind 0 content', () => {
    const content = JSON.stringify({
      name: 'alice',
      xmtp: {
        inboxId: 'inbox-123',
        verificationSignature: 'c2lnbmF0dXJl', // base64
        createdAt: '2025-01-01T00:00:00Z',
      },
    })
    const result = extractXmtpBinding(content)
    expect(result).not.toBeNull()
    expect(result!.inboxId).toBe('inbox-123')
    expect(result!.verificationSignature).toBe('c2lnbmF0dXJl')
  })

  it('should return null when xmtp field is missing', () => {
    const content = JSON.stringify({ name: 'alice' })
    expect(extractXmtpBinding(content)).toBeNull()
  })

  it('should return null when xmtp field is malformed', () => {
    const content = JSON.stringify({ xmtp: { inboxId: 'abc' } }) // missing verificationSignature
    expect(extractXmtpBinding(content)).toBeNull()
  })

  it('should return null for invalid JSON', () => {
    expect(extractXmtpBinding('not json')).toBeNull()
  })
})
