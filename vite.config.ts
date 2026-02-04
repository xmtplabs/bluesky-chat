import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Standalone Vite config for Tauri builds
// Mirrors the renderer config from electron.vite.config.ts
export default defineConfig({
  root: '.',
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html')
      }
    }
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  optimizeDeps: {
    // Exclude XMTP SDK from dep optimization - it has workers that don't work with the optimizer
    exclude: ['@xmtp/browser-sdk', '@xmtp/wasm-bindings']
  },
  worker: {
    format: 'es'
  }
})
