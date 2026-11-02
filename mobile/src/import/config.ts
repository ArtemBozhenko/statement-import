/**
 * API address, fixed at bundle time. `127.0.0.1` works directly from the iOS simulator and from the
 * Android emulator via `adb reverse`; for a phone on the LAN start Metro with
 * `EXPO_PUBLIC_API_URL=http://<host>:8787`. There is deliberately no runtime switch: an address
 * changed mid-operation would make the client poll a server that never heard of its job.
 */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
