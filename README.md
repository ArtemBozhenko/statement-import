# Statement Import — mobile engineer test task

React Native + TypeScript (Expo SDK 58, development build) client for the bank-statement import API from the candidate kit. Picks a PDF/CSV with the system picker, validates it on the device by content and size, uploads the raw bytes with an idempotency key, follows the job to `ready`, survives lost responses and relaunches, respects monotonic revisions, deletes asynchronously, and never logs file names or bytes.

```
kit/      vendor kit, unmodified (mock API, fixtures)
mobile/   the app (expo-router, src/)
docs/     release note, self-review, verification results, video shot list
```

## Prerequisites

- Node 20+ (verified with 24.14), npm.
- Xcode 16+ with an iOS 18 simulator runtime (verified with Xcode 27.1 / iOS 18.1) and CocoaPods (`brew install cocoapods`).
- Android Studio with SDK 35, an emulator (API 34/35) and JDK 17+ (Android Studio's bundled JBR works: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`).
- No Expo account, EAS or internet access is needed beyond `npm install`.

## 1. Start the kit mock

```bash
cd kit
npm run fixtures:oversize   # creates fixtures/oversize.csv (> 10 MiB), once
npm start                   # http://127.0.0.1:8787
HOST=0.0.0.0 npm start      # for a physical phone on the same Wi‑Fi
```

## 2. Build and run the app

```bash
cd mobile
npm install
npx expo prebuild            # generates ios/ and android/ (git-ignored)
# EXPO_FILE_SHARING=1 npx expo prebuild   # dev only: shows the app folder in the iOS Files app for fixtures
npx expo run:ios             # default simulator; --device "iPhone SE (3rd generation)" for another
npx expo run:android         # running emulator or connected device
```

`expo run:*` starts Metro. Later: `npm start`.

| Target | Mock address in the app |
|---|---|
| iOS Simulator | `http://127.0.0.1:8787` (default) |
| Android emulator | `adb reverse tcp:8787 tcp:8787`, then the default works |
| Physical iPhone / Android | `HOST=0.0.0.0 npm start` in `kit/`; start Metro with the LAN address baked in: `EXPO_PUBLIC_API_URL=http://<your Mac's LAN IP>:8787 npx expo start --dev-client` (or the same prefix on `expo run:*`), then reload the app. Android over USB can instead keep the default with `adb reverse tcp:8787 tcp:8787` |

The address comes from `EXPO_PUBLIC_API_URL` at bundle time, else `http://127.0.0.1:8787`; there is no runtime switch (an address changed mid-operation would make the client poll a server that never heard of its job). **Diagnostics** shows the active address. Cleartext HTTP on Android is enabled unconditionally by the `expo-build-properties` entry in `app.json` because the kit mock is plain HTTP; remove it for a production build (HTTPS API).

Fixtures on the device:
- iOS: prebuild with `EXPO_FILE_SHARING=1` (see above), then on the simulator `xcrun simctl get_app_container booted com.artembozhenko.statementimport data` and copy `kit/fixtures/*` into its `Documents/`; they appear in Files → On My iPhone → Statement Import. Without that flag the app's folder is not exposed in Files (the operation record lives there). Physical iPhone: AirDrop the fixtures to Files → iCloud Drive or On My iPhone.
- Android: `adb push kit/fixtures/statement.csv kit/fixtures/statement.pdf kit/fixtures/spoofed.pdf kit/fixtures/oversize.csv /sdcard/Download/`.

## 3. Using the app

One screen. **Choose a statement** opens the system picker; the file's size is checked from the picker's metadata first, then it is brought into the app's private cache under a random name (iOS: the system's Inbox copy is moved; Android: copied straight from the `content://` document, the picker makes no copy of its own) and checked by its first 32 bytes. A rejected file shows the reason (nothing is sent). An accepted file lands on a confirmation card (name, size, format) with **Send statement** and **Cancel**; nothing is sent until **Send**, and **Cancel** deletes the private copy right away. Text honours the system font scale up to 1.6× so the status card and its buttons stay on one screen. The status card then follows the job: Uploading → Queued → Processing → Report ready (recurring charges, total per month). Each charge has a **Details** button that opens a card with merchant, amount, cadence and last-seen date; it is display only. **Delete import** asks for confirmation and shows *Deleting…* until the server returns `deleted`. **Start new import** clears the local record.

Every GET / DELETE has a 15 s timeout and the upload a 120 s one; a timeout counts as an unknown outcome. If the POST gets no answer, the client looks the job up by its idempotency key; in a live session it retries the POST with the same key up to twice; after a relaunch it never POSTs by itself and offers **Retry upload** instead. A delete rejected by the server keeps the data visible and offers **Retry delete** with the same delete key, or **Start new import** to leave the job on the server. A DELETE that gets no answer is followed by one GET: if the server already shows `deleting`, the client simply continues; otherwise it says the request may not have arrived and that retrying is safe. If the server answers 404 for the job three polls in a row, or on delete, the operation ends in *Import not found* with **Start new import**. Polling runs every 1.5 s and doubles the interval every 8 unchanged polls up to 12 s; it resets when the app returns to the foreground.

**Diagnostics** (the button is shown in dev builds only; the route itself is in every bundle): active mock address, scenario switch (`happy`, `lost_ack`, `stale_status`, `delete_failure`), reset, `/__test/state` counters and jobs, and the current operation's status / jobId / revision / keys. The round gear button in the corner of every screen is Expo's dev-menu, not part of the app.

## 4. Tests

```bash
cd mobile
npm test          # Jest: node + jest-expo projects
npm run typecheck # tsc --noEmit
npm run lint      # eslint (expo config)
```

`test/node/acceptance-matrix.node.test.ts` **spawns the real kit mock** as a child process and drives the controller through every row of the acceptance matrix (happy, lost_ack incl. relaunch, stale_status, delete_failure, spoofed + oversize, plus 409 and start over), checking the `/__test/state` counters. Unit tests cover the validator, the revision reducer, the controller policy (fake timers), the file pipeline (fake file system) and the status panel. The mapping from matrix rows to test names is in `docs/verification/results.md`.

## 5. Documents

- `docs/verification/results.md` — per-target results (iPhone 16 simulator, Pixel emulator, Xiaomi Redmi Note 8 Pro, iPhone 15 Pro) with mock counters per row, and what is still **unverified**.
- `docs/verification/shot-list.md` — the scenes in the videos and the counters that prove each one.
- `docs/verification/video/statement-import-ios.mp4` (1:43) and `docs/verification/video/statement-import-android.mp4` (1:53) — happy path with the confirmation and Details cards, lost_ack + relaunch, stale_status, delete_failure + retry, spoofed + oversize; taps are highlighted, idle polling is trimmed.
- `docs/release-note.md` — permissions, file-copy lifecycle, rollout stop signals, native vs. OTA changes.
- `docs/self-review.md` — key decisions, simplifications, what breaks first, AI tooling.

## Architecture in one paragraph

`mobile/src/import` is the domain: a flat `Operation` record (status = server statuses + `uploading` + `error`), pure `validateStatement`, pure `applyServerSnapshot` (monotonic revisions), `createFetchTransport`, `createImportController` (effects runner: persistence, polling, recovery) and the pure `describeOperation` presentation model. `mobile/src/files` is the device pipeline (picker → private copy → 32-byte sniff → verdict, plus an orphan sweep on start). `mobile/src/storage` persists the record as a JSON file in the app's documents directory. `mobile/src/app` are the three expo-router screens (home, diagnostics, charge details modal); `mobile/src/ui` and `mobile/src/theme` are a handful of components and tokens (light + dark). The logger accepts a closed set of protocol fields, so file names and bytes cannot be logged by construction.
