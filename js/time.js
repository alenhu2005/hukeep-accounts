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

/**
 * Normalize a "time-only" value to `HH:MM:SS`.
 * Google Sheets may serialize time cells as ISO strings on 1899-12-30 (e.g. `1899-12-30T06:17:09.000Z`).
 * @param {unknown} t
 * @returns {string}
 */
export function normalizeTimeOnly(t) {
  if (!t) return '';
  const s = String(t).trim();
  if (!s) return '';
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return s + ':00';
  if (s.length > 10 && s.includes('T')) {
    // Google Sheets may serialize time cells as ISO on 1899-12-30 (e.g. `1899-12-30T06:17:09.000Z`).
    // In that case we MUST apply timezone conversion (Z → Taipei) to match what Sheets shows (e.g. 14:17:09).
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-GB', {
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    }
    // Fallback: just extract the time part if Date parsing fails.
    const m = s.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) return `${m[1]}:${m[2]}:${m[3] || '00'}`;
  }
  return s;
}

/**
 * Format a `HH:MM:SS` (or `HH:MM`) time string to 12-hour display (zh-TW: 上午/下午).
 * @param {unknown} t
 * @returns {string}
 */
export function formatTime12h(t) {
  const raw = normalizeTimeOnly(t);
  if (!raw) return '';
  const m = raw.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return raw;
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10) || 0));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10) || 0));
  const ss = Math.max(0, Math.min(59, parseInt(m[3] || '0', 10) || 0));
  const isPm = hh >= 12;
  const h12 = ((hh + 11) % 12) + 1;
  const prefix = isPm ? '下午' : '上午';
  return `${prefix}${h12}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

/** @param {string} ym `YYYY-MM` */
export function parseYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return { y, m };
}

/** Days in calendar month (1–12), local calendar math (not TZ-sensitive for day count). */
export function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

/**
 * Weekday 0=Sun … 6=Sat for `y-m-d` on the Taipei calendar (aligned with {@link todayStr}).
 */
export function weekdayTaipeiSundayZero(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 4, 0, 0)).getUTCDay();
}

/**
 * @returns {string} `YYYY-MM` for today in Taipei
 */
export function currentYm() {
  return todayStr().slice(0, 7);
}

/**
 * Shift `YYYY-MM` by delta months (negative allowed).
 * @param {string} ym
 * @param {number} delta
 * @returns {string}
 */
export function shiftYm(ym, delta) {
  let { y, m } = parseYm(ym);
  m += delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return `${y}-${pad2(m)}`;
}

/**
 * @param {string} ym `YYYY-MM`
 * @returns {string} e.g. `2026 年 4 月`
 */
export function formatMonthLabelZh(ym) {
  const { y, m } = parseYm(ym);
  return `${y} 年 ${m} 月`;
}

/**
 * One cell in a month grid (Sunday-first week).
 * @typedef {{ day: number | null, dateStr: string | null }} CalendarCell
 */

/**
 * Build cells for the Taipei calendar month `ym` (4–6 rows × 7 cols).
 * Pads trailing blanks only to complete the last week — avoids a full empty row
 * when the month fits in 5 weeks.
 * @param {string} ym `YYYY-MM`
 * @returns {CalendarCell[]}
 */
export function buildCalendarGridCells(ym) {
  const { y, m } = parseYm(ym);
  const dim = daysInMonth(y, m);
  const firstWd = weekdayTaipeiSundayZero(y, m, 1);
  /** @type {CalendarCell[]} */
  const cells = [];
  for (let i = 0; i < firstWd; i++) {
    cells.push({ day: null, dateStr: null });
  }
  for (let d = 1; d <= dim; d++) {
    cells.push({ day: d, dateStr: `${y}-${pad2(m)}-${pad2(d)}` });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, dateStr: null });
  }
  return cells;
}

export function compareDateStr(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function minDateStr(a, b) {
  return compareDateStr(a, b) <= 0 ? a : b;
}

/**
 * Add calendar days in Taipei (same convention as stored row dates).
 * @param {string} dateStr `YYYY-MM-DD`
 * @param {number} deltaDays
 */
export function addDaysTaipei(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const noonTwMs = Date.parse(`${y}-${pad2(m)}-${pad2(d)}T04:00:00.000Z`);
  const next = noonTwMs + deltaDays * 86_400_000;
  return new Date(next).toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

/** Monday `YYYY-MM-DD` of the ISO-style week containing `dateStr` (Mon–Sun, Taipei). */
export function getMondayOfWeekContaining(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const noonTwMs = Date.parse(`${y}-${pad2(m)}-${pad2(d)}T04:00:00.000Z`);
  const sun0 = new Date(noonTwMs).getUTCDay();
  const mon0 = (sun0 + 6) % 7;
  const mondayMs = noonTwMs - mon0 * 86_400_000;
  return new Date(mondayMs).toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

/** Sunday `YYYY-MM-DD` of the calendar week containing `dateStr`（Sun–Sat，台北日曆）. */
export function getSundayOfWeekContaining(dateStr) {
  const mon = getMondayOfWeekContaining(dateStr);
  return addDaysTaipei(mon, -1);
}

/**
 * Months between `currentYm()` and `ym` (positive = `ym` is later).
 * @param {string} ym `YYYY-MM`
 */
export function monthOffsetFromCurrentYm(ym) {
  const { y: ya, m: ma } = parseYm(ym);
  const { y: yb, m: mb } = parseYm(currentYm());
  return (ya - yb) * 12 + (ma - mb);
}

/**
 * Analysis range [fromStr, toStr] inclusive with optional navigation offsets.
 * Week: Sun-first；offset 0 = 本週（週日～今日或週六）；過去／未來整週為週日至週六。
 * Month: offset 0 = 本月 1 日至今日；其他月為整月。
 * Year: offset 0 = 本年 1/1 至今日；其他年為整年。
 *
 * @param {'week'|'month'|'year'} period
 * @param {{ weekOffset?: number, monthOffset?: number, yearOffset?: number }} opts
 */
export function getAnalysisRangeAnchored(period, opts = {}) {
  const weekOffset = opts.weekOffset ?? 0;
  const monthOffset = opts.monthOffset ?? 0;
  const yearOffset = opts.yearOffset ?? 0;
  const today = todayStr();
  const [y0, mo, d0] = today.split('-').map(Number);

  if (period === 'year') {
    const y = y0 + yearOffset;
    const fromStr = `${y}-01-01`;
    const toStr = yearOffset === 0 ? today : `${y}-12-31`;
    const periodLabel = `${y} 年`;
    return { fromStr, toStr, periodLabel };
  }

  if (period === 'month') {
    const ym = shiftYm(currentYm(), monthOffset);
    const { y, m } = parseYm(ym);
    const fromStr = `${y}-${pad2(m)}-01`;
    const dim = daysInMonth(y, m);
    const lastOfMonth = `${y}-${pad2(m)}-${pad2(dim)}`;
    const toStr = monthOffset === 0 ? minDateStr(today, lastOfMonth) : lastOfMonth;
    const periodLabel = formatMonthLabelZh(ym);
    return { fromStr, toStr, periodLabel };
  }

  const sundayThisWeek = getSundayOfWeekContaining(today);
  const weekStartSunday = addDaysTaipei(sundayThisWeek, weekOffset * 7);
  const saturdayStr = addDaysTaipei(weekStartSunday, 6);
  const fromStr = weekStartSunday;
  let toStr;
  if (weekOffset === 0) {
    toStr = minDateStr(today, saturdayStr);
  } else {
    toStr = saturdayStr;
  }
  const periodLabel = `${fromStr} ～ ${toStr}`;
  return { fromStr, toStr, periodLabel };
}

/**
 * @deprecated Prefer {@link getAnalysisRangeAnchored} with default offsets.
 * Analysis range labels and [fromStr, toStr] inclusive, using Taipei calendar
 * (aligned with todayStr() / stored row dates).
 */
export function getAnalysisRange(period) {
  return getAnalysisRangeAnchored(period, {});
}
