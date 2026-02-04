# Test-Driven Tauri Migration Plan

## Status Overview

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 | WASM Compatibility Spike | ✅ Complete |
| Phase 1 | Platform Abstraction Tests | ✅ Complete |
| Phase 2 | Platform Abstraction Layer | ✅ Complete |
| Phase 3 | Tauri Backend Implementation | ✅ Complete |
| Phase 4 | Integration into Main App | 🔲 Ready |

---

## ✅ Phase 0: WASM Compatibility (COMPLETE)

Validated XMTP's WASM bindings work in Tauri's native WebKit webview:
- WASM module loading ✅
- Web Crypto API (getRandomValues, SubtleCrypto ECDSA) ✅
- XMTP Client import ✅
- IndexedDB ✅

**Location:** `tauri-wasm-spike/`

---

## ✅ Phase 1 & 2: Platform Abstraction (COMPLETE)

Created platform-agnostic API layer:

```
src/platform/
├── types.ts      # PlatformAPI interface
├── electron.ts   # Electron implementation (wraps window.electronAPI)
├── tauri.ts      # Tauri implementation (IPC + events)
└── index.ts      # Platform detection & export
```

**105 tests passing** - all `window.electronAPI` calls migrated to `platform.*`

---

## ✅ Phase 3: Tauri Backend (COMPLETE)

### Implemented Commands

| Command | Implementation |
|---------|----------------|
| `get_build_mode` | Returns "development" or "production" via `cfg!(debug_assertions)` |
| `secure_store` | OS keychain via `keyring` crate with `apple-native` feature |
| `secure_retrieve` | OS keychain retrieval, returns `None` for missing keys |
| `secure_delete` | OS keychain deletion, idempotent |
| `open_oauth_window` | Opens URL via `tauri-plugin-opener` |
| `show_notification` | Native notifications via `tauri-plugin-notification` |
| `set_badge_count` | macOS dock badge via `objc2-app-kit` |

### OAuth Callback Handling

- Deep link handler via `tauri-plugin-deep-link`
- Custom URL scheme: `xmtp-bluesky://`
- OAuth callbacks emitted as `oauth-callback` Tauri event
- Frontend listens via `@tauri-apps/api/event`

### Rust Dependencies

```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
keyring = { version = "3", features = ["apple-native"] }
tauri-plugin-notification = "2"
tauri-plugin-opener = "2"
tauri-plugin-deep-link = "2"
url = "2"

[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6"
objc2-app-kit = { version = "0.3", features = ["NSApplication", "NSDockTile"] }
objc2-foundation = { version = "0.3", features = ["NSString"] }
```

### Test Results

```
Summary: 15 passed, 0 failed, 0 warnings
```

---

## 🔲 Phase 4: Integration into Main App (NEXT)

### Steps

1. **Copy Tauri backend to main project**
   ```bash
   cp -r tauri-wasm-spike/src-tauri ./
   ```

2. **Add Tauri dependencies to package.json**
   ```json
   {
     "scripts": {
       "tauri": "tauri",
       "tauri:dev": "tauri dev",
       "tauri:build": "tauri build"
     },
     "devDependencies": {
       "@tauri-apps/cli": "^2"
     },
     "dependencies": {
       "@tauri-apps/api": "^2"
     }
   }
   ```

3. **Update tauri.conf.json** for main app:
   - Change `productName`, `identifier`
   - Update `frontendDist` and `devUrl` paths
   - Configure window size/title

4. **Register OAuth callback URL** with Bluesky:
   - Callback: `xmtp-bluesky://oauth/callback`

5. **Manual Testing Checklist**
   - [ ] Login via Bluesky OAuth
   - [ ] XMTP key stored in keychain
   - [ ] Keys persist across app restarts
   - [ ] Notifications appear for new messages
   - [ ] Badge count updates on dock
   - [ ] Logout clears stored keys

---

## Running the Spike

```bash
cd tauri-wasm-spike
npm run tauri dev
```

## Running Tests

```bash
npm test
```
