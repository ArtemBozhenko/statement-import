# Video shot list

Recorded on the emulator and the simulator (see `results.md`, "Videos"); one edited take per platform, under two minutes each (`video/statement-import-ios.mp4`, `video/statement-import-android.mp4`), scenes 1–5 in order. The mock counters on **Diagnostics** are the proof for each scene; switch between Home and Diagnostics as needed.

Preparation (off camera): start the kit mock (`npm start` in `kit/`, or `HOST=0.0.0.0 npm start` for a phone, with Metro started under `EXPO_PUBLIC_API_URL=http://<LAN IP>:8787`), open the app, **Diagnostics → Reset mock state**, scenario **happy**. Fixtures must be reachable by the system picker (README, "Fixtures on the device").

| # | Scene | Diagnostics actions | Expected UI | Expected counters |
|---|---|---|---|---|
| 1 | Happy path | `happy`, **Reset mock state** | **Choose a statement** → `statement.pdf` → confirmation card (name, size, format) → **Send statement** → *Uploading* → *Queued* → *Processing* → *Report ready*, two charges, **Total per month 151.99 AUD** → **Details** on one charge → card with merchant, amount, cadence, last seen → **Close** | createRequests 1, newJobs 1, duplicateHits 0, acceptedBytes 33882 |
| 2 | Lost acknowledgement + relaunch | `lost_ack` | **Start new import** → `statement.csv` → *Uploading* lingers, recovery finds the job by key → *Report ready*. Kill the app from the task switcher and reopen: the same report is shown at once, no upload | createRequests +1, newJobs +1, one job; after relaunch createRequests unchanged |
| 3 | Stale status | `stale_status`, **Start new import** → pick → *Report ready* | Kill and reopen the app: the single confirmation GET returns processing/rev 2, the UI stays *Report ready*; Diagnostics → Current operation shows revision 3 | counters unchanged |
| 4 | Delete failure, then success | `delete_failure` | **Delete import** → confirm → *Couldn’t delete. Your data is still on the server.* Switch to `happy` → **Retry delete** → *Deleting…* → *Import deleted* → **Start new import** | deleteRequests +2, jobs list shows `deleted · rev 5` |
| 5 | Spoofed + oversize | any | **Choose a statement** → `spoofed.pdf` → *Unsupported file. Choose a PDF or CSV bank statement.* → **Choose a statement** → `oversize.csv` → *File is too large. Choose a statement under 10 MB.* | createRequests unchanged |
| 6 | Dark mode (optional) | toggle OS appearance | Same screens in the dark palette | – |

The round gear in the corner is Expo's dev-menu button, not part of the app.
