# Release note — Statement Import (client fragment)

## What ships

A React Native (Expo SDK 58, development build) client that picks a bank statement (PDF or CSV), validates it on the device, uploads the raw bytes to the import API with an idempotency key, follows the job to `ready`, shows the recurring charges found, and deletes the import on request. One import at a time. UI in English, light and dark themes.

## Permissions

| Platform | Needed | Why | Not needed |
|---|---|---|---|
| iOS | none at runtime | The system document picker runs out of process; no Photos, Camera, Contacts or Location usage strings exist | Photo library, camera. Dev builds carry `NSLocalNetworkUsageDescription` from `expo-dev-client` (Metro discovery); a LAN mock address can trigger the local-network prompt in dev builds only |
| iOS | `UIFileSharingEnabled`, `LSSupportsOpeningDocumentsInPlace` | Off by default. `EXPO_FILE_SHARING=1 npx expo prebuild` turns them on for a development build so fixtures can be dropped into Files; never for release, because the operation record lives in Documents | — |
| Android | none at runtime | Storage Access Framework (`ACTION_OPEN_DOCUMENT`) grants a one-off URI. `READ/WRITE_EXTERNAL_STORAGE` that Expo modules would add are removed via `blockedPermissions` (verified in the generated manifest). `SYSTEM_ALERT_WINDOW` and `VIBRATE` remain: they come from `expo-dev-client` / React Native dev tooling, not from app code | Storage permissions, notifications |
| Android | `INTERNET` | HTTP to the import API | — |
| Android | `usesCleartextTraffic=true` (all builds of this repo) | The kit mock is plain HTTP; the flag is set unconditionally by `expo-build-properties`. Remove it for a production build (HTTPS API) | — |

## Where file copies live and how they are cleaned

- iOS: the picker (import mode) copies the chosen file into `tmp/<bundle>-Inbox/`. The app asks for no second copy (`copyToCacheDirectory: false`) and **moves** that file into `Library/Caches/statement-imports/<uuid>`, so the Inbox is empty again.
- Android: the picker makes no copy (`copyToCacheDirectory: false`). The size is read from the document provider's metadata, so an oversize file is rejected before any byte is copied; an accepted document is **copied** from its `content://` URI into `cache/statement-imports/<uuid>`. The app never deletes through a `content://` URI, so the user's original is untouched. `cache/DocumentPicker/` is still purged after each pick and on start as a safety net.
- The original file name is never used as a file name on disk and never logged; it is stored, together with the result (merchants, amounts) and the keys, inside the operation record described below, so that the screen can show it after a relaunch.
- The copy is deleted as soon as the server confirms the job (202 or recovery by key), on rejection (spoofed / oversize), on **Cancel** from the confirmation card and on **Start new import**. Orphans from a kill mid-copy are swept on the next launch.
- The operation record is a JSON file in the app's documents directory (`statement-import-state/`), app-private: not browsable (file sharing is off), `android:allowBackup="false"` keeps it out of Android backups; on iOS it is part of the iCloud/iTunes backup of the app container (no backup-exclusion API in `expo-file-system`). OS "Clear data" / uninstall removes everything; the server-side job is removed only by **Delete import** confirmed by the server.

## Logging

The logger accepts only `event` plus a closed set of protocol fields (`jobId, status, revision, httpStatus, attempt, reason, count`), enforced by the type system. File names, bytes, merchant names and amounts cannot be passed. Console output in `__DEV__` only.

## Rollout stop signals

| Signal | Threshold | Meaning |
|---|---|---|
| Jobs per idempotency key > 1 | any | Client retried with a new key; duplicate imports |
| POST 409 share | > 0.1 % of creates | Different bytes under one key |
| `deleteRequests` without a following `deleted` within 10 min | > 1 % of deletes | Client abandoned or misreported deletion |
| POST not followed by 202 or by-key hit | > 2 % sustained | Transport or validation regression |
| Oversize / spoofed bodies reaching the server | any | Local validation regressed |
| Crash rate on the import screen | > 0.5 % sessions | — |

## Native binary vs. JS / OTA update

Needs a native build: native module versions (`expo-document-picker`, `expo-file-system`, `expo-crypto`, `react-native-screens`, `react-native-safe-area-context`, `expo-dev-client`), picker/Info.plist/manifest settings (`UIFileSharingEnabled`, `usesCleartextTraffic`), bundle id, icons, URL scheme.

Can ship as JS: validation rules, polling interval and backoff, request timeouts, recovery policy, copy, theme tokens, screens, the record shape (a record the new JS cannot parse is treated as absent), the default API URL baked via `EXPO_PUBLIC_API_URL`.

## Accessibility

System font scaling is honoured up to 1.6× (`maxFontSizeMultiplier` on every app text) so the status card and its buttons stay reachable on a small screen; screens scroll.

## Known limitations

- Single active import per installation.
- Foreground upload only; a kill during the POST lands in `uploading`, which the client resolves by GET-by-key on relaunch (no automatic POST after relaunch, by design).
- No cap on how long `processing` may last: the client shows what the server says for as long as it says it, polling with backoff (1.5 s → 12 s). Requests themselves time out (15 s for GET / DELETE, 120 s for the upload).
- The API address is fixed at bundle time (`EXPO_PUBLIC_API_URL`); there is no in-app switch.
- The server is trusted on `revision` monotonicity.
