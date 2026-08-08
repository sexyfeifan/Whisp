# macOS Notarization Guide

This guide explains how to set up Apple notarization for Whisp to eliminate Gatekeeper warnings on macOS.

## Current Status

Whisp DMG builds use **ad-hoc signing** (`codesign --force --deep --sign -`), which allows the app to run after `xattr -cr` but still shows Gatekeeper warnings.

Full notarization requires an **Apple Developer Program** membership ($99/year) and proper code signing.

## Prerequisites

1. Apple Developer Program membership
2. A `Developer ID Application` certificate in your Keychain
3. An App Store Connect API Key with Developer role

## GitHub Secrets to Configure

Set these in GitHub → Settings → Secrets → Actions:

| Secret | Description |
|--------|-------------|
| `MAC_CSC_LINK` | Base64-encoded `.p12` signing certificate |
| `MAC_CSC_KEY_PASSWORD` | Password for the `.p12` certificate |
| `APPLE_API_KEY` | Base64-encoded `.p8` App Store Connect API key |
| `APPLE_API_KEY_ID` | Key ID (e.g., `ABC123XYZ`) |
| `APPLE_API_ISSUER` | Issuer ID (UUID from App Store Connect) |

## Step-by-Step

### 1. Export Signing Certificate

In Keychain Access, find your `Developer ID Application` certificate → right-click → Export → `.p12` format → set a password.

```bash
base64 -i ~/Desktop/certificate.p12 | pbcopy
# Paste into MAC_CSC_LINK
```

### 2. Generate App Store Connect API Key

Visit https://appstoreconnect.apple.com/access/integrations/api → create key with **Developer** role → download `.p8`.

```bash
base64 -i ~/Downloads/AuthKey_XXXXXXXXXX.p8 | pbcopy
# Paste into APPLE_API_KEY
```

### 3. Enable Hardened Runtime

After configuring all 5 secrets, set `hardenedRuntime` back to `true` in `src-tauri/tauri.conf.json`:

```json
"macOS": {
  "hardenedRuntime": true,
  "minimumSystemVersion": "13.0",
  "signingIdentity": "Developer ID Application: Your Name (TEAMID)",
  "entitlements": "Entitlements.plist"
}
```

## CI Behavior

When all 5 secrets are present:
1. CI builds and signs the app with your Developer ID certificate
2. CI submits the signed app to Apple's notarization service
3. CI staples the notarization ticket to the app
4. CI rebuilds the DMG with the notarized app
5. Users can double-click to open with zero warnings

When secrets are missing (current state):
1. CI builds unsigned
2. CI applies ad-hoc signature (`codesign --sign -`)
3. Users need `xattr -cr` before opening
