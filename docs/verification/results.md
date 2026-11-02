# Verification results

All runs on 2026-10-31 (rows marked 2026-11-01 were added later on the same Android emulator) against the unmodified kit mock (`kit/mock-server.mjs`), development builds (`expo run:ios` / `expo run:android`, Expo SDK 58, React Native 0.88.1, Node 24.14) of the simplified app (no Refresh button, the four server statuses plus `uploading` / `error`). The confirmation card and the charge Details card were added after these runs and were verified on 2026-11-01 on the Android emulator, the iPhone 16 simulator (video run) and the physical Android phone. Counters are `GET /__test/state` read before and after each scene. All rows were driven through the real UI (system picker, buttons, dialogs), not through the test harness.

Legend: ✅ verified in this session · ⬜ not run (unverified) · – not applicable to the target

## iPhone 16 Simulator — iOS 18.1 (Xcode 27.1), debug dev-client build, dark mode

| Row | Outcome | Counters |
|---|---|---|
| happy (`statement.pdf` → ready, total 151.99 AUD) | ✅ | createRequests 1, newJobs 1, duplicateHits 0, acceptedBytes 33882 |
| relaunch from `ready` (cold kill, reopen) | ✅ job shown immediately, one GET, no POST | createRequests unchanged |
| delete (dialog → *Deleting…* → *Import deleted*) | ✅ | deleteRequests 1, job `deleted · rev 5` |
| lost_ack (`statement.csv`, POST socket dropped → by-key recovery → ready) | ✅ one job, no duplicate | createRequests 1, newJobs 1, acceptedBytes 112 |
| spoofed.pdf | ✅ *Unsupported file. Choose a PDF or CSV bank statement.* | createRequests unchanged |
| oversize.csv (10,485,771 B) | ✅ *File is too large. Choose a statement under 10 MiB.* (copy now reads *under 10 MB*) | createRequests unchanged |
| temp copies after each run | ✅ `tmp/<bundle>-Inbox`, `Library/Caches/DocumentPicker`, `Library/Caches/statement-imports` all empty | – |
| stale_status (kill + relaunch → UI stays *Report ready*, Diagnostics revision 3), delete_failure (503 → *Retry delete* → *Import deleted*) | ✅ 2026-11-01, video run (Maestro-driven, light mode) | deleteRequests 2 for one job, `deleted · rev 5` |
| confirmation card (`statement.pdf` → *Ready to send* → **Send statement**), charge Details card → **Close** | ✅ 2026-11-01, video run; Cancel path not repeated on iOS (Android emulator: copy deleted) | createRequests 1, newJobs 1, acceptedBytes 33882 |
| request timeouts (15 s / 120 s), polling backoff, *Import not found* after repeated 404 or for a vanished `ready` job, *Start new import* on a failed delete and while deleting, GET after a DELETE with no answer, *Checking the upload…* after a relaunch mid-POST, 0-byte provider size handled on the copy | ⬜ not run on device (added after this session; covered by `transport.node.test.ts`, `controller.node.test.ts`, `presentation.node.test.ts`) | – |

## iPhone SE (3rd generation) Simulator — ⬜ not re-run on the simplified build

The previous build was checked on SE for layout. The simplified home screen has fewer elements than the one checked then; a re-run is still owed.

## Android emulator — Pixel (AVD `pixel35`, API 35, arm64), debug dev-client build, font scale 1.0

| Row | Outcome | Counters |
|---|---|---|
| happy (`statement.pdf` → ready, total 151.99 AUD) | ✅ | createRequests 1, newJobs 1, acceptedBytes 33882 |
| relaunch from `ready` | ✅ one GET, no POST | createRequests unchanged |
| delete (dialog → deleting → deleted) | ✅ | deleteRequests 1, job `deleted · rev 5` |
| delete_failure (503) → scenario happy → *Retry delete* (same key) → deleted | ✅ *Couldn’t delete. Your data is still on the server.* | deleteRequests 2 for one job, one job `deleted · rev 5` |
| spoofed.pdf | ✅ *Unsupported file* | createRequests unchanged |
| oversize.csv | ✅ *File is too large* | createRequests unchanged |
| lost_ack (POST socket dropped → by-key recovery → ready) | ✅ one job | createRequests 1, newJobs 1 |
| stale_status (kill while ready/rev 3, reopen → the second GET answers processing/rev 2) | ✅ logcat `snapshot.ignored … stale_revision`, UI stays ready | unchanged |
| temp copies after each run | ✅ `cache/DocumentPicker` and `cache/statement-imports` empty; record at `files/statement-import-state/import.operation.json` | – |
| Diagnostics: address, scenario switch, reset, counters, current operation, start over | ✅ | – |
| confirmation card: `statement.pdf` → *Ready to send* (name, PDF, 33.1 KB) → **Send statement** → *Report ready*; `statement.csv` → **Cancel** → copy deleted, original in Download untouched | ✅ 2026-11-01, driven through the real picker | createRequests 1, newJobs 1, acceptedBytes 33882; after Cancel createRequests unchanged |
| charge **Details** card (StreamBeam, 19.99 AUD, Monthly, 1 Oct 2026, rec-001) → **Close** | ✅ 2026-11-01 | – |
| request timeouts (15 s / 120 s), polling backoff, *Import not found* after repeated 404 or for a vanished `ready` job, *Start new import* on a failed delete and while deleting, GET after a DELETE with no answer, *Checking the upload…* after a relaunch mid-POST, 0-byte provider size handled on the copy | ⬜ not run on device (added after this session; covered by `transport.node.test.ts`, `controller.node.test.ts`, `presentation.node.test.ts`) | – |
| system font scale 2.0 (app caps text at 1.6×): home title wraps to two lines, **Choose a statement** / **Diagnostics** reachable; confirmation card (*Ready to send*, name, format, size, **Send statement**, **Cancel**) fits without scrolling | ✅ 2026-11-01, `adb shell settings put system font_scale 2.0`, reset to 1.0 afterwards; iOS large text / SE not re-run | – |
| pick without a picker copy (`copyToCacheDirectory: false`): size from the provider's metadata, then a copy straight from `content://` | ✅ 2026-11-01: `cache/DocumentPicker` never created; `oversize.csv` rejected with no file in `cache/statement-imports`; `spoofed.pdf` rejected and its copy removed; accepted copy released after 202 | createRequests unchanged for both rejections |

## Physical iPhone — iPhone 15 Pro (iOS 26.6.2), 2026-11-01

Checked by the owner by hand on the device: the import flow works end to end. The automated run from this Mac stopped at code signing (Apple ID session in Xcode rejected, no development profile for `com.artembozhenko.statementimport`), so there is no per-row counter log for the iPhone, unlike the tables above. To reproduce: sign in to Xcode (Settings → Accounts), then `xcodebuild -workspace ios/StatementImport.xcworkspace -scheme StatementImport -configuration Debug -destination id=<UDID> -allowProvisioningUpdates DEVELOPMENT_TEAM=<team> build`, with Metro started as `EXPO_PUBLIC_API_URL=http://<Mac LAN IP>:8787 npx expo start --dev-client --host lan`.

## Physical Android phone — Xiaomi Redmi Note 8 Pro (MIUI, Android 10 / API 29), debug dev-client build, 2026-11-01

Setup: USB, `adb reverse tcp:8787 tcp:8787` + `adb reverse tcp:8081 tcp:8081` (so the bundle's default `http://127.0.0.1:8787` works unchanged), fixtures pushed to `/sdcard/Download`, app driven over `adb`/uiautomator; the kit mock's `/__test/state` is the proof for each row.

| Row | Outcome | Counters |
|---|---|---|
| happy (`statement.pdf` → confirmation card → ready, total 151.99 AUD) | ✅ | createRequests 1, newJobs 1, acceptedBytes 33882 |
| relaunch from `ready` (`am force-stop`, pid changed) | ✅ report shown at once | createRequests unchanged |
| delete_failure (503) → *Couldn't delete. Your data is still on the server.* → scenario happy → **Retry delete** → *Import deleted* | ✅ | deleteRequests 2, job `deleted · rev 5` |
| spoofed.pdf → *Unsupported file*; oversize.csv → *File is too large* | ✅ | createRequests unchanged |
| stale_status: new import → ready → kill + relaunch → UI stays *Report ready*, Diagnostics current operation `ready` | ✅ | createRequests 2, job `ready · rev 3` |
| lost_ack: `statement.csv` → recovery by key → ready in ~4 s; kill + relaunch → same report | ✅ one job | createRequests 3, newJobs 3, acceptedBytes +112; unchanged after relaunch |
| temp copies after the run (`run-as … ls`) | ✅ `cache/DocumentPicker` absent, `cache/statement-imports` empty, record at `files/statement-import-state/import.operation.json` | – |

MIUI notes: the system picker opens in *Recent* or the last root (Google Drive accounts are listed as roots); the fixtures are reached through the roots drawer → *Загрузки*. First `adb install` was refused with `INSTALL_FAILED_USER_RESTRICTED` until the on-device "Install via USB" prompt was accepted. Not checked on this phone: large font scale, dark mode.

## Defects found during device runs and fixed

| Found on | Defect | Fix |
|---|---|---|
| iOS | `UIDocumentPicker` leaves a copy of every picked file in `tmp/<bundle>-Inbox`; with `copyToCacheDirectory` a second copy lands in `Library/Caches/DocumentPicker`, and the picker deletes neither | On iOS the picker is asked not to copy and the Inbox file itself is moved into the app's own folder (the move removes the source). On Android the cache copy is moved the same way. `Library/Caches/DocumentPicker` is cleared after every pick as a safety net |
| both | Error copy explained mechanics (byte counts, HTTP codes, idempotency) | Rewritten to the short "what happened → what to do" pattern; technical detail stays in Diagnostics and logs |

## Videos (`docs/verification/video/`, 2026-11-01)

| File | Length | How it was made |
|---|---|---|
| `statement-import-android.mp4` | 1:53 | Pixel emulator (API 35), driven over `adb`/uiautomator with the system touch indicator on; one take per shot-list scene |
| `statement-import-ios.mp4` | 1:43 | iPhone 16 simulator (iOS 18.1), driven with Maestro; tap markers drawn from the Maestro tap log |

Both follow the shot list scenes 1–5 in the order 1, 2, 3, 4, 5 against the real kit mock. Idle waiting (polling, bundle reload) is trimmed in the edit, every state is held 1.7–2.5 s at real speed; nothing is re-ordered or re-shot. Scene 6 (dark mode) is not included. Physical devices: see the two sections above.

## Automated tests (`npm test` in `mobile/`, 13 suites / 102 tests)

| Matrix row | Test |
|---|---|
| happy | `acceptance-matrix › happy › statement.csv / statement.pdf: real bytes are sent, 202 is not ready, ready shows two items totalling 151.99 AUD`, `… a ready operation survives relaunch: one GET to confirm the job, no POST` |
| lost_ack | `lost_ack › first POST creates a job without a response; recovery by key finds it; exactly one job exists`, `… the idempotency key is persisted before the first byte leaves`, `… after relaunch mid-upload only GET by-key runs; no automatic POST`, `… after relaunch with no job on the server the user gets a manual retry, not an automatic POST` |
| stale_status | `stale_status › processing/2 after ready/3 does not roll the UI back` |
| delete_failure | `delete_failure › 503 keeps server data; retry with the same key reaches deleting, then deleted`, `… deleting is never reported as deleted before the server says so, and does not come back` |
| spoofed + oversize | `spoofed + oversize › both files are rejected locally and createRequests does not change` (pure validator on the real fixture bytes and the 10 MiB + 1 size; the pipeline itself is covered by `pipeline.node.test.ts`, and the real `oversize.csv` was rejected on both simulators), `… the server would also reject them (defence in depth), and that lands in error without a retry`, `validation.node.test.ts`, `pipeline.node.test.ts` |
| extras | `key reuse with different bytes › 409 lands in error and no second job appears`, `start over › clears the record and removes the local copy`, `controller.node.test.ts`, `snapshot.node.test.ts`, `presentation.node.test.ts`, `operationRecord.node.test.ts`, `StatusPanel.test.tsx` |
