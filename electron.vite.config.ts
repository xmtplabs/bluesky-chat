import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload.ts')
        }
      }
    }
  },
  renderer: {
    root: '.',
    server: {
      // Listen on 127.0.0.1 for AT Protocol OAuth loopback compatibility
      host: '127.0.0.1'
    },
    build: {
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
      },
      // Ensure single instance of wasm-bindings to avoid WASM conflicts
      dedupe: ['@xmtp/wasm-bindings']
    },
    optimizeDeps: {
      // XMTP browser SDK uses web workers that Vite's optimizer can't handle
      // wasm-bindings must also be excluded to preserve WASM loading
      exclude: ['@xmtp/browser-sdk', '@xmtp/wasm-bindings']
    }
  }
})
