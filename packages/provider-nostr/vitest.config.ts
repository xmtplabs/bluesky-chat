import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    root: __dirname,
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@bluesky-chat/provider-interface': resolve(__dirname, '../provider-interface/src'),
    },
  },
})
