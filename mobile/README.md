# AssetHub Mobile

React Native + Expo client for AssetHub. Talks to the production backend at
**https://www.asset-hub.uk** out of the box, or any self-hosted AssetHub
instance you point it at. Optimised for Android (also runs on iOS and web).

## What works

- Dashboard with KPIs (total / in service / in repair / warranty soon) and
  recently-added assets
- Sign up / log in / forgot password / multi-tenant workspace switching
- QR scanner (rear camera; auto-routes to the asset OR unit page depending
  on what was scanned)
- Manual code entry as a scanner fallback
- Asset list with search and pull-to-refresh
- Asset detail with photos, custom fields, history, tags, and inline
  check-in / check-out / move actions
- **Per-unit tracking**: the asset page shows the unit list when an asset is
  unit-tracked; tapping a unit opens its dedicated page with its own
  check-in / check-out flow and barcode
- Asset create form (Members with `assets:write` permission)
- Photo upload from camera or gallery on asset detail
- Maintenance tickets list with status filters
- In-app notifications inbox with unread badge on the tab bar
- Profile / workspace switcher / change-server / sign out
- Dark / light theme follows the system
- TanStack Query caches everything, so screens are instant the second time

## Default server

The app ships pointing at **https://www.asset-hub.uk** so users can install
and sign in without configuring anything. If you run your own AssetHub
instance, go to **Profile → Server → Change server** and enter your URL.

The default is read from `app.json` (`expo.extra.defaultServerUrl`) — override
it per-environment without touching code.

## Prerequisites

- **Node.js 20+**
- One of:
  - **Android Studio** with an emulator, **or**
  - A physical Android device with **Expo Go**
    (https://play.google.com/store/apps/details?id=host.exp.exponent), **or**
  - An EAS-built APK installed via sideload (see "Build an APK" below)

## Quick start (development)

```powershell
cd "D:\Projects\Asset Managment\mobile"
npm install
npx expo start
```

- **Physical Android:** open Expo Go → "Scan QR code" → point at the terminal
  QR. The app loads against the production server (`asset-hub.uk`).
- **Android emulator:** press `a` in the Metro terminal.
- **iOS simulator (macOS only):** press `i`.
- **Web:** press `w`.

To point at a local backend for development, sign in once with any credentials
(or skip), then **Profile → Server → Change server** → enter your LAN URL
(e.g. `http://192.168.1.42`, or `https://10.0.2.2` from an emulator).

## Build an APK (Android)

EAS Build produces a real APK you can sideload onto any Android phone.

```powershell
npm install -g eas-cli
eas login                              # one-time
eas build --profile preview --platform android
```

Three profiles are configured in `eas.json`:

| Profile      | Output             | Channel    | Distribution            |
|--------------|--------------------|------------|-------------------------|
| `development`| APK (debug)        | —          | internal (dev client)   |
| `preview`    | APK (release)      | preview    | internal (sideload-friendly) |
| `production` | App Bundle (.aab)  | production | Play Store              |

Both `preview` and `production` set `EXPO_PUBLIC_API_BASE_URL=https://www.asset-hub.uk`.

EAS Build is free for solo developers up to 30 builds / month.

## Android compatibility checklist

The app targets Expo SDK 54 (React Native 0.81). `app.json` is already
configured for Android with:

- **Package id:** `com.assethub.mobile`
- **versionCode** + **version** for Play Store releases
- **Permissions:**
  - `CAMERA` — QR scanner + photo capture
  - `INTERNET` + `ACCESS_NETWORK_STATE` — API calls
  - `VIBRATE` — touch feedback
  - `POST_NOTIFICATIONS` — declared for when push lands (no runtime
    notifications yet)
- **`edgeToEdgeEnabled: true`** — required for Android 15 (API 35) since it
  enforces edge-to-edge by default. All screens use `SafeAreaView` so content
  isn't drawn behind the system bars.
- **Adaptive icon** (`./assets/adaptive-icon.png` foreground +
  `#0A0A0A` background) — works for round, squircle, and rectangular
  launcher themes.
- **`softwareKeyboardLayoutMode: "pan"`** — keeps the keyboard from
  resizing forms.
- **`newArchEnabled: true`** — uses React Native's New Architecture (Fabric
  + TurboModules) for better performance on modern devices.
- **`usesCleartextTraffic: true`** — kept for users who self-host without
  TLS. The default production URL is HTTPS, so this only matters for
  development.

### Supported devices

- **Min SDK:** 24 (Android 7.0 Nougat) — the Expo SDK 54 default
- **Target SDK:** 35 (Android 15) — also the default
- Works on phones and tablets in portrait; tablets get full-width layouts.

### Required runtime permissions

The app asks for these on first use, never up-front:

| Permission       | When asked                                            |
|------------------|-------------------------------------------------------|
| Camera           | When you tap "Start camera" on the Scan tab, or       |
|                  | the camera icon on an asset's Photos card             |
| Photo library    | When you tap the gallery icon on an asset's Photos    |
| Notifications    | Not yet asked (declared for future push support)      |

Tokens and the server URL go into `expo-secure-store`, which uses
Android Keystore — never plain `AsyncStorage`.

## Self-hosted backends with self-signed certs

If you host AssetHub yourself behind Caddy's `tls internal` (default in the
`docker-compose.yml`), the device must trust Caddy's root CA. Two options:

### A. Install Caddy's root cert on the device (recommended)

```powershell
docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > caddy-root.crt
```

Email or AirDrop `caddy-root.crt` to your phone, then on Android:

1. Settings → Security → Encryption & credentials → Install a certificate →
   CA certificate
2. Trust the prompt and pick `caddy-root.crt`

### B. Use plain HTTP for development

`usesCleartextTraffic: true` is already set, so `http://192.168.x.x` works in
debug builds. Production builds should always use HTTPS.

## Project layout

```
mobile/
├── app.json                          # Expo config; permissions, package id, EAS extras
├── eas.json                          # EAS build profiles
├── package.json
├── tsconfig.json
├── babel.config.js
├── metro.config.js
├── assets/                           # icon, adaptive-icon, splash, favicon
├── app/                              # Expo Router (file-based routes)
│   ├── _layout.tsx                   # Providers, Stack
│   ├── index.tsx                     # Entry redirect → login or tabs
│   ├── setup.tsx                     # Optional server-URL setup
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── forgot-password.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx               # Bottom tab bar + unread badge
│   │   ├── dashboard.tsx             # KPIs + recent assets
│   │   ├── scan.tsx                  # QR scanner
│   │   ├── assets.tsx                # Asset list + "+" to create
│   │   ├── maintenance.tsx           # Tickets list with filters
│   │   ├── notifications.tsx         # Inbox with mark-read
│   │   └── profile.tsx               # Profile + workspace switcher
│   └── asset/
│       ├── [id]/
│       │   ├── index.tsx             # Asset detail (photos, units, history)
│       │   └── units/[unitId].tsx    # Per-unit detail + check-in/out
│       └── new/index.tsx             # Create asset form
└── src/                              # Non-route code, imported via @/...
    ├── lib/
    │   ├── api.ts                    # HTTP client + DTO re-exports
    │   ├── auth.ts                   # AuthProvider, useAuth, useCan
    │   ├── server.ts                 # Default + custom server URL
    │   └── theme.ts                  # Colors + spacing
    └── components/
        ├── Button.tsx
        ├── Card.tsx                  # Card + Badge primitives
        └── EmptyState.tsx
```

## Troubleshooting

**"Network request failed" right after install.** The phone can't reach
`https://www.asset-hub.uk`. Try opening that URL in the phone's browser. If
it fails there too, fix the device's connectivity first.

**Camera shows a black square.** Camera permission was denied. Open the
Android Settings → Apps → AssetHub (or Expo Go) → Permissions → Camera →
Allow.

**"Cannot connect to Metro" during development.** Restart `npx expo start`
and rescan the QR.

**TLS handshake errors against a self-hosted server.** See the "Self-hosted
backends with self-signed certs" section above.

**Hot reload not picking up changes.** Press `r` in the Metro terminal, or
shake the phone → "Reload".

## Scripts

```powershell
npm start                       # Metro for Expo Go
npm run android                 # Native build on connected device/emulator
npm run typecheck               # tsc --noEmit (CI gate)
npm run doctor                  # expo-doctor sanity check
npm run prebuild:android        # Generate android/ project (rarely needed)
npm run build:android-preview   # EAS APK build
npm run build:android-prod      # EAS app-bundle build for Play Store
```
