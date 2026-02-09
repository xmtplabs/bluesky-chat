# Chassis Audit & Remediation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix violations of the pluggable identity chassis design and eliminate Bluesky-specific naming/hardcoding from `src/`.

**Architecture:** The chassis (`src/`) should be identity-agnostic. All Bluesky-specific code lives in `packages/provider-bluesky/`. The chassis accesses the provider exclusively through `@provider` and `ProviderConfig`. Variable names, comments, and UI strings in the chassis must not mention "Bluesky".

**Tech Stack:** TypeScript, React 19, Zustand 5, Vite 6 (electron-vite), pnpm workspaces

---

## Audit Findings

### Finding 1: `src/provider.ts` hardcodes Bluesky export names (BREAKING)

**Severity:** Critical — prevents building with any other provider.

```typescript
// Current — fails if CHAT_PROVIDER=nostr
export { blueskyProvider as provider, blueskyConfig as config } from '@provider'
```

Each provider package must export `provider` and `config` directly. The chassis re-export must be:

```typescript
export { provider, config } from '@provider'
```

### Finding 2: Auth store uses Bluesky-specific naming throughout (MAJOR)

**Severity:** High — 50+ references across stores, hooks, and components.

The auth store state and actions use `blueskyProfile`, `isBlueskyLoggedIn`, `loginWithBluesky`, `loginWithBlueskyPassword`. Every consumer (components, hooks, other stores) inherits these names. Should be `profile`, `isLoggedIn`, `login`, `loginWithPassword`.

**Files affected (non-exhaustive):**
- `src/stores/authStore.ts` — state fields and action names (~50 occurrences)
- `src/stores/authStore.test.ts` — test mocks
- `src/hooks/useIdentity.ts` — destructures and re-exports these names
- `src/stores/chatStore.ts` — cross-store access (`useAuthStore.getState().blueskyProfile`)
- `src/stores/profileStore.ts` — cross-store access (5 occurrences)
- `src/components/connection/ConnectionProviderBridge.tsx` (~20 occurrences)
- `src/components/settings/SettingsProviderBridge.tsx`
- `src/components/settings/variants/DevTools.tsx` (~20 occurrences)
- `src/components/settings/shared/BackupForm.tsx`
- `src/components/settings/shared/RestoreForm.tsx`
- `src/components/settings/context/SettingsContext.ts`
- `src/components/connection/context/ConnectionContext.ts`
- `src/components/onboarding/BackupPromptBanner.tsx`
- `src/components/profile/UserProfileModal.tsx`
- `src/components/conversation/ConversationListView.tsx`
- `src/components/chat/new-conversation/NewConversationProviderBridge.tsx`
- `src/components/connection/variants/RestoreOpportunity.tsx`
- `src/components/settings/variants/IdentityStatus.tsx`
- `src/App.tsx`

### Finding 3: Hardcoded Bluesky UI strings in chassis (MEDIUM)

**Severity:** Medium — user-visible strings that break for non-Bluesky builds.

| File | String | Should Be |
|------|--------|-----------|
| `Sidebar.tsx:47` | "Bluesky Chat" | `config.name + " Chat"` or just "Chat" |
| `SearchInput.tsx:30` | "Search Bluesky users..." | `"Search " + config.name + " users..."` or "Search users..." |
| `SearchInput.tsx:32` | aria-label "Search Bluesky users" | Same |
| `IdentityStatus.tsx:28` | "Bluesky" fallback | `config.name` |
| `IdentityStatus.tsx:69` | "Bluesky Identity" | `config.name + " Identity"` |
| `IdentityStatus.tsx:141` | "Bluesky identity" | `config.name + " identity"` |
| `NotificationSettings.tsx:84` | "Bluesky Chat uses..." | `config.name + " Chat uses..."` |
| `NotificationSettings.tsx:102` | "Bluesky" link text | `config.name` |
| `DevTools.tsx:151` | "Delete your org.xmtp.inbox record from Bluesky?" | generic or config-driven |
| `LoginScreen.tsx:98-109` | "bsky.app/settings/app-passwords" link | Should be in `ProviderConfig` or provider-specific component |

### Finding 4: Chassis service comments say "Bluesky" (MINOR)

**Severity:** Low — developer-facing only, but confusing for future providers.

- `signer.ts` — 5 JSDoc comments mention "Bluesky DID"
- `identity.ts` — 4 comments say "Bluesky DID"
- `xmtp.ts:1104` — "Bluesky DID and XMTP inbox"
- `resolveUsers.ts:5` — "Bluesky profiles"
- `useXmtpStatusChecker.ts:6` — "Bluesky users"
- `chatStore.ts:445` — "follows on Bluesky"

### Finding 5: `provider-bluesky` is a monolith wrapper (DESIGN DEBT)

**Severity:** Low — functional but doesn't match design doc structure.

Design specifies `auth.ts`, `profiles.ts`, `identity.ts`, `social.ts`. Actual structure is `bluesky.ts` (monolith) + `provider.ts` (thin adapter). The extraction was a move, not a decomposition.

### Finding 6: `identity.ts` methods use "Did" naming (MEDIUM)

**Severity:** Medium — API surface uses Bluesky-specific terminology.

Methods `getDidFromInboxId`, `getInboxIdFromDid`, `resolveDidToInbox`, `resolveInboxToDid`, `bulkResolveDidToInbox`, `bulkResolveInboxToDid`, `resolveDidToInboxCached`, `getMappingByDid`, `getHandleFromInboxId` use "Did" in names. In the chassis, these should use "Id" (since a DID is just the identity ID for Bluesky).

**Consumers:** `authStore.ts`, `chatStore.ts`, `connectionProviderBridge.tsx`, `devTools.tsx`, identity tests.

### Finding 7: `mappingBackend.ts` hardcodes Bluesky backend URL (MINOR)

**Severity:** Low — overridable via env var, but fallback is Bluesky-specific.

```typescript
const BACKEND_URL = import.meta.env.VITE_MAPPING_BACKEND_URL ?? 'https://bluesky-chat-mapping-service.xmtp.workers.dev'
```

Should use `config.mappingServiceUrl` from the provider, falling back to env var.

### Finding 8: `LoginScreen.tsx` has Bluesky-specific UX (MEDIUM)

**Severity:** Medium — password placeholder "xxxx-xxxx-xxxx-xxxx" and link to bsky.app are Bluesky-specific.

The password help text and link should be driven by `ProviderConfig` (e.g. `passwordHelp?: { placeholder: string; url: string; label: string }`).

### Finding 9: `BlueskyProfile.tsx` component name (MINOR)

**Severity:** Low — component file and function name are Bluesky-specific.

Should be renamed to `IdentityProfile.tsx` / `IdentityProfile()`.

### Finding 10: No tests for `provider-bluesky` adapter (MEDIUM)

**Severity:** Medium — `bluesky.test.ts` was deleted, no replacement tests for `provider.ts`.

---

## Remediation Tasks

### Task 1: Fix `src/provider.ts` and provider package exports

**Files:**
- Modify: `src/provider.ts`
- Modify: `packages/provider-bluesky/src/index.ts`
- Modify: `packages/provider-bluesky/src/provider.ts`

**Step 1: Update provider-bluesky to export generic names**

In `packages/provider-bluesky/src/provider.ts`, add at the bottom:
```typescript
export { blueskyProvider as provider }
export { blueskyConfig as config }
```

In `packages/provider-bluesky/src/index.ts`:
```typescript
export { provider, config } from './provider'
export type { IdentityProvider, ProviderConfig, UserProfile, IdentityMapping } from '@bluesky-chat/provider-interface'
```

**Step 2: Update chassis re-export**

In `src/provider.ts`:
```typescript
export { provider, config } from '@provider'
export type { IdentityProvider, ProviderConfig, UserProfile, IdentityMapping } from '@provider'
```

**Step 3: Run `npx tsc --noEmit` to verify**

**Step 4: Commit**
```
fix: export generic provider/config names from provider packages
```

### Task 2: Rename auth store state and actions

**Files:**
- Modify: `src/stores/authStore.ts`
- Modify: `src/stores/authStore.test.ts`

Rename in `authStore.ts`:
- `blueskyProfile` → `profile`
- `isBlueskyLoggedIn` → `isLoggedIn`
- `loginWithBluesky` → `login`
- `loginWithBlueskyPassword` → `loginWithPassword`

This is a large `replace_all` operation across the file. The test file needs matching updates.

**Step 1: Apply renames in `authStore.ts`**

Use `replace_all` for each rename:
- `blueskyProfile` → `profile` (state field + all references)
- `isBlueskyLoggedIn` → `isLoggedIn`
- `loginWithBluesky:` → `login:` (action name, careful not to catch the password variant)
- `loginWithBlueskyPassword` → `loginWithPassword`

**Step 2: Apply same renames in `authStore.test.ts`**

**Step 3: Run `npx tsc --noEmit`**

Expected: Many downstream errors in files that destructure these names.

**Step 4: Commit (partial — downstream fixes in Task 3)**

Do NOT commit yet — proceed to Task 3.

### Task 3: Update all auth store consumers

**Files:** Every file that imports from `authStore` and uses old names.

For each file, update destructuring patterns:
- `blueskyProfile` → `profile`
- `isBlueskyLoggedIn` → `isLoggedIn`
- `loginWithBluesky` → `login`
- `loginWithBlueskyPassword` → `loginWithPassword`

Files (from Finding 2 list):
- `src/hooks/useIdentity.ts`
- `src/stores/chatStore.ts`
- `src/stores/profileStore.ts`
- `src/App.tsx`
- `src/components/connection/ConnectionProviderBridge.tsx`
- `src/components/connection/context/ConnectionContext.ts`
- `src/components/connection/variants/RestoreOpportunity.tsx`
- `src/components/settings/SettingsProviderBridge.tsx`
- `src/components/settings/context/SettingsContext.ts`
- `src/components/settings/variants/DevTools.tsx`
- `src/components/settings/shared/BackupForm.tsx`
- `src/components/settings/shared/RestoreForm.tsx`
- `src/components/settings/variants/IdentityStatus.tsx`
- `src/components/onboarding/BackupPromptBanner.tsx`
- `src/components/profile/UserProfileModal.tsx`
- `src/components/conversation/ConversationListView.tsx`
- `src/components/chat/new-conversation/NewConversationProviderBridge.tsx`

**Step 1: Apply renames across all consumer files**

For most files this is `blueskyProfile` → `profile` in destructuring and usage. Some files use the full `useAuthStore.getState().blueskyProfile` pattern.

**Step 2: Run `npx tsc --noEmit`**

Expected: Only pre-existing `app.dock` errors.

**Step 3: Run `pnpm test`**

Expected: All 75 tests pass.

**Step 4: Commit**
```
refactor: rename bluesky-specific auth store fields to generic names
```

### Task 4: Rename `identity.ts` method names from "Did" to "Id"

**Files:**
- Modify: `src/services/identity.ts`
- Modify: `src/services/identity.test.ts`

Rename methods:
- `getDidFromInboxId` → `getIdFromInboxId`
- `getInboxIdFromDid` → `getInboxIdFromId`
- `resolveDidToInbox` → `resolveIdToInbox`
- `resolveInboxToDid` → `resolveInboxToId`
- `bulkResolveDidToInbox` → `bulkResolveIdToInbox`
- `bulkResolveInboxToDid` → `bulkResolveInboxToId`
- `resolveDidToInboxCached` → `resolveIdToInboxCached`
- `getMappingByDid` → `getMappingById`
- `uncacheMapping(did)` param name → `uncacheMapping(id)`

**Step 1: Apply method renames in `identity.ts`**

**Step 2: Apply method renames in `identity.test.ts`**

**Step 3: Fix all callers**

Callers in: `authStore.ts`, `chatStore.ts`, `connectionProviderBridge.tsx`, `devTools.tsx`, `resolveUsers.ts`, and any other files that call identity service methods.

**Step 4: Run `npx tsc --noEmit` and `pnpm test`**

**Step 5: Commit**
```
refactor: rename identity service methods from Did to Id
```

### Task 5: Fix hardcoded Bluesky UI strings

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/chat/new-conversation/variants/SearchInput.tsx`
- Modify: `src/components/settings/variants/IdentityStatus.tsx`
- Modify: `src/components/settings/NotificationSettings.tsx`
- Modify: `src/components/settings/variants/DevTools.tsx`

**Step 1: Import `config` from `../../provider` (or appropriate relative path) in each file**

**Step 2: Replace hardcoded strings**

- `"Bluesky Chat"` → `` `${config.name} Chat` ``
- `"Search Bluesky users..."` → `` `Search ${config.name} users...` ``
- `"Bluesky Identity"` → `` `${config.name} Identity` ``
- `"Bluesky"` (standalone) → `config.name`
- DevTools confirm dialog: make generic

**Step 3: Run `npx tsc --noEmit`**

**Step 4: Commit**
```
refactor: replace hardcoded Bluesky strings with config-driven text
```

### Task 6: Make `LoginScreen.tsx` provider-agnostic

**Files:**
- Modify: `packages/provider-interface/src/index.ts` — extend `ProviderConfig`
- Modify: `packages/provider-bluesky/src/provider.ts` — populate new config fields
- Modify: `src/components/auth/LoginScreen.tsx`

**Step 1: Add password help config to `ProviderConfig`**

```typescript
export interface ProviderConfig {
  // ... existing fields ...
  passwordHelp?: {
    placeholder: string  // "xxxx-xxxx-xxxx-xxxx"
    url: string          // "https://bsky.app/settings/app-passwords"
    label: string        // "Create an app password"
    linkText: string     // "bsky.app/settings/app-passwords"
  }
}
```

**Step 2: Populate in `blueskyConfig`**

**Step 3: Update `LoginScreen.tsx` to read from `config.passwordHelp`**

**Step 4: Run `npx tsc --noEmit` and `pnpm test`**

**Step 5: Commit**
```
refactor: make LoginScreen password help config-driven
```

### Task 7: Rename `BlueskyProfile.tsx` component

**Files:**
- Rename: `src/components/profile/BlueskyProfile.tsx` → `src/components/profile/IdentityProfile.tsx`
- Update imports in any file that references `BlueskyProfile`

**Step 1: Find all imports of `BlueskyProfile`**

**Step 2: Rename file and update component name**

**Step 3: Update all imports**

**Step 4: Run `npx tsc --noEmit`**

**Step 5: Commit**
```
refactor: rename BlueskyProfile component to IdentityProfile
```

### Task 8: Update chassis comments to be provider-agnostic

**Files:**
- Modify: `src/services/signer.ts` — 5 JSDoc comments
- Modify: `src/services/identity.ts` — 4 comments
- Modify: `src/services/xmtp.ts` — 1 comment
- Modify: `src/utils/resolveUsers.ts` — 1 comment
- Modify: `src/hooks/useXmtpStatusChecker.ts` — 1 comment
- Modify: `src/stores/chatStore.ts` — 1 comment

**Step 1: Replace "Bluesky DID" → "identity ID" (or just "DID" where the concept is general)**

Replace "Bluesky" in comments with generic language:
- "Bluesky DID" → "identity ID"
- "Bluesky account" → "identity"
- "Bluesky profiles" → "user profiles"
- "Bluesky users" → "users"
- "follows on Bluesky" → "follows via their identity provider"

**Step 2: Commit**
```
docs: update chassis comments to be provider-agnostic
```

### Task 9: Wire `mappingBackend.ts` to use `config.mappingServiceUrl`

**Files:**
- Modify: `src/services/mappingBackend.ts`

**Step 1: Import config and use it for backend URL**

```typescript
import { config } from '../provider'

const BACKEND_URL = import.meta.env.VITE_MAPPING_BACKEND_URL
  ?? config.mappingServiceUrl
  ?? 'https://bluesky-chat-mapping-service.xmtp.workers.dev'
```

Note: Keep the env var override for development flexibility, and the hardcoded fallback as last resort.

**Step 2: Run `npx tsc --noEmit`**

**Step 3: Commit**
```
refactor: use provider config for mapping backend URL
```

---

## Out of Scope (Intentional)

- **Provider-bluesky decomposition** (Finding 5) — Functional as-is. Decompose when adding a second provider.
- **Provider-bluesky tests** (Finding 10) — The service logic is tested via integration. Write unit tests when the provider adapter gains complexity.
- **CSS variable names** (`color-bsky-*`) — These are the design system, not identity-specific. A Nostr build can still use blue as its accent color.
- **Nostr provider** (Phase 6 of design) — Separate branch.
