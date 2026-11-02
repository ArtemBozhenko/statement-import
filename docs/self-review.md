# Self-review

## Simplified for the deadline

- One operation per installation; foreground upload with no Cancel while a POST is in flight (120 s timeout, then recovery by key); polling 1.5 s with doubling backoff to 12 s, paused in background, no cap on `processing`.
- API address fixed at bundle time (`EXPO_PUBLIC_API_URL`); a phone on the LAN needs Metro restarted.
- The record is one JSON file written by truncate-then-write; a record that fails to parse is treated as absent, silently.
- Logger is console-only under `__DEV__`; release builds emit nothing.
- The native adapters (picker, file system, uploader) have no automated tests.

## What breaks first in production, and how we would notice

In production none of this can be noticed today: no log or crash tracking tool is connected, and the client events below exist only in dev builds. Until a sink is added (one function in the logger) the only way to find these failures is empirically, by testing the build by hand.

| # | Failure | User sees | Signal, fix |
|---|---|---|---|
| 1 | Non-ASCII file name (`Выписка.pdf`) in `X-File-Name`: on Android OkHttp rejects the header value, the POST never leaves | *Upload not confirmed*, Retry loops forever | `upload.unconfirmed` + `recovery.not_found_by_key` with no `upload.accepted`; server: by-key 404s with zero creates. Percent-encode the header |
| 2 | Kill during a record write. Next launch parses nothing, shows the empty screen, the user imports again under a new key: **a second job for the same bytes**. Same outcome when a 202 arrives with an unparsable body | Nothing looks wrong | Client: nothing, the parse failure is silent. Server: same sha256 under two keys. Temp file + rename, log `record.corrupt`, route a 202 protocol error to recovery by key |
| 3 | iOS purges `Library/Caches` with the local copy while an unconfirmed upload waits; every retry fails as "network" | Message from #1 | `upload.unconfirmed` right after `upload.started` on relaunch. Detect the missing copy, offer *Start new import* |
| 4 | Android no-copy pick path meets a provider that reports no size or refuses streaming (some cloud providers) | *File is too large* for a small file, or *Could not read the file* | `pick.rejected reason=too_large` share after a provider or OS update; fail-closed, no adapter test. Fall back to the picker copy for that provider |
| 5 | A job stuck in `processing` on the server: polling runs at the 12 s cap with no deadline, and without jitter a fleet of clients reconnects in lockstep after an outage | *Processing* forever | Time in `processing` per job; request spikes after outages. Add a `poll_timeout` exit after N minutes and full jitter on the backoff |
| 6 | Overlapping record writes (`void patch` + `void commit` on the same file) or an exception from `readHead` between copy and verdict | Stale state after relaunch; an orphan copy until the next launch's sweep | Server: same sha256 under two keys. Serialise writes (queue or temp file + rename); try/finally around the verdict |
