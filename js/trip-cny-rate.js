/** 出遊新增消費：人民幣→新台幣（1 CNY = ? TWD） */

import { appState } from './state.js';
import { parseMoneyLike } from './actions/shared.js';

/** 舊版手動匯率備援（仍寫入以便離線） */
export const TRIP_CNY_TWD_LS_KEY = 'ledger_trip_cny_to_twd_v1';

/** 即時匯率快取 `{ r, t }`（t = ms） */
export const TRIP_CNY_LIVE_CACHE_KEY = 'ledger_trip_cny_live_v1';

/** 快取多久內不重打 API（API 本身約每日更新） */
export const LIVE_MAX_AGE_MS = 45 * 60 * 1000;

const LIVE_API_URL = 'https://open.er-api.com/v6/latest/CNY';

/** 已永久開啟「人民幣模式」的行程 id（開啟後不可關） */
export const TRIP_CNY_MODE_TRIPS_KEY = 'ledger_trip_cny_mode_trip_ids_v1';

function readCnyModeTripIds() {
  try {
    const raw = localStorage.getItem(TRIP_CNY_MODE_TRIPS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function isTripCnyModeEnabled(tripId) {
  if (!tripId) return false;
  return readCnyModeTripIds().includes(tripId);
}

export function enableTripCnyModePermanent(tripId) {
  if (!tripId) return;
  const ids = new Set(readCnyModeTripIds());
  if (ids.has(tripId)) return;
  ids.add(tripId);
  try {
    localStorage.setItem(TRIP_CNY_MODE_TRIPS_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export function readSavedCnyTwdRate() {
  try {
    const raw = localStorage.getItem(TRIP_CNY_TWD_LS_KEY);
    if (!raw) return 0;
    const n = parseFloat(String(raw).replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function persistCnyTwdRate(rate) {
  try {
    if (rate > 0) localStorage.setItem(TRIP_CNY_TWD_LS_KEY, String(rate));
    else localStorage.removeItem(TRIP_CNY_TWD_LS_KEY);
  } catch {
    /* ignore */
  }
}

export function readLiveCnyCache() {
  try {
    const raw = localStorage.getItem(TRIP_CNY_LIVE_CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    const r = parseFloat(o.r);
    const t = Number(o.t);
    if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(t)) return null;
    return { rate: r, at: t };
  } catch {
    return null;
  }
}

export function writeLiveCnyCache(rate) {
  try {
    localStorage.setItem(TRIP_CNY_LIVE_CACHE_KEY, JSON.stringify({ r: rate, t: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function isLiveCnyCacheFresh() {
  const c = readLiveCnyCache();
  return !!(c && c.rate > 0 && Date.now() - c.at < LIVE_MAX_AGE_MS);
}

/**
 * 取得 1 CNY 兌多少 TWD（非銀行即時成交價，參考用）。
 * @param {{ force?: boolean }} [opts] force=true 時略過快取直接向 API 請求
 * @returns {Promise<null | { rate: number; fromCache: boolean; stale?: boolean; updatedAt: number; apiTimeUtc?: string }>}
 */
export async function fetchLiveCnyToTwdRate(opts = {}) {
  const force = !!(opts && opts.force);
  if (!force) {
    const c = readLiveCnyCache();
    if (c && c.rate > 0 && Date.now() - c.at < LIVE_MAX_AGE_MS) {
      return { rate: c.rate, fromCache: true, stale: false, updatedAt: c.at, apiTimeUtc: '' };
    }
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(LIVE_API_URL, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) throw new Error('http');
    const data = await res.json();
    if (data.result !== 'success' || data.rates == null || data.rates.TWD == null) throw new Error('shape');
    const rate = parseFloat(data.rates.TWD);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('rate');
    writeLiveCnyCache(rate);
    persistCnyTwdRate(rate);
    const utc = typeof data.time_last_update_utc === 'string' ? data.time_last_update_utc : '';
    return { rate, fromCache: false, stale: false, updatedAt: Date.now(), apiTimeUtc: utc };
  } catch {
    clearTimeout(timer);
    const c = readLiveCnyCache();
    if (c && c.rate > 0) {
      return { rate: c.rate, fromCache: true, stale: true, updatedAt: c.at, apiTimeUtc: '' };
    }
    const leg = readSavedCnyTwdRate();
    if (leg > 0) {
      return { rate: leg, fromCache: true, stale: true, updatedAt: 0, apiTimeUtc: '' };
    }
    return null;
  }
}

function formatNtHintLabel(n) {
  if (!Number.isFinite(n)) return '';
  const r = Math.round(n);
  if (Math.abs(n - r) < 1e-6) return `NT$${r.toLocaleString()}`;
  return `NT$${n}`;
}

function formatCnyHintLabel(v) {
  if (!Number.isFinite(v)) return '¥0';
  const s = v.toFixed(4).replace(/\.?0+$/, '');
  return `¥${s}`;
}

/**
 * 依隱藏欄 `d-cny-rate`（1 CNY = ? TWD）與總金額輸入，更新總金額列旁灰字。
 * 有輸入且匯率有效時顯示雙幣換算；否則顯示「1 人民幣 ≈ …」參考句。
 */
export function updateCnyRateInlineDisplay() {
  const inline = document.getElementById('d-cny-rate-inline');
  const rateEl = document.getElementById('d-cny-rate');
  if (!inline || !rateEl) return;

  if (!isTripCnyModeEnabled(appState.currentTripId)) {
    inline.textContent = '';
    return;
  }

  const rate = parseMoneyLike(rateEl.value);
  const amountEl = document.getElementById('d-amount');
  const v = amountEl ? parseMoneyLike(amountEl.value) : 0;

  if (rate > 0 && v > 0 && amountEl) {
    if (appState.detailAmountCurrency === 'CNY') {
      const nt = Math.round(v * rate);
      inline.textContent = `${formatCnyHintLabel(v)} ≈ NT$${nt.toLocaleString()} 新台幣`;
    } else {
      const cnyStr = (v / rate).toFixed(4).replace(/\.?0+$/, '');
      inline.textContent = `${formatNtHintLabel(v)} ≈ ¥${cnyStr} 人民幣`;
    }
    return;
  }

  if (rate > 0) {
    inline.textContent = `1 人民幣 ≈ ${rate.toFixed(4)} 新台幣`;
    return;
  }
  inline.textContent = '';
}

/** 將快取／備援寫入隱藏匯率欄，供換算使用 */
export function hydrateTripCnyRateInput() {
  if (!isTripCnyModeEnabled(appState.currentTripId)) return;
  const el = document.getElementById('d-cny-rate');
  if (!el) return;
  const live = readLiveCnyCache();
  if (live && live.rate > 0) {
    el.value = String(live.rate);
    updateCnyRateInlineDisplay();
    return;
  }
  const leg = readSavedCnyTwdRate();
  if (leg > 0) el.value = String(leg);
  updateCnyRateInlineDisplay();
}

/**
 * 由「四捨五入後的台幣」還原輸入框的人民幣字串。
 * 直接用 nt/rate 會出現 199.999999（浮點）；改為找最短小數位使 round(cny×rate)===nt。
 */
function formatCnyInputFromNt(nt, rate) {
  const n = Number(nt) || 0;
  if (n <= 0 || !(rate > 0)) return '';
  const raw = n / rate;
  if (!Number.isFinite(raw) || raw <= 0) return '';

  const ntFromCny = c => Math.round(c * rate);

  for (let d = 0; d <= 4; d++) {
    const factor = 10 ** d;
    const c = Math.round(raw * factor) / factor;
    if (c > 0 && ntFromCny(c) === n) {
      if (d === 0) return String(c);
      return c.toFixed(d).replace(/\.?0+$/, '');
    }
  }

  const nearInt = Math.round(raw);
  if (Math.abs(raw - nearInt) < 1e-4) return String(nearInt);
  return raw.toFixed(4).replace(/\.?0+$/, '');
}

/**
 * 由新台幣帳面與匯率（1 CNY = rate TWD）推算輔助用人民幣數值，寫入紀錄 `amountCny` 或列表試算。
 * @param {number|string} ntBill
 * @param {number} rate
 * @returns {number}
 */
export function cnyAuxAmountFromNtd(ntBill, rate) {
  const n = Math.round(Number(ntBill) || 0);
  if (n <= 0 || !(rate > 0)) return 0;
  const s = formatCnyInputFromNt(n, rate);
  const v = parseFloat(String(s).replace(/,/g, ''));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * 總金額欄目前代表幣別下的「新台幣」金額（分攤／結算用）。
 * 人民幣模式且選 ¥ 時：讀輸入 × 匯率（四捨五入）；選 NT$ 時：輸入即台幣。
 */
export function getDetailAmountNt() {
  const totalEl = document.getElementById('d-amount');
  if (!totalEl) return 0;
  const raw = parseMoneyLike(totalEl.value);
  if (!isTripCnyModeEnabled(appState.currentTripId)) return raw;
  const rate = parseMoneyLike(document.getElementById('d-cny-rate')?.value);
  if (appState.detailAmountCurrency === 'CNY') {
    if (rate > 0) return Math.round(raw * rate);
    return 0;
  }
  return raw;
}

/** 以新台幣金額更新總額輸入框顯示（會依目前幣別切換顯示 NT 或 ¥） */
export function setDetailAmountFromNt(nt) {
  const totalEl = document.getElementById('d-amount');
  if (!totalEl) {
    updateCnyRateInlineDisplay();
    return;
  }
  const n = Math.round(Number(nt) || 0);
  if (!isTripCnyModeEnabled(appState.currentTripId)) {
    totalEl.value = n > 0 ? String(n) : '';
    updateCnyRateInlineDisplay();
    return;
  }
  const rate = parseMoneyLike(document.getElementById('d-cny-rate')?.value);
  if (appState.detailAmountCurrency === 'CNY' && rate > 0) {
    totalEl.value = n > 0 ? formatCnyInputFromNt(n, rate) : '';
  } else {
    totalEl.value = n > 0 ? String(n) : '';
  }
  updateCnyRateInlineDisplay();
}

/** 更新總金額右側單一幣別按鈕文案（與金額欄同高，由外層 flex stretch） */
export function syncDetailAmountCurrencyToggleUi() {
  const btn = document.getElementById('d-currency-toggle');
  if (!btn) return;
  const isCny = appState.detailAmountCurrency === 'CNY';
  btn.textContent = isCny ? '¥' : 'NT$';
  btn.title = isCny ? '目前為人民幣，點一下改為新台幣' : '目前為新台幣，點一下改為人民幣';
  btn.setAttribute('aria-label', isCny ? '幣別：人民幣，點擊改為新台幣' : '幣別：新台幣，點擊改為人民幣');
}

/**
 * 右側幣別：僅切換輸入模式（不變更輸入框內數字；使用者自行依幣別修正）。
 * @param {'TWD' | 'CNY'} cur
 */
export function setDetailAmountCurrency(cur) {
  if (!isTripCnyModeEnabled(appState.currentTripId)) return;
  const next = cur === 'CNY' ? 'CNY' : 'TWD';
  appState.detailAmountCurrency = next;
  syncDetailAmountCurrencyToggleUi();
  const inp = document.getElementById('d-amount');
  if (inp) {
    inp.setAttribute('inputmode', next === 'CNY' ? 'decimal' : 'numeric');
    inp.setAttribute('aria-label', next === 'CNY' ? '金額（人民幣）' : '金額（新台幣）');
  }
  updateCnyRateInlineDisplay();
}

/** 在 NT$ / ¥ 輸入模式間切換（單鍵） */
export function toggleDetailAmountCurrency() {
  if (!isTripCnyModeEnabled(appState.currentTripId)) return;
  const next = appState.detailAmountCurrency === 'CNY' ? 'TWD' : 'CNY';
  setDetailAmountCurrency(next);
}
