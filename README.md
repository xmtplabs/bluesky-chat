# XMTP Chat with Bluesky Identity

[![Node 18+](https://img.shields.io/badge/node-18%2B-brightgreen)](https://nodejs.org)
[![Electron 40](https://img.shields.io/badge/electron-40-blue)](https://www.electronjs.org/)
[![XMTP SDK v6](https://img.shields.io/badge/xmtp--sdk-v6-orange)](https://xmtp.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

An open source reference app from [XMTP Labs](https://xmtp.org) demonstrating how to build secure messaging for Bluesky users.

This app publishes XMTP signatures to the `org.xmtp.inbox` AT Protocol record to cryptographically bind Bluesky handles to XMTP inboxes, enabling end-to-end encrypted DMs and group chats for the Bluesky network.

## Why

Bluesky doesn't have encrypted DMs or group chats. This app gives Bluesky users secure messaging—Signal-level encryption with forward secrecy and quantum resistance—on decentralized infrastructure.

<!-- TODO: Add screenshot
![App Screenshot](docs/screenshot.png)
-->

## Quick Start

```bash
pnpm install
pnpm dev
```

Log in with your Bluesky account.

## What is XMTP?

[XMTP](https://xmtp.org) (Extensible Message Transport Protocol) is an open protocol for secure, decentralized messaging:

- **End-to-end encrypted** — Only you and your recipient can read messages
- **Decentralized** — Messages live on the XMTP network, not a company's servers
- **Portable** — Your inbox works across any app built on XMTP

XMTP supports cryptographically verifiable identities. This app brings secure, encrypted chat to Bluesky by binding your `@handle.bsky.social` to an XMTP inbox.

## Features

- **End-to-end encrypted messaging** powered by XMTP
- **Bluesky identity integration** — log in with your Bluesky handle
- **Direct messages and group chats** (up to 250 members)
- **Desktop notifications** with badge counts
- **Secure key storage** using Electron's safeStorage API
- **Real-time message streaming**

## How Identity Works

This app creates a cryptographic link between your Bluesky account and an XMTP inbox.

**For you, this means:**
- Your `@handle.bsky.social` becomes your chat address
- Anyone can find and message you using your Bluesky handle
- Your messages are encrypted and stored on XMTP, not Bluesky

**How it works under the hood:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. Login          2. Generate Key      3. Create Inbox    4. Publish   │
│  ┌──────────┐      ┌──────────────┐     ┌─────────────┐   ┌──────────┐  │
│  │ Bluesky  │ ───▶ │  Ethereum    │ ──▶ │    XMTP     │ ─▶│ Bluesky  │  │
│  │  OAuth   │      │  Private Key │     │   Inbox     │   │  Record  │  │
│  └──────────┘      └──────────────┘     └─────────────┘   └──────────┘  │
│       │                   │                    │                │       │
│       ▼                   ▼                    ▼                ▼       │
│   Your DID         Stored locally        Your inbox ID      Signed     │
│  (did:plc:...)     in secure storage     on XMTP network    proof      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

When someone wants to message you:
1. They look up your `org.xmtp.inbox` record on Bluesky
2. They verify the cryptographic signature matches a key in your XMTP inbox
3. If valid, they know this Bluesky user controls this XMTP inbox

### Identity Resolution

When you search for a Bluesky user to message, the app fetches their `org.xmtp.inbox` record directly from their PDS.

For the reverse — identifying who sent you a message — the app uses [Jetstream](https://docs.bsky.app/blog/jetstream), Bluesky's real-time firehose, to watch for new `org.xmtp.inbox` records and build a lookup index.

### Using Multiple Devices

To use the same inbox on multiple devices, export your key from **Settings > Identity & Security** and import it on the new device. Each device creates an "installation" (up to 10 per inbox).

Note: Message history does not sync between devices yet. Each device will only see messages sent/received while it's active.

Keep your key backup safe—anyone with your private key can read your messages.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Electron 40 + Vite + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Messaging | `@xmtp/browser-sdk` v6 |
| Identity | `@atproto/api`, `@atproto/oauth-client-browser` |
| Crypto | `viem` (Ethereum key generation/signing) |
| Storage | Electron `safeStorage` for keys |

## Development

### Prerequisites

- Node.js 18+
- pnpm

### Commands

```bash
pnpm install     # Install dependencies
pnpm dev         # Run in development mode
pnpm build       # Build for production
pnpm dist        # Package for distribution
pnpm dist:beta   # Package beta build (with devtools)
pnpm dist:prod   # Package production build (no devtools)
pnpm test        # Run tests
```

### Build Modes

The app has three build modes with different developer tools access:

| Mode | Trigger | DevTools |
|------|---------|----------|
| Development | `pnpm dev` | Auto-opens on launch |
| Beta | Version contains `-beta` (e.g., `1.0.0-beta.1`) | View → Toggle Developer Tools |
| Production | Clean version (e.g., `1.0.0`) | Disabled |

Build mode is detected automatically from the version string — no environment variables needed.

### Code Signing (macOS)

To build signed and notarized apps locally:

1. Install the Developer ID certificate in your Keychain (get `.p12` from team admin)
2. Copy `.env.example` to `.env.local` and fill in your values
3. Source the env file and build:

```bash
source .env.local && pnpm dist:prod
```

Required environment variables (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `APPLE_ID` | Your Apple ID (must be added to XMTP team) |
| `APPLE_APP_SPECIFIC_PASSWORD` | From [appleid.apple.com](https://appleid.apple.com) → App-Specific Passwords |
| `APPLE_TEAM_ID` | Team ID (from Apple Developer portal or team admin) |

CI builds use GitHub Secrets — no local setup needed for releases.

### Project Structure

```
bluesky-chat/
├── electron/
│   ├── main.ts                 # Electron main process
│   ├── preload.ts              # IPC preload script
│   └── services/
│       ├── storage.ts          # Secure key storage
│       └── notifications.ts    # Desktop notifications
├── src/
│   ├── components/
│   │   ├── auth/               # Login flow
│   │   ├── chat/               # Chat UI, groups, message composer
│   │   ├── composer/           # Message input
│   │   ├── connection/         # XMTP connection status
│   │   ├── conversation/       # Conversation list
│   │   ├── layout/             # App layout
│   │   ├── onboarding/         # First-run experience
│   │   ├── profile/            # User profiles
│   │   ├── settings/           # App settings
│   │   └── shared/             # Reusable components
│   ├── hooks/                  # React hooks
│   ├── services/
│   │   ├── bluesky.ts          # Bluesky API
│   │   ├── xmtp.ts             # XMTP client
│   │   ├── signer.ts           # Ethereum signer for XMTP
│   │   ├── identity.ts         # Bluesky ↔ XMTP identity mapping
│   │   └── crypto.ts           # Encryption utilities
│   ├── stores/                 # Zustand state stores
│   ├── types/                  # TypeScript types
│   └── utils/                  # Utility functions
└── public/
    └── client-metadata.json    # OAuth client metadata
```

## Releasing

### Beta Release

```bash
pnpm release:beta   # Bumps to x.x.x-beta.N, creates tag, pushes
```

### Production Release

```bash
pnpm release        # Bumps patch version, creates tag, pushes
```

For minor or major releases:

```bash
npm version minor && git push --tags
npm version major && git push --tags
```

GitHub Actions builds for macOS, Windows, and Linux, then uploads artifacts to a draft release. Beta releases include developer tools access; production releases have devtools disabled.

## Authentication

### OAuth

Click "Login with Bluesky" to authenticate via OAuth. The app opens a window for Bluesky authentication.

### App Password

Alternatively, create an [App Password](https://bsky.app/settings/app-passwords) and log in with your handle and app password.

## Troubleshooting

### "Identity mismatch" warning

Your local inbox doesn't match your published Bluesky record. This happens if you logged in on a different device first or cleared app data.

**Options:**
- **Republish** — Update your Bluesky record to point to this device's inbox
- **Import key** — Import the backup from your original device

## License

MIT
