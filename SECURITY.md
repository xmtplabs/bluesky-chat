# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities by opening a private security advisory on GitHub or by emailing security@xmtp.org.

We will respond within 48 hours and work with you to understand and address the issue.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |

## Security Measures

### Key Storage
- Private keys are stored using Electron's `safeStorage` API, which leverages OS-level secure storage (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
- Keys are encrypted at rest and only accessible by the application
- Per-DID key isolation prevents cross-account access

### Encryption
- End-to-end encryption via XMTP protocol
- Messages are encrypted using MLS (Messaging Layer Security)
- Local database encryption with AES-GCM

### Authentication
- OAuth 2.0 with PKCE for Bluesky authentication
- OAuth URLs validated against allowlist (bsky.social, bsky.app domains only)
- No credentials stored in plaintext

### Electron Security
- Context isolation enabled
- Node integration disabled in renderer process
- IPC handlers validate input (key prefix restrictions, length limits)
- No remote code execution

## Best Practices for Users

1. Keep your operating system and this application up to date
2. Use a strong password or biometric authentication for your device
3. Do not share your recovery phrases or private keys
4. Be cautious of phishing attempts
