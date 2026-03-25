import {
  API_URL,
  CACHE_DAILY,
  CACHE_TRIP,
  GET_TIMEOUT_MS,
  POST_TIMEOUT_MS,
} from './config.js';
import { appState } from './state.js';
import { isDailyRow, isTripRow, normalizeRow } from './model.js';
import { abortSignalAfter } from './utils.js';

export function loadCache() {
  try {
    const daily = localStorage.getItem(CACHE_DAILY);
    const trip = localStorage.getItem(CACHE_TRIP);
    appState.allRows = [
      ...(daily ? JSON.parse(daily) : []),
      ...(trip ? JSON.parse(trip) : []),
    ].map(normalizeRow);
  } catch {
    /* keep previous allRows */
  }
}

export function saveCache() {
  try {
    localStorage.setItem(CACHE_DAILY, JSON.stringify(appState.allRows.filter(isDailyRow)));
    localStorage.setItem(CACHE_TRIP, JSON.stringify(appState.allRows.filter(isTripRow)));
  } catch {
    /* ignore quota */
  }
}

export async function loadData() {
  const localSnapshot = appState.allRows.slice();
  try {
    const res = await fetch(API_URL + '?t=' + Date.now(), {
      redirect: 'follow',
      signal: abortSignalAfter(GET_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const raw = await res.json();
    if (!Array.isArray(raw)) {
      console.warn('GAS: expected JSON array, sync skipped');
      return;
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

    appState.allRows = fresh;
    saveCache();
  } catch (e) {
    console.warn('Load error:', e.message || e);
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
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(data),
    redirect: 'follow',
    signal: getPostAbortSignal(),
  });
  if (!res.ok) throw new Error('HTTP_' + res.status);
  saveCache();
}
