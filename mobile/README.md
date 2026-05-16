# AssetHub Mobile

React Native + Expo client for AssetHub. Talks to the same backend you've already deployed (`api/` and `web/`). Optimized for Android, also runs on iOS and as a web build.

## What works

- Sign up / log in / multi-tenant
- QR scanner (rear camera, auto-redirects to asset detail)
- Asset list with search and pull-to-refresh
- Asset detail with photos, custom fields, history, tags
- Check-in / check-out / move actions
- Server URL configurable on first launch (so you can point it at your LAN IP)
- Works offline-friendly — TanStack Query caches assets you've already viewed
- Dark / light theme follows the system

## Prerequisites

- **Node.js 20+**
- **Android Studio** with an emulator OR a physical Android device with **Expo Go** installed
  - https://play.google.com/store/apps/details?id=host.exp.exponent
- An AssetHub backend running on your network

## Quick start

```powershell
cd "D:\Projects\Asset Managment\mobile"
npm install
npx expo start
```

This starts Metro on port 8081 and prints a QR code in the terminal. From there:

- **Physical Android:** open Expo Go → "Scan QR code" → point at the terminal QR. The app loads.
- **Android emulator:** in Expo Go terminal, press `a`. The emulator launches the app.
- **iOS simulator (macOS only):** press `i`.

## First launch

The app needs to know where your AssetHub API lives. On first launch it asks for the **Server URL**. Enter the same URL you use in your browser:

| Where you're testing | Server URL |
|---|---|
| Physical Android phone on your Wi-Fi | `https://192.168.x.x` (your laptop's LAN IP) |
| Android emulator | `https://10.0.2.2` (special host loopback) |
| Web build | `https://localhost` |

Pick **HTTPS** if your server uses Caddy with `tls internal` (it does by default). The app accepts any domain you type — there's a one-time validation that hits `/api/health`.

## The HTTPS / self-signed certificate problem

Your AssetHub backend uses Caddy's internal CA, which Android does not trust by default. You'll see a network error if you try to use HTTPS without help.

**Two fixes — pick one:**

### Option A — install Caddy's root cert on your phone (recommended)

```powershell
# On your laptop:
docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > caddy-root.crt
```

Email or AirDrop `caddy-root.crt` to your phone, then on Android:

1. Settings → Security → Encryption & credentials → Install a certificate → CA certificate
2. Trust the prompt and pick `caddy-root.crt`

After that, your phone trusts every cert Caddy issues. No more warnings.

### Option B — use plain HTTP for development

The `app.json` has `usesCleartextTraffic: true` so Android allows `http://` URLs. Set the Server URL to `http://192.168.x.x` (no `s`). The camera scanner still works because Expo Go bypasses some of Android's HTTPS-only enforcement.

You'll lose the camera permission grant on production builds (Android forbids cleartext + camera + secure-storage in some configurations). Use HTTPS + cert install for any real deployment.

## Project layout

```
mobile/
├── app.json              # Expo config; permissions, package id, scheme
├── package.json
├── tsconfig.json
├── babel.config.js
├── metro.config.js
├── app/                              # Expo Router (file-based, root-level)
│   ├── _layout.tsx                   # Root layout, providers
│   ├── index.tsx                     # Redirect: setup → login → tabs
│   ├── setup.tsx                     # First-launch server URL screen
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── signup.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx               # Bottom tab bar
│   │   ├── scan.tsx                  # QR scanner
│   │   ├── assets.tsx                # Asset list with search
│   │   └── profile.tsx               # Account, workspace, sign out
│   └── asset/[id].tsx                # Asset detail
└── src/                              # Non-route code (imported via @/...)
    ├── lib/
    │   ├── api.ts                    # HTTP client, types
    │   ├── auth.ts                   # AuthProvider, useAuth, useCan
    │   ├── server.ts                 # Server URL persistence
    │   └── theme.ts                  # Colors + spacing
    └── components/
        ├── Button.tsx
        ├── Card.tsx
        └── EmptyState.tsx
```

## Building a real APK

For testing on a phone without Expo Go (production-style build):

```powershell
npm install -g eas-cli
eas login
eas build --profile preview --platform android
```

EAS Build is free for solo developers up to 30 builds/month. The output is a downloadable `.apk` you can sideload onto any Android device.

For app store distribution, follow the full Expo guide: https://docs.expo.dev/distribution/introduction/

## Troubleshooting

**"Network request failed" on the login screen.** Your phone can't reach the API. Check:
1. Phone and laptop are on the same Wi-Fi.
2. Server URL has the right scheme (`http` vs `https`) and matches what your browser uses.
3. From your phone's browser, try the URL — does it load? If not, fix that first.

**Camera shows black screen.** Camera permission was denied. Settings → Apps → Expo Go → Permissions → Camera → Allow.

**"Cannot connect to Metro."** Restart `npx expo start` and rescan the QR. Or press `r` in the Metro terminal to reload.

**App says "Cert error" or "TLS handshake failed".** See the HTTPS section above. Install Caddy's root cert OR switch the Server URL to plain HTTP.

**Hot reload not working after editing.** Press `r` in the Metro terminal, or shake the phone → "Reload".
