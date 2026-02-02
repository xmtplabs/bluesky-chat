import {
  Client,
  type Signer,
  type DecodedMessage,
  type Identifier,
  type GroupMember,
  type Group,
  type Dm,
  IdentifierKind,
  ConversationType
} from '@xmtp/browser-sdk'

// Use production network for built distributions, dev for development
const XMTP_ENV = import.meta.env.MODE === 'production' ? 'production' : 'dev'
console.log(`XMTP environment: ${XMTP_ENV}`)

// The SDK uses different types for Group and DM conversations
type XMTPConversation = Group | Dm

export type MessageCallback = (message: DecodedMessage) => void
export type ConversationCallback = (conversation: XMTPConversation) => void

class XMTPService {
  private client: Client | null = null
  private messageStreamActive = false
  private conversationStreamActive = false

  async init(signer: Signer): Promise<Client> {
    console.log('XMTPService.init: Creating client with signer...')
    console.log('Signer identifier:', signer.getIdentifier())
    try {
      // Use default dbPath which persists in IndexedDB.
      // The browser-sdk stores the database in IndexedDB automatically.
      // This ensures the same installation is reused across app restarts,
      // avoiding the 10-installation limit per inbox.
      this.client = await Client.create(signer, {
        env: XMTP_ENV
      })
      console.log('XMTPService.init: Client created successfully')
      console.log('XMTPService.init: Installation ID:', this.client.installationId)
      return this.client
    } catch (error) {
      console.error('XMTPService.init: Client creation failed:', error)
      console.error('Error type:', error?.constructor?.name)
      console.error('Error message:', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  getClient(): Client | null {
    return this.client
  }

  getInboxId(): string | undefined {
    return this.client?.inboxId
  }

  getAccountIdentifier(): Identifier | undefined {
    return this.client?.accountIdentifier
  }

  async getConversations(): Promise<XMTPConversation[]> {
    if (!this.client) throw new Error('XMTP client not initialized')

    await this.client.conversations.sync()
    const conversations = await this.client.conversations.list()
    return conversations
  }

  async createDm(peerInboxId: string): Promise<XMTPConversation> {
    if (!this.client) throw new Error('XMTP client not initialized')

    const conversation = await this.client.conversations.createDm(peerInboxId)
    return conversation
  }

  async createDmByAddress(peerAddress: string): Promise<XMTPConversation> {
    if (!this.client) throw new Error('XMTP client not initialized')

    const identifier: Identifier = {
      identifier: peerAddress.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum
    }

    // Check if they can receive messages
    const canMessageResult = await Client.canMessage([identifier], XMTP_ENV)
    if (!canMessageResult.get(peerAddress.toLowerCase())) {
      throw new Error('Peer is not registered on XMTP')
    }

    // Create DM by identifier
    const conversation = await this.client.conversations.createDmWithIdentifier(identifier)
    return conversation
  }

  async createGroup(
    memberInboxIds: string[],
    options?: { name?: string; description?: string }
  ): Promise<XMTPConversation> {
    if (!this.client) throw new Error('XMTP client not initialized')

    const conversation = await this.client.conversations.createGroup(memberInboxIds, {
      groupName: options?.name,
      groupDescription: options?.description
    })

    return conversation
  }

  async getConversation(conversationId: string): Promise<XMTPConversation | undefined> {
    if (!this.client) throw new Error('XMTP client not initialized')

    const conversation = await this.client.conversations.getConversationById(conversationId)
    return conversation
  }

  async getMessages(conversation: XMTPConversation): Promise<DecodedMessage[]> {
    await conversation.sync()
    const messages = await conversation.messages()
    return messages
  }

  async sendMessage(conversation: XMTPConversation, content: string): Promise<string> {
    const messageId = await conversation.sendText(content)
    await conversation.publishMessages()
    return messageId
  }

  async streamMessages(callback: MessageCallback): Promise<void> {
    if (!this.client) throw new Error('XMTP client not initialized')

    this.messageStreamActive = true
    const stream = await this.client.conversations.streamAllMessages()

    try {
      for await (const message of stream) {
        if (!this.messageStreamActive) break
        callback(message)
      }
    } catch (error) {
      console.error('Message stream error:', error)
    }
  }

  async streamConversations(callback: ConversationCallback): Promise<void> {
    if (!this.client) throw new Error('XMTP client not initialized')

    this.conversationStreamActive = true
    const stream = await this.client.conversations.stream()

    try {
      for await (const conversation of stream) {
        if (!this.conversationStreamActive) break
        callback(conversation)
      }
    } catch (error) {
      console.error('Conversation stream error:', error)
    }
  }

  stopStreaming(): void {
    this.messageStreamActive = false
    this.conversationStreamActive = false
  }

  async canMessage(addresses: string[]): Promise<Map<string, boolean>> {
    const identifiers: Identifier[] = addresses.map((addr) => ({
      identifier: addr.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum
    }))

    return Client.canMessage(identifiers, XMTP_ENV)
  }

  async findInboxIdByAddress(address: string): Promise<string | null> {
    if (!this.client) throw new Error('XMTP client not initialized')

    const identifier: Identifier = {
      identifier: address.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum
    }

    const inboxId = await this.client.fetchInboxIdByIdentifier(identifier)
    return inboxId || null
  }

  async getMembers(conversation: XMTPConversation): Promise<GroupMember[]> {
    return conversation.members()
  }

  isGroup(conversation: XMTPConversation): conversation is Group {
    // Use the SDK's native conversationType from metadata
    return conversation.metadata?.conversationType === ConversationType.Group
  }

  getGroupName(conversation: XMTPConversation): string | undefined {
    if (this.isGroup(conversation)) {
      return conversation.name
    }
    return undefined
  }

  getGroupDescription(conversation: XMTPConversation): string | undefined {
    if (this.isGroup(conversation)) {
      return conversation.description
    }
    return undefined
  }

  getGroupImageUrl(conversation: XMTPConversation): string | undefined {
    if (this.isGroup(conversation)) {
      return conversation.imageUrl
    }
    return undefined
  }

  // Group admin methods

  async updateGroupName(group: Group, name: string): Promise<void> {
    await group.updateName(name)
  }

  async updateGroupDescription(group: Group, description: string): Promise<void> {
    await group.updateDescription(description)
  }

  async updateGroupImageUrl(group: Group, imageUrl: string): Promise<void> {
    await group.updateImageUrl(imageUrl)
  }

  async addGroupMembers(group: Group, inboxIds: string[]): Promise<void> {
    await group.addMembers(inboxIds)
  }

  async removeGroupMembers(group: Group, inboxIds: string[]): Promise<void> {
    await group.removeMembers(inboxIds)
  }

  async addGroupAdmin(group: Group, inboxId: string): Promise<void> {
    await group.addAdmin(inboxId)
  }

  async removeGroupAdmin(group: Group, inboxId: string): Promise<void> {
    await group.removeAdmin(inboxId)
  }

  async addGroupSuperAdmin(group: Group, inboxId: string): Promise<void> {
    await group.addSuperAdmin(inboxId)
  }

  async removeGroupSuperAdmin(group: Group, inboxId: string): Promise<void> {
    await group.removeSuperAdmin(inboxId)
  }

  async getGroupAdmins(group: Group): Promise<string[]> {
    return group.listAdmins()
  }

  async getGroupSuperAdmins(group: Group): Promise<string[]> {
    return group.listSuperAdmins()
  }

  async isGroupAdmin(group: Group, inboxId: string): Promise<boolean> {
    return group.isAdmin(inboxId)
  }

  async isGroupSuperAdmin(group: Group, inboxId: string): Promise<boolean> {
    return group.isSuperAdmin(inboxId)
  }

  async disconnect(): Promise<void> {
    this.stopStreaming()
    if (this.client) {
      this.client.close()
    }
    this.client = null
  }

  /**
   * Get the current installation ID
   */
  getInstallationId(): string | undefined {
    return this.client?.installationId
  }

  /**
   * Get the number of active installations for the current inbox.
   * XMTP has a limit of 10 installations per inbox.
   */
  async getInstallationCount(): Promise<number> {
    if (!this.client?.inboxId) return 0

    try {
      const inboxStates = await Client.fetchInboxStates([this.client.inboxId], XMTP_ENV)
      if (!inboxStates || inboxStates.length === 0) {
        return 0
      }
      return inboxStates[0].installations.length
    } catch (error) {
      console.error('Failed to get installation count:', error)
      return 0
    }
  }

  /**
   * Revoke all other installations except the current one.
   * Use this if you've hit the 10-installation limit.
   */
  async revokeAllOtherInstallations(): Promise<void> {
    if (!this.client) {
      throw new Error('XMTP client not initialized')
    }

    console.log('Revoking all other installations...')
    await this.client.revokeAllOtherInstallations()
    console.log('All other installations revoked')
  }
}

export const xmtpService = new XMTPService()
export type { XMTPConversation, GroupMember }
export { Client }

/**
 * Convert base64 string to Uint8Array (browser-compatible)
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/**
 * Verify that a signature was created by an installation key belonging to the given inbox.
 * Used to verify the cryptographic binding between a Bluesky DID and XMTP inbox.
 * Requires an initialized client to verify signatures.
 */
export async function verifyInboxOwnership(
  inboxId: string,
  did: string,
  signature: string
): Promise<boolean> {
  const client = xmtpService.getClient()
  if (!client) {
    console.warn('Cannot verify inbox ownership: XMTP client not initialized')
    return false
  }

  console.log('Verifying inbox ownership:', { inboxId: inboxId.slice(0, 16) + '...', did })

  try {
    const inboxStates = await Client.fetchInboxStates([inboxId], XMTP_ENV)
    if (!inboxStates || inboxStates.length === 0) {
      console.warn('No inbox state found for inboxId:', inboxId.slice(0, 16) + '...')
      return false
    }

    const inboxState = inboxStates[0]
    const signatureBytes = base64ToUint8Array(signature)
    console.log(`Checking ${inboxState.installations.length} installations for valid signature`)

    // Check if any installation key in the inbox can verify the signature
    for (let i = 0; i < inboxState.installations.length; i++) {
      const installation = inboxState.installations[i]
      try {
        const isValid = await client.verifySignedWithPublicKey(did, signatureBytes, installation.bytes)
        if (isValid) {
          console.log(`Signature verified by installation ${i}`)
          return true
        }
      } catch (verifyError) {
        console.log(`Installation ${i} verify error:`, verifyError)
      }
    }
    console.warn('No installation could verify the signature')
  } catch (error) {
    console.error('Error verifying inbox ownership:', error)
  }

  return false
}
