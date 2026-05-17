# Mobile app — completed scope

Snapshot of everything added/changed in this pass.

## Configured for production

- Default API base URL is now **https://www.asset-hub.uk** (set in
  `app.json` → `expo.extra.defaultServerUrl`).
- First launch no longer forces the user through the setup screen; users
  can change the server later from **Profile → Server → Change server**.
- `eas.json` added with `development` / `preview` / `production` profiles,
  each pinning `EXPO_PUBLIC_API_BASE_URL` to the production host.

## Android compatibility (`app.json`)

- `versionCode`, splash, adaptive icon (`./assets/adaptive-icon.png`),
  launcher icon (`./assets/icon.png`).
- Permissions: `CAMERA`, `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE`,
  `POST_NOTIFICATIONS`.
- `edgeToEdgeEnabled: true` (required for Android 15).
- `newArchEnabled: true` (Fabric + TurboModules).
- `softwareKeyboardLayoutMode: "pan"` so forms don't resize on focus.
- `expo-image-picker` and `expo-secure-store` plugins declared, with
  Android-friendly permission descriptions.
- `usesCleartextTraffic: true` retained for self-hosted dev backends.

## New screens

| Route                                  | Purpose                                       |
|----------------------------------------|-----------------------------------------------|
| `/(tabs)/dashboard`                    | KPIs (total, in service, in repair, warranty) + recents |
| `/(tabs)/maintenance`                  | Ticket list with status filter chips          |
| `/(tabs)/notifications`                | Inbox with unread badge, mark read, deep link |
| `/(auth)/forgot-password`              | Password reset via email                      |
| `/asset/new`                           | Create asset form (Members with write perm)   |
| `/asset/[id]/units/[unitId]`           | Per-unit detail + check-in / check-out        |

## Updated screens

- **Tab bar** (`(tabs)/_layout.tsx`) — six tabs (Home, Scan, Assets,
  Tickets, Inbox, Profile) and a red unread-count badge on Inbox.
- **Scan tab** — now correctly handles `ScanResult` (asset vs unit) and
  routes to the per-unit page when a unit barcode is scanned.
- **Assets tab** — "+" button in the header (visible only when the user
  has `assets:write`) opens the create form.
- **Asset detail** — adds a unit list for unit-tracked assets, a camera +
  gallery uploader on the Photos card, and links into per-unit pages.
- **Login** — "Forgot password" link added.
- **Entry** (`/index`) — skips `/setup` for new installs and goes straight
  to login (production URL is already configured).

## Library / type changes

- `src/lib/server.ts` — `getServerUrl()` now always returns a string
  (defaults to `https://www.asset-hub.uk`). Added `hasCustomServerUrl()`
  and `DEFAULT_SERVER_URL` export.
- `src/lib/api.ts` — added `api.upload(...)` helper for multipart photo
  uploads, plus re-exports for `Category`, `Location`, `AssetTypeRecord`,
  `FieldSchemaItem`, `UnitListItem`, `UnitDetail`, `UnitScanResult`,
  `ScanResult`, `AuditEvent`, `Maintenance*`, `Notification`,
  `ImportResult`.

## Dependencies (`package.json`)

Added:

- `expo-image-picker@~17.0.0` — camera + gallery for photo uploads
- `expo-splash-screen@~31.0.0` — splash control on cold start

New scripts:

- `npm run typecheck` — `tsc --noEmit`
- `npm run doctor` — `npx expo-doctor`
- `npm run build:android-preview` — EAS APK build
- `npm run build:android-prod` — EAS app-bundle build (Play Store)
- `npm run prebuild:android` — regenerate `android/` project locally

## Assets

Placeholder icons generated at:

- `assets/icon.png` (1024×1024)
- `assets/adaptive-icon.png` (Android adaptive foreground)
- `assets/splash.png` (1242×2436)
- `assets/favicon.png` (web)

Swap these out with branded assets before shipping to the Play Store.

## How to ship to an Android device

```powershell
cd "D:\Projects\Asset Managment\mobile"
npm install                 # picks up the new image-picker / splash-screen deps
npx expo start              # for dev with Expo Go
# OR
eas build --profile preview --platform android   # produces a sideload-able APK
```

After install the app launches against `https://www.asset-hub.uk`
automatically — no setup screen, no QR for the server URL.

## Known limitations / next steps

- Tickets list is read-only on mobile. Creating tickets stays a web flow.
- No push notifications yet (permission is declared, but Firebase /
  Expo Push setup is left as a follow-up).
- Asset-create form skips custom-field input — the user can fill those in
  on the web after creation.
- Photos use the standard `Image` component. For very large libraries,
  consider swapping to `expo-image` for caching.
