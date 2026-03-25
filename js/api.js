import {
  API_URL,
  CACHE_DAILY,
  CACHE_TRIP,
  CACHE_LEGACY_KEYS,
  GET_TIMEOUT_MS,
  POST_TIMEOUT_MS,
  GET_MAX_RETRIES,
  GET_RETRY_BASE_MS,
  POST_MAX_RETRIES,
  POST_RETRY_BASE_MS,
  SYNC_LAST_AT_KEY,
  APPEND_DEVICE_INFO_TO_POST,
} from './config.js';
import { appState } from './state.js';
import { isDailyRow, isTripRow, normalizeRow } from './model.js';
import { abortSignalAfter } from './utils.js';
import { updateSyncUI } from './sync-ui.js';
import { getClientDeviceSummary } from './device-info.js';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function jitterBackoff(attempt, baseMs) {
  return baseMs * Math.pow(2, attempt) + Math.random() * 200;
}

function isRetryableHttp(status) {
  return status >= 500 || status === 429;
}

function isRetryableNetworkError(err) {
  const name = err?.name || '';
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  const msg = String(err?.message || '');
  return /Failed to fetch|NetworkError|Load failed/i.test(msg);
}

function readSyncTimestampFromStorage() {
  try {
    const v = localStorage.getItem(SYNC_LAST_AT_KEY);
    if (v == null) return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

function persistSyncTimestamp(ms) {
  try {
    localStorage.setItem(SYNC_LAST_AT_KEY, String(ms));
  } catch {
    /* ignore */
  }
}

export function loadCache() {
  try {
    const daily = localStorage.getItem(CACHE_DAILY);
    const trip = localStorage.getItem(CACHE_TRIP);
    appState.allRows = [
      ...(daily ? JSON.parse(daily) : []),
      ...(trip ? JSON.parse(trip) : []),
    ].map(normalizeRow);
    const ts = readSyncTimestampFromStorage();
    appState.lastSyncAt = ts;
    appState.syncStatus = appState.allRows.length ? 'cache_only' : 'idle';
  } catch {
    /* keep previous allRows */
  }
}

export function saveCache() {
  try {
    localStorage.setItem(CACHE_DAILY, JSON.stringify(appState.allRows.filter(isDailyRow)));
    localStorage.setItem(CACHE_TRIP, JSON.stringify(appState.allRows.filter(isTripRow)));
  } catch (e) {
    if (e && e.name === 'QuotaExceededError') {
      import('./utils.js').then(m => m.toast('儲存空間已滿，快取寫入失敗'));
    }
  }
}

/** 移除 localStorage 內帳本相關快取（不動 theme 等其它鍵）。成功從 GAS 拉資料並覆寫前呼叫。 */
function clearLedgerLocalStorage() {
  try {
    localStorage.removeItem(CACHE_DAILY);
    localStorage.removeItem(CACHE_TRIP);
    for (const k of CACHE_LEGACY_KEYS) {
      localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

async function fetchGetWithRetry(url) {
  let lastErr;
  for (let attempt = 0; attempt < GET_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: abortSignalAfter(GET_TIMEOUT_MS),
      });
      if (!res.ok) {
        if (isRetryableHttp(res.status) && attempt < GET_MAX_RETRIES - 1) {
          await sleep(jitterBackoff(attempt, GET_RETRY_BASE_MS));
          continue;
        }
        throw new Error('HTTP ' + res.status);
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < GET_MAX_RETRIES - 1 && isRetryableNetworkError(e)) {
        await sleep(jitterBackoff(attempt, GET_RETRY_BASE_MS));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}

function ledgerRowSortKey(r) {
  if (!r) return '';
  const t = r.type != null ? String(r.type) : '';
  const id = r.id != null ? String(r.id) : '';
  const d = r.date != null ? String(r.date) : '';
  return `${t}\0${id}\0${d}`;
}

/** 與試算表回傳順序無關：排序後逐筆比對，避免僅順序不同就視為變更。 */
function rowsDataEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  const strA = JSON.stringify(a);
  const strB = JSON.stringify(b);
  if (strA === strB) return true;
  if (strA.length !== strB.length) return false;
  const sa = [...a].sort((x, y) => ledgerRowSortKey(x).localeCompare(ledgerRowSortKey(y)));
  const sb = [...b].sort((x, y) => ledgerRowSortKey(x).localeCompare(ledgerRowSortKey(y)));
  for (let i = 0; i < sa.length; i++) {
    if (JSON.stringify(sa[i]) !== JSON.stringify(sb[i])) return false;
  }
  return true;
}

/**
 * @param {{
 *   silent?: boolean,
 *   updateStatus?: boolean,
 *   backgroundPoll?: boolean,
 * }} [opts]
 * - `silent`: 不顯示「同步中」
 * - `backgroundPoll`: 背景輪詢（不顯示同步中；成功後若資料與先前相同則不刷新狀態列，減少閃爍）
 * - `updateStatus`: 覆寫是否更新狀態列（少用）
 * @returns {Promise<boolean>} 與本次抓取前之本機資料是否相同（`true`＝無需重繪畫面）
 */
export async function loadData(opts = {}) {
  const silent = !!opts.silent;
  const backgroundPoll = !!opts.backgroundPoll;
  const updateStatus = opts.updateStatus ?? !silent;
  /** 僅手動／首次載入顯示「同步中」；背景輪詢永遠不顯示 */
  const showSyncingBar = !silent && !backgroundPoll && updateStatus;

  const localSnapshot = appState.allRows.slice();
  if (showSyncingBar) {
    appState.syncStatus = 'syncing';
    updateSyncUI();
  }

  try {
    const res = await fetchGetWithRetry(API_URL + '?t=' + Date.now());
    const raw = await res.json();
    if (!Array.isArray(raw)) {
      console.warn('GAS: expected JSON array, sync skipped');
      if (!silent && !backgroundPoll && updateStatus) {
        appState.syncStatus = localSnapshot.length ? 'cache_only' : 'error';
        updateSyncUI();
      }
      return true;
    }

    let fresh = raw.filter(r => r && r.type).map(normalizeRow);

    const localById = {};
    localSnapshot.forEach(r => {
      if (r.id) localById[r.id] = r;
    });
    fresh = fresh.map(r => {
      const local = localById[r.id];
      if (!local) return r;
      if (r.type === 'trip' && !r.name && local.name) {
        return { ...r, name: local.name, members: r.members || local.members };
      }
      if (r.type === 'tripExpense' && !r.tripId && local.tripId) {
        return { ...r, tripId: local.tripId };
      }
      return r;
    });

    clearLedgerLocalStorage();
    appState.allRows = fresh;
    saveCache();

    const unchanged = rowsDataEqual(localSnapshot, fresh);
    if (updateStatus && (!backgroundPoll || !unchanged)) {
      const now = Date.now();
      appState.lastSyncAt = now;
      persistSyncTimestamp(now);
      appState.syncStatus = 'synced';
      updateSyncUI();
    }
    return unchanged;
  } catch (e) {
    console.warn('Load error:', e.message || e);
    if (backgroundPoll) return true;
    if (silent || !updateStatus) return false;
    const hadLocal = localSnapshot.length > 0;
    if (!appState.allRows.length && hadLocal) {
      appState.allRows = localSnapshot;
    }
    appState.syncStatus = hadLocal || appState.allRows.length ? 'cache_only' : 'error';
    if (!appState.lastSyncAt) appState.lastSyncAt = readSyncTimestampFromStorage();
    updateSyncUI();
    return false;
  }
}

function getPostAbortSignal() {
  return abortSignalAfter(POST_TIMEOUT_MS);
}

export function formatPostError(err) {
  if (!err) return '同步失敗，請稍後再試';
  const name = err.name || '';
  if (name === 'AbortError' || name === 'TimeoutError') {
    return '連線逾時，請檢查網路後再試';
  }
  const msg = String(err.message || '');
  if (msg.startsWith('HTTP_')) {
    const code = msg.slice(5);
    if (code === '429') return '請求過於頻繁，請稍後再試';
    if (code.startsWith('5')) return '伺服器暫時無法使用（' + code + '），請稍後再試';
    return '伺服器回應錯誤（' + code + '），請稍後再試';
  }
  if (name === 'TypeError' || /Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return '無法連線，請檢查網路後再試';
  }
  return '同步失敗，請稍後再試';
}

export async function postRow(data) {
  appState.syncStatus = 'syncing';
  updateSyncUI();
  let lastErr;
  for (let attempt = 0; attempt < POST_MAX_RETRIES; attempt++) {
    try {
      let payload = data;
      if (APPEND_DEVICE_INFO_TO_POST) {
        const clientLabel = await getClientDeviceSummary();
        payload = { ...data, _clientDevice: clientLabel };
      }
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: getPostAbortSignal(),
      });
      if (!res.ok) {
        if (isRetryableHttp(res.status) && attempt < POST_MAX_RETRIES - 1) {
          await sleep(jitterBackoff(attempt, POST_RETRY_BASE_MS));
          continue;
        }
        throw new Error('HTTP_' + res.status);
      }
      saveCache();
      const now = Date.now();
      appState.lastSyncAt = now;
      persistSyncTimestamp(now);
      appState.syncStatus = 'synced';
      updateSyncUI();
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < POST_MAX_RETRIES - 1 && isRetryableNetworkError(e)) {
        await sleep(jitterBackoff(attempt, POST_RETRY_BASE_MS));
        continue;
      }
      appState.syncStatus = appState.allRows.length ? 'cache_only' : 'error';
      updateSyncUI();
      throw lastErr;
    }
  }
}
