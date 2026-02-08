// Minimal type declarations for Electron preload API used by the Bluesky provider.
// The full ElectronAPI is defined in the chassis (src/types/index.ts).
declare global {
  interface Window {
    electronAPI?: {
      openOAuthWindow: (url: string) => Promise<{ code: string; state: string; iss?: string } | null>
    }
  }
}

export {}
