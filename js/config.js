// ──────────────────────────────────────────────────────────────────────────────
// App configuration (override API before loading main: window.__LEDGER_API_URL__ = '...')
// ──────────────────────────────────────────────────────────────────────────────
export const TIMEZONE = 'Asia/Taipei';

const DEFAULT_API =
  'https://script.google.com/macros/s/AKfycbzDxvHzVV8TR3PR5IMS3zgZE_t1Dq3CDw1yEGGm3FkiQzikl7WnaCOvNMf8rvrcO9Jz/exec';

export const API_URL =
  (typeof window !== 'undefined' && window.__LEDGER_API_URL__) || DEFAULT_API;

export const CACHE_DAILY = 'gasRows_daily_v2';
export const CACHE_TRIP = 'gasRows_trip_v2';

export const POST_TIMEOUT_MS = 45_000;
export const GET_TIMEOUT_MS = 10_000;
export const POLL_MS = 30_000;
