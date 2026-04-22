import { tripDetailState } from '../state-accessors.js';
import { tripExpenseBillNtd } from '../finance.js';
import { emptyHTML } from '../views-shared.js';
import { addDaysTaipei, compareDateStr, normalizeDate, todayStr, weekdayTaipeiSundayZero } from '../time.js';
import { bindScrollReveal, esc, jq } from '../utils.js';
import { isTripCnyModeEnabled, readLiveCnyCache, readSavedCnyTwdRate, cnyAuxAmountFromNtd } from '../trip-cny-rate.js';
import { tripExpenseHTML, tripSettlementHTML } from './records.js';

function minDateStrInTripRecords(expenses, settlements) {
  const ds = [];
  for (const e of expenses) {
    const d = e.date && String(e.date).slice(0, 10);
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) ds.push(d);
  }
  for (const s of settlements) {
    const d = s.date && String(s.date).slice(0, 10);
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) ds.push(d);
  }
  if (ds.length === 0) return '';
  return ds.reduce((a, b) => (compareDateStr(a, b) <= 0 ? a : b));
}

function maxDateStrInTripRecords(expenses, settlements) {
  const ds = [];
  for (const e of expenses) {
    const d = e.date && String(e.date).slice(0, 10);
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) ds.push(d);
  }
  for (const s of settlements) {
    const d = s.date && String(s.date).slice(0, 10);
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) ds.push(d);
  }
  if (ds.length === 0) return '';
  return ds.reduce((a, b) => (compareDateStr(a, b) >= 0 ? a : b));
}

export function tripHistoryDateRange(trip, expenses, settlements) {
  const fromCreated = normalizeDate(trip.createdAt) || '';
  const startFromCreated = /^\d{4}-\d{2}-\d{2}/.test(fromCreated) ? fromCreated.slice(0, 10) : '';
  const minRec = minDateStrInTripRecords(expenses, settlements);
  const maxRec = maxDateStrInTripRecords(expenses, settlements);
  const start = minRec || startFromCreated || todayStr();
  let end = maxRec || start;
  if (compareDateStr(end, start) < 0) end = start;
  return { start, end };
}

function eachDateInclusive(start, end) {
  const out = [];
  let d = start;
  while (compareDateStr(d, end) <= 0) {
    out.push(d);
    d = addDaysTaipei(d, 1);
  }
  return out;
}

export function tripStatsByDateFromTrip(expenses, settlements) {
  const m = new Map();
  for (const e of expenses) {
    if (!e.date) continue;
    m.set(e.date, (m.get(e.date) || 0) + 1);
  }
  for (const s of settlements) {
    if (!s.date) continue;
    m.set(s.date, (m.get(s.date) || 0) + 1);
  }
  return m;
}

function sundayOnOrBefore(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = weekdayTaipeiSundayZero(y, m, d);
  return addDaysTaipei(dateStr, -wd);
}

function tripHistoryMaxWeekOffset(firstSunday, lastSunday) {
  let max = 0;
  for (let s = firstSunday; compareDateStr(s, lastSunday) < 0; s = addDaysTaipei(s, 7)) {
    max++;
  }
  return max;
}

export function tripHistoryStripHTML(range, weekOffset, statsByDate, filterDate, today) {
  const wdLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const firstSunday = sundayOnOrBefore(range.start);
  const lastSunday = sundayOnOrBefore(range.end);
  const maxOffset = tripHistoryMaxWeekOffset(firstSunday, lastSunday);
  const w = Math.min(Math.max(0, weekOffset), maxOffset);
  const pageSunday = addDaysTaipei(firstSunday, w * 7);
  const pageSaturday = addDaysTaipei(pageSunday, 6);
  const totalDays = compareDateStr(range.start, range.end) <= 0 ? eachDateInclusive(range.start, range.end).length : 0;
  const canPrev = w > 0;
  const canNext = w < maxOffset;
  const cells = [];
  let pageSpanFirst = '';
  let pageSpanLast = '';
  for (let i = 0; i < 7; i++) {
    const ds = addDaysTaipei(pageSunday, i);
    const inRange = compareDateStr(ds, range.start) >= 0 && compareDateStr(ds, range.end) <= 0;
    if (!inRange) continue;
    if (!pageSpanFirst) pageSpanFirst = ds;
    pageSpanLast = ds;
    const has = statsByDate.get(ds) || 0;
    const isToday = ds === today;
    const isSel = filterDate === ds;
    const aria = has > 0 ? `${ds}，${has} 筆` : ds;
    cells.push(
      `<button type="button" class="trip-history-cell${isToday ? ' trip-history-cell--today' : ''}${isSel ? ' trip-history-cell--selected' : ''}"
        onclick='selectTripHistoryDay(${jq(ds)})'
        aria-label="${esc(aria)}"
        aria-pressed="${isSel ? 'true' : 'false'}">
        <span class="trip-history-wd">${wdLabels[i]}</span>
        <span class="trip-history-daynum">${parseInt(ds.slice(8, 10), 10)}</span>
      </button>`,
    );
  }
  const rangeMeta =
    totalDays > 0 && pageSpanFirst && pageSpanLast
      ? `${pageSpanFirst.slice(5)}～${pageSpanLast.slice(5)} · 行程共 ${totalDays} 天`
      : totalDays > 0
        ? `${pageSunday.slice(5)}～${pageSaturday.slice(5)} · 行程共 ${totalDays} 天`
        : '尚無日期範圍';
  const html = `<div class="trip-history-nav-wrap">
    <div class="trip-history-strip-row">
      <button type="button" class="analysis-nav-btn trip-history-week-nav" onclick="shiftTripHistoryWeek(-1)" aria-label="上一週（週日為每列第一天）"${canPrev ? '' : ' disabled'}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <div class="trip-history-strip" role="group" aria-label="行程日期，點選單日篩選；再點同一日顯示全部">${cells.join('')}</div>
      <button type="button" class="analysis-nav-btn trip-history-week-nav" onclick="shiftTripHistoryWeek(1)" aria-label="下一週（週日為每列第一天）"${canNext ? '' : ' disabled'}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
      </button>
    </div>
  </div>`;
  return { html, rangeMeta };
}

function tripHistorySubtotalLabel(ntSub, tripId) {
  const base = `小計 NT$${Math.round(ntSub).toLocaleString()}`;
  if (!tripId || !isTripCnyModeEnabled(tripId)) return base;
  const live = readLiveCnyCache();
  const rate = live && live.rate > 0 ? live.rate : readSavedCnyTwdRate();
  if (!(rate > 0) || !(ntSub > 0)) return base;
  const c = cnyAuxAmountFromNtd(Math.round(ntSub), rate);
  if (!(c > 0)) return base;
  const t = c.toFixed(2).replace(/\.?0+$/, '');
  return `${base} <span class="trip-day-sub-cny">¥${t}</span>`;
}

function buildTripLedgerOrderIndex(tripId, allRows) {
  const idx = new Map();
  allRows.forEach((row, i) => {
    if (!row?.id) return;
    if (row.type === 'tripExpense' && row.action === 'add' && row.tripId === tripId) idx.set(row.id, i);
    if (row.type === 'tripSettlement' && row.action === 'add' && row.tripId === tripId) idx.set(row.id, i);
  });
  return idx;
}

export function buildTripExpensesByDayHTML(expenses, settlements, trip, allRows, filterDate) {
  const orderIdx = buildTripLedgerOrderIndex(trip.id, allRows);
  const byDay = {};
  const push = (d, item) => {
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(item);
  };
  for (const e of expenses) push(e.date || '（無日期）', { kind: 'expense', data: e });
  for (const s of settlements) push(s.date || '（無日期）', { kind: 'settlement', data: s });

  const rawDays = Object.keys(byDay).sort().reverse();
  const days = filterDate ? (byDay[filterDate] ? [filterDate] : []) : rawDays;

  if (filterDate && days.length === 0) {
    return emptyHTML('此日無紀錄', '換一天，或再點週曆上同一日以顯示全部');
  }

  let recIdx = 0;
  const sortDayList = list => {
    list.sort((a, b) => {
      const ia = orderIdx.get(a.data.id) ?? -1;
      const ib = orderIdx.get(b.data.id) ?? -1;
      return ib - ia;
    });
  };

  if (!filterDate) {
    if (rawDays.length === 0) return '';
    const flatItems = [];
    for (const d of rawDays) {
      const list = byDay[d];
      sortDayList(list);
      for (const item of list) flatItems.push(item);
    }
    const totalCount = flatItems.length;
    const totalSub = expenses.filter(e => !e._voided).reduce((s, e) => s + tripExpenseBillNtd(e), 0);
    const subLabel = tripHistorySubtotalLabel(totalSub, trip.id);
    return `
    <div class="trip-day-group trip-day-group--all" style="--day-i:0">
      <div class="trip-day-label">
        <span>全部 · ${totalCount} 筆</span>
        <span class="trip-day-sub">${subLabel}</span>
      </div>
      <div class="trip-day-items">
        ${flatItems
          .map(item =>
            item.kind === 'expense'
              ? tripExpenseHTML(item.data, trip.members.length, recIdx++)
              : tripSettlementHTML(item.data, recIdx++),
          )
          .join('')}
      </div>
    </div>`;
  }

  return days
    .map((d, dayIdx) => {
      const list = byDay[d];
      sortDayList(list);
      const expensesOnly = list.filter(x => x.kind === 'expense').map(x => x.data);
      const sub = expensesOnly.filter(e => !e._voided).reduce((s, e) => s + tripExpenseBillNtd(e), 0);
      const subLabel = tripHistorySubtotalLabel(sub, trip.id);
      return `
    <div class="trip-day-group" style="--day-i:${dayIdx}">
      <div class="trip-day-label">
        <span>${esc(d)} · ${list.length} 筆</span>
        <span class="trip-day-sub">${subLabel}</span>
      </div>
      <div class="trip-day-items">
        ${list
          .map(item =>
            item.kind === 'expense'
              ? tripExpenseHTML(item.data, trip.members.length, recIdx++)
              : tripSettlementHTML(item.data, recIdx++),
          )
          .join('')}
      </div>
    </div>`;
    })
    .join('');
}

export function renderTripHistory(expenses, settlements, trip, allRows, reveal = false) {
  const state = tripDetailState();
  const expEl = document.getElementById('detail-expenses');
  if (expEl._scrollRevealCleanup) expEl._scrollRevealCleanup();
  const range = tripHistoryDateRange(trip, expenses, settlements);
  const firstSunday = sundayOnOrBefore(range.start);
  const lastSunday = sundayOnOrBefore(range.end);
  const maxWeekOffset = tripHistoryMaxWeekOffset(firstSunday, lastSunday);
  if (state.tripDetailHistoryWeekOffset > maxWeekOffset) {
    state.tripDetailHistoryWeekOffset = maxWeekOffset;
  }
  const statsByDate = tripStatsByDateFromTrip(expenses, settlements);
  const today = todayStr();
  const filterDate = state.tripDetailHistoryFilterDate;
  const { html: stripHtml, rangeMeta } = tripHistoryStripHTML(
    range,
    state.tripDetailHistoryWeekOffset,
    statsByDate,
    filterDate,
    today,
  );
  const headerMetaEl = document.getElementById('trip-history-range-meta');
  if (headerMetaEl) {
    headerMetaEl.textContent = rangeMeta;
    headerMetaEl.hidden = !rangeMeta;
  }
  if (expenses.length === 0 && settlements.length === 0) {
    expEl.innerHTML = `${stripHtml}<div class="trip-history-list">${emptyHTML('還沒有消費或還款紀錄', '')}</div>`;
  } else {
    expEl.innerHTML = `${stripHtml}<div class="trip-history-list">${buildTripExpensesByDayHTML(
      expenses,
      settlements,
      trip,
      allRows,
      filterDate,
    )}</div>`;
  }

  if (expenses.length > 0 || settlements.length > 0) {
    bindScrollReveal(expEl, '.trip-day-group, .record-item', { enabled: reveal });
  }
}

export function shiftTripHistoryWeek(delta) {
  const state = tripDetailState();
  state.tripDetailHistoryWeekOffset += delta;
  if (state.tripDetailHistoryWeekOffset < 0) state.tripDetailHistoryWeekOffset = 0;
  import('../views-trip-detail.js').then(m => m.renderTripDetail());
}

export function selectTripHistoryDay(ds) {
  const state = tripDetailState();
  if (state.tripDetailHistoryFilterDate === ds) {
    state.tripDetailHistoryFilterDate = null;
  } else {
    state.tripDetailHistoryFilterDate = ds;
  }
  import('../views-trip-detail.js').then(m => m.renderTripDetail());
}

export function clearTripHistoryDayFilter() {
  const state = tripDetailState();
  state.tripDetailHistoryFilterDate = null;
  import('../views-trip-detail.js').then(m => m.renderTripDetail());
}
