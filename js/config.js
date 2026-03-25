// ──────────────────────────────────────────────────────────────────────────────
// App configuration (override API before loading main: window.__LEDGER_API_URL__ = '...')
// ──────────────────────────────────────────────────────────────────────────────
export const TIMEZONE = 'Asia/Taipei';

/** 日常帳兩位使用者名稱（影響結算顯示、分攤邏輯、表單按鈕等） */
export const USER_A = '胡';
export const USER_B = '詹';

const DEFAULT_API =
  'https://script.google.com/macros/s/AKfycbzDxvHzVV8TR3PR5IMS3zgZE_t1Dq3CDw1yEGGm3FkiQzikl7WnaCOvNMf8rvrcO9Jz/exec';

function readApiOverrideFromLocalStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('ledger_api_url_v1') : null;
  } catch {
    return null;
  }
}

export const API_URL =
  (typeof window !== 'undefined' && window.__LEDGER_API_URL__) ||
  readApiOverrideFromLocalStorage() ||
  DEFAULT_API;

export const CACHE_DAILY = 'gasRows_daily_v2';
export const CACHE_TRIP = 'gasRows_trip_v2';

/** 舊版快取鍵，收到 GAS 成功同步時一併移除 */
export const CACHE_LEGACY_KEYS = ['gasRows_daily_v1', 'gasRows_trip_v1'];

export const POST_TIMEOUT_MS = 45_000;
export const GET_TIMEOUT_MS = 10_000;
export const POLL_MS = 45_000;

/** localStorage：上次成功從 GAS 拉取並寫入的時間（ms） */
export const SYNC_LAST_AT_KEY = 'ledger_sync_last_at_v1';

/** GET / POST 失敗時重試（指數退避 + 小幅隨機抖動） */
export const GET_MAX_RETRIES = 4;
export const GET_RETRY_BASE_MS = 400;
export const POST_MAX_RETRIES = 4;
export const POST_RETRY_BASE_MS = 500;

/**
 * 為 true 時，每次 POST 會多帶 `_clientDevice`（單行文字，例：手機 · Android 14 · Chrome 124）。
 * GAS 須忽略或寫入試算表。若要關閉：在載入 main 前設 `window.__LEDGER_APPEND_DEVICE__ = false`。
 */
export const APPEND_DEVICE_INFO_TO_POST =
  typeof window !== 'undefined' && window.__LEDGER_APPEND_DEVICE__ === false ? false : true;
