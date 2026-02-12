/**
 * Bluesky/ATProto identity provider.
 *
 * Validates DID format and fetches XMTP inbox bindings from ATProto.
 */

import type { IdentityProviderService } from './identity'
import { fetchRecordFromPds } from './pds-resolution'

export class BlueskyIdentityProvider implements IdentityProviderService {
  isValidIdentity(id: string): boolean {
    return id.startsWith('did:plc:') || id.startsWith('did:web:')
  }

  isValidInboxId(inboxId: string): boolean {
    return /^[a-f0-9]+$/i.test(inboxId)
  }

  async verifyFromSource(did: string): Promise<{ inboxId: string; signature: string } | null> {
    try {
      const response = await fetchRecordFromPds(did, 'org.xmtp.inbox', 'self')

      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as {
        value?: { id?: string; verificationSignature?: string }
      }
      const record = data.value

      if (!record?.id || !record?.verificationSignature) {
        return null
      }

      return {
        inboxId: record.id,
        signature: record.verificationSignature,
      }
    } catch {
      return null
    }
  }
}
