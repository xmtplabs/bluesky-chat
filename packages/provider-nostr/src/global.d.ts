declare global {
  // NIP-07 browser extension interface (Alby, nos2x, etc.)
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>
      signEvent(event: {
        kind: number
        created_at: number
        tags: string[][]
        content: string
      }): Promise<{
        id: string
        pubkey: string
        created_at: number
        kind: number
        tags: string[][]
        content: string
        sig: string
      }>
    }
    electronAPI?: {
      secureStore: (key: string, value: string) => Promise<void>
      secureRetrieve: (key: string) => Promise<string | null>
      secureDelete: (key: string) => Promise<void>
    }
  }
}

export {}
