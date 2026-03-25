import { TIMEZONE } from './config.js';

export function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

/** Google Sheets ISO timestamps → YYYY-MM-DD in Taipei */
export function normalizeDate(d) {
  if (!d) return '';
  const s = String(d);
  if (s.length > 10 && s.includes('T')) {
    return new Date(s).toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  }
  return s;
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Analysis range labels and [fromStr, toStr] inclusive, using Taipei calendar
 * (aligned with todayStr() / stored row dates).
 */
export function getAnalysisRange(period) {
  const toStr = todayStr();
  const [y0, mo, d0] = toStr.split('-').map(Number);
  let fromStr;
  if (period === 'year') {
    fromStr = `${y0}-01-01`;
  } else if (period === 'month') {
    fromStr = `${y0}-${pad2(mo)}-01`;
  } else {
    const noonTwMs = Date.parse(`${y0}-${pad2(mo)}-${pad2(d0)}T04:00:00.000Z`);
    const sun0 = new Date(noonTwMs).getUTCDay();
    const mon0 = (sun0 + 6) % 7;
    const mondayMs = noonTwMs - mon0 * 86_400_000;
    fromStr = new Date(mondayMs).toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  }
  const periodLabel =
    period === 'week' ? `${fromStr} ～ ${toStr}` : period === 'month' ? `${y0} 年 ${mo} 月` : `${y0} 年`;
  return { fromStr, toStr, periodLabel };
}
