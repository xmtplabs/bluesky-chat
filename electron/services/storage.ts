import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export class SecureStorage {
  private storagePath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.storagePath = join(userDataPath, 'secure-storage')

    if (!existsSync(this.storagePath)) {
      mkdirSync(this.storagePath, { recursive: true })
    }
  }

  private getFilePath(key: string): string {
    // Sanitize key for filename
    const safeKey = key.replace(/[^a-zA-Z0-9-_]/g, '_')
    return join(this.storagePath, `${safeKey}.enc`)
  }

  async store(key: string, value: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage not available')
    }

    const encrypted = safeStorage.encryptString(value)
    const filePath = this.getFilePath(key)
    writeFileSync(filePath, encrypted)
  }

  async retrieve(key: string): Promise<string | null> {
    const filePath = this.getFilePath(key)

    if (!existsSync(filePath)) {
      return null
    }

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage not available')
    }

    try {
      const encrypted = readFileSync(filePath)
      return safeStorage.decryptString(encrypted)
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key)

    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  }
}
