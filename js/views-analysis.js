import { USER_A, USER_B } from './config.js';
import { appState } from './state.js';
import { getDailyRecords } from './data.js';
import {
  addDaysTaipei,
  buildCalendarGridCells,
  compareDateStr,
  formatMonthLabelZh,
  getAnalysisRangeAnchored,
  getSundayOfWeekContaining,
  shiftYm,
  currentYm,
  todayStr,
} from './time.js';
import { esc, jq, prefersReducedMotion } from './utils.js';
import { makePieChartSVG, getCatPieColor } from './pie-chart.js';
import { gamblingSplitFromCatTotals } from './category.js';
import { accumulateDailyGamblingWinLose } from './finance.js';

let analysisCountGen = 0;

/** 切換離開分析頁時呼叫，中止數字刷動避免佔用主執行緒、底欄需點兩次才切頁 */
export function cancelAnalysisCountAnim() {
  analysisCountGen++;
}

function persistPieLabelOpts() {
  try {
    localStorage.setItem(
      'ledger_pie_label_opts_v1',
      JSON.stringify({
        cat: appState.pieLabelShowCategory,
        pct: appState.pieLabelShowPct,
        amt: appState.pieLabelShowAmount,
      }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * @param {HTMLElement} el
 * @param {number} to
 * @param {'currency'|'pct'} mode
 * @param {number} gen
 * @param {number} delayMs
 * @param {number} durationMs
 */
function runCountUp(el, to, mode, gen, delayMs, durationMs) {
  const from = 0;
  const target = Math.round(to);
  const startAnim = () => {
    if (gen !== analysisCountGen) return;
    const start = performance.now();
    function frame(now) {
      if (gen !== analysisCountGen) return;
      const u = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - u) ** 3;
      const val = Math.round(from + (target - from) * eased);
      if (mode === 'pct') {
        el.textContent = `${val}%`;
      } else {
        el.textContent = `NT$${val.toLocaleString()}`;
      }
      if (u < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };
  if (delayMs > 0) window.setTimeout(startAnim, delayMs);
  else startAnim();
}

function playAnalysisCountUps(root) {
  analysisCountGen++;
  const gen = analysisCountGen;
  if (prefersReducedMotion()) return;

  const nodes = root.querySelectorAll('[data-analysis-count]');
  const baseDuration = 820;
  nodes.forEach((el, idx) => {
    const raw = el.getAttribute('data-analysis-count');
    const to = parseFloat(raw || '0') || 0;
    const mode = el.getAttribute('data-analysis-mode') === 'pct' ? 'pct' : 'currency';
    const delay = idx * 48;
    runCountUp(el, to, mode, gen, delay, baseDuration);
  });
}

/**
 * @param {'cat'|'pct'|'amt'} field
 * @param {boolean} checked
 */
export function setPieLabelOption(field, checked) {
  const v = !!checked;
  if (field === 'cat') appState.pieLabelShowCategory = v;
  else if (field === 'pct') appState.pieLabelShowPct = v;
  else if (field === 'amt') appState.pieLabelShowAmount = v;
  persistPieLabelOpts();
  renderAnalysis();
}

export function setAnalysisPeriod(p) {
  appState.analysisPeriod = p;
  appState.analysisFilterDate = null;
  renderAnalysis();
}

export function shiftAnalysisWeek(delta) {
  appState.analysisWeekOffset += delta;
  appState.analysisFilterDate = null;
  renderAnalysis();
}

export function shiftAnalysisMonth(delta) {
  appState.analysisMonthOffset += delta;
  appState.analysisFilterDate = null;
  renderAnalysis();
}

export function shiftAnalysisYear(delta) {
  appState.analysisYearOffset += delta;
  appState.analysisFilterDate = null;
  renderAnalysis();
}

export function selectAnalysisDay(dateStr) {
  if (appState.analysisFilterDate === dateStr) {
    appState.analysisFilterDate = null;
  } else {
    appState.analysisFilterDate = dateStr;
  }
  renderAnalysis();
}

export function clearAnalysisDayFilter() {
  appState.analysisFilterDate = null;
  renderAnalysis();
}

/** @param {import('./model.js').LedgerRow[]} allDaily */
function statsByDateFromDaily(allDaily) {
  const m = new Map();
  for (const r of allDaily) {
    if (!r.date) continue;
    m.set(r.date, (m.get(r.date) || 0) + 1);
  }
  return m;
}

/** 與分析區塊相同：日常金額加總（含兩人付時為胡＋詹）。索引 1–12。 */
function aggregateYearMonthTotals(allDaily, displayYear) {
  /** @type {number[]} */
  const totals = Array(13).fill(0);
  for (const r of allDaily) {
    if (!r.date) continue;
    const [yy, mm] = r.date.split('-').map(Number);
    if (yy !== displayYear || mm < 1 || mm > 12) continue;
    if (r.splitMode === '兩人付') {
      const hu = parseFloat(r.paidHu) || 0;
      const zhan = parseFloat(r.paidZhan) || 0;
      totals[mm] += hu + zhan;
    } else {
      totals[mm] += parseFloat(r.amount) || 0;
    }
  }
  return totals;
}

function formatYearMonthCellAmount(total) {
  const x = Math.round(total);
  if (x === 0) {
    return '<span class="analysis-year-mo-amt analysis-year-mo-amt--zero">—</span>';
  }
  return `<span class="analysis-year-mo-amt">NT$${x.toLocaleString()}</span>`;
}

/**
 * 每月對「結算餘額」的淨影響（與 {@link views-home.js} buildRunningBalanceMap 同邏輯）。
 * 正＝該月讓「詹欠胡」增加；負＝該月讓「胡欠詹」增加。
 * @param {number} displayYear
 * @param {import('./model.js').LedgerRow[]} recordsNewestFirst getDailyRecords() 回傳順序（新→舊）
 * @returns {(number|null)[]} 索引 1–12；該月無任何帳務列則為 null
 */
function computeYearMonthRunningDelta(displayYear, recordsNewestFirst) {
  const ordered = [...recordsNewestFirst].reverse();
  const prefix = `${displayYear}-`;
  let running = 0;
  /** @type {(number|null)[]} */
  const monthStart = Array(13).fill(null);
  /** @type {(number|null)[]} */
  const monthEnd = Array(13).fill(null);

  for (const r of ordered) {
    const d = r.date;
    if (d && d.startsWith(prefix)) {
      const mm = parseInt(d.slice(5, 7), 10);
      if (mm >= 1 && mm <= 12 && monthStart[mm] === null) {
        monthStart[mm] = running;
      }
    }
    if (!r._voided) {
      const a = parseFloat(r.amount) || 0;
      if (r.type === 'settlement') {
        if (r.paidBy === USER_A) running += a;
        else running -= a;
      } else if (r.splitMode === '兩人付') {
        const hu = parseFloat(r.paidHu) || 0;
        const zhan = parseFloat(r.paidZhan) || 0;
        running += (hu - zhan) / 2;
      } else {
        let shareZhan = 0;
        let shareHu = 0;
        if (r.splitMode === '均分') {
          shareHu = a / 2;
          shareZhan = a / 2;
        } else if (r.splitMode === '只有胡') {
          shareHu = a;
        } else {
          shareZhan = a;
        }
        if (r.paidBy === USER_A) running += shareZhan;
        else running -= shareHu;
      }
    }
    if (d && d.startsWith(prefix)) {
      const mm = parseInt(d.slice(5, 7), 10);
      if (mm >= 1 && mm <= 12) {
        monthEnd[mm] = running;
      }
    }
  }

  /** @type {(number|null)[]} */
  const delta = Array(13).fill(null);
  for (let mi = 1; mi <= 12; mi++) {
    if (monthStart[mi] !== null && monthEnd[mi] !== null) {
      delta[mi] = monthEnd[mi] - monthStart[mi];
    }
  }
  return delta;
}

/**
 * 各日對「結算餘額」的淨影響（與 buildRunningBalanceMap 同邏輯）。
 * @param {import('./model.js').LedgerRow[]} recordsNewestFirst
 * @param {string[]} dateStrs YYYY-MM-DD
 * @returns {Map<string, number|null>} 該日無帳列則 null
 */
export function computeDateRunningDeltas(recordsNewestFirst, dateStrs) {
  const unique = [...new Set(dateStrs)];
  const dateSet = new Set(unique);
  const ordered = [...recordsNewestFirst].reverse();
  let running = 0;
  /** @type {Map<string, number>} */
  const started = new Map();
  /** @type {Map<string, number>} */
  const ended = new Map();

  for (const r of ordered) {
    const d = r.date;
    if (d && dateSet.has(d) && !started.has(d)) {
      started.set(d, running);
    }
    if (!r._voided) {
      const a = parseFloat(r.amount) || 0;
      if (r.type === 'settlement') {
        if (r.paidBy === USER_A) running += a;
        else running -= a;
      } else if (r.splitMode === '兩人付') {
        const hu = parseFloat(r.paidHu) || 0;
        const zhan = parseFloat(r.paidZhan) || 0;
        running += (hu - zhan) / 2;
      } else {
        let shareZhan = 0;
        let shareHu = 0;
        if (r.splitMode === '均分') {
          shareHu = a / 2;
          shareZhan = a / 2;
        } else if (r.splitMode === '只有胡') {
          shareHu = a;
        } else {
          shareZhan = a;
        }
        if (r.paidBy === USER_A) running += shareZhan;
        else running -= shareHu;
      }
    }
    if (d && dateSet.has(d)) {
      ended.set(d, running);
    }
  }

  const out = new Map();
  for (const ds of unique) {
    if (started.has(ds) && ended.has(ds)) {
      out.set(ds, ended.get(ds) - started.get(ds));
    } else {
      out.set(ds, null);
    }
  }
  return out;
}

/** @param {number|null} delta */
export function directionClassFromDelta(delta) {
  if (delta == null) return '';
  const e = 1e-6;
  if (delta > e) return ' analysis-period-dir--zhan-owes';
  if (delta < -e) return ' analysis-period-dir--hu-owes';
  return ' analysis-period-dir--neutral';
}

/** @param {number|null} delta */
export function directionAriaFromDelta(delta) {
  if (delta == null) return '';
  const e = 1e-6;
  if (delta > e) return '，結算淨向 詹欠胡';
  if (delta < -e) return '，結算淨向 胡欠詹';
  return '，結算淨向 持平';
}

/** 月曆格內顯示：該日對結算餘額的淨影響（與 computeDateRunningDeltas 一致） */
export function formatCalendarDayDeltaText(delta) {
  if (delta == null) return '';
  const n = Math.round(delta);
  if (n === 0) return '0';
  if (n > 0) return `+${n.toLocaleString()}`;
  return `-${Math.abs(n).toLocaleString()}`;
}

function analysisWeekNavHtml(weekStartSunday, today, statsByDate, filterDate) {
  const wdLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    weekDates.push(addDaysTaipei(weekStartSunday, i));
  }
  const deltaByDate = computeDateRunningDeltas(getDailyRecords(), weekDates);
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const ds = weekDates[i];
    const has = statsByDate.get(ds) || 0;
    const isToday = ds === today;
    const isSel = filterDate === ds;
    const aria = has > 0 ? `${ds}，${has} 筆` : ds;
    const dDelta = deltaByDate.get(ds);
    const dirCls = directionClassFromDelta(dDelta);
    const ariaDir = directionAriaFromDelta(dDelta);
    cells.push(
      `<button type="button" class="analysis-week-cell${isToday ? ' analysis-week-cell--today' : ''}${isSel ? ' analysis-week-cell--selected' : ''}${dirCls}"
        onclick='selectAnalysisDay(${jq(ds)})'
        aria-label="${esc(aria)}${ariaDir}"
        aria-pressed="${isSel ? 'true' : 'false'}">
        <span class="analysis-week-wd">${wdLabels[i]}</span>
        <span class="analysis-week-day">${parseInt(ds.slice(8, 10), 10)}</span>
      </button>`,
    );
  }
  return `<div class="analysis-period-nav analysis-period-nav--week">
    <div class="analysis-cal-nav-row">
      <button type="button" class="analysis-nav-btn" onclick="shiftAnalysisWeek(-1)" aria-label="上一週">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <div class="analysis-cal-nav-title">本週</div>
      <button type="button" class="analysis-nav-btn" onclick="shiftAnalysisWeek(1)" aria-label="下一週">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
      </button>
    </div>
    <div class="analysis-week-strip" role="group" aria-label="本週各日">${cells.join('')}</div>
  </div>`;
}

function analysisMonthNavHtml(ym, today, statsByDate, filterDate) {
  const cells = buildCalendarGridCells(ym);
  const monthDates = cells.filter(c => c.day != null).map(c => c.dateStr);
  const deltaByDate = computeDateRunningDeltas(getDailyRecords(), monthDates);
  const numRows = cells.length / 7;
  const rows = [];
  for (let row = 0; row < numRows; row++) {
    const rowCells = cells.slice(row * 7, row * 7 + 7).map(cell => {
      if (cell.day == null) {
        return '<div class="analysis-cal-cell analysis-cal-cell--empty" aria-hidden="true"></div>';
      }
      const ds = cell.dateStr;
      const has = statsByDate.get(ds) || 0;
      const isToday = ds === today;
      const isSel = filterDate === ds;
      const dDelta = deltaByDate.get(ds);
      const dirCls = directionClassFromDelta(dDelta);
      const ariaDir = directionAriaFromDelta(dDelta);
      const deltaTxt = formatCalendarDayDeltaText(dDelta);
      const deltaEl =
        dDelta != null
          ? `<span class="cal-cell-delta" aria-hidden="true">${esc(deltaTxt)}</span>`
          : '';
      const ariaBase = has > 0 ? `${ds}，${has} 筆` : ds;
      const ariaAmt = dDelta != null ? `，結算淨額 ${deltaTxt}` : '';
      const aria = `${ariaBase}${ariaAmt}${ariaDir}`;
      return `<button type="button" class="analysis-cal-cell${isToday ? ' analysis-cal-cell--today' : ''}${isSel ? ' analysis-cal-cell--selected' : ''}${dirCls}"
        onclick='selectAnalysisDay(${jq(ds)})'
        aria-label="${esc(aria)}"
        aria-pressed="${isSel ? 'true' : 'false'}">
        <span class="analysis-cal-cell-day">${cell.day}</span>${deltaEl}
      </button>`;
    });
    rows.push(`<div class="analysis-cal-row">${rowCells.join('')}</div>`);
  }
  const wdLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const wdRow = wdLabels.map(w => `<div class="analysis-cal-wd">${esc(w)}</div>`).join('');
  const label = formatMonthLabelZh(ym);
  return `<div class="analysis-period-nav analysis-period-nav--month">
    <div class="analysis-cal-nav-row">
      <button type="button" class="analysis-nav-btn" onclick="shiftAnalysisMonth(-1)" aria-label="上一個月">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <div class="analysis-cal-nav-title">${esc(label)}</div>
      <button type="button" class="analysis-nav-btn" onclick="shiftAnalysisMonth(1)" aria-label="下一個月">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
      </button>
    </div>
    <div class="analysis-cal-weekdays">${wdRow}</div>
    <div class="analysis-cal-grid" role="grid" aria-label="月曆，點選單日">${rows.join('')}</div>
  </div>`;
}

function analysisYearNavHtml(displayYear, allDaily) {
  const monthTotals = aggregateYearMonthTotals(allDaily, displayYear);
  const monthDelta = computeYearMonthRunningDelta(displayYear, getDailyRecords());
  const monthBtns = [];
  for (let mi = 1; mi <= 12; mi++) {
    const t = monthTotals[mi];
    const spend = Math.round(t) > 0;
    const amt = formatYearMonthCellAmount(t);
    const ariaAmt = spend ? `，消費 NT$${Math.round(t).toLocaleString()}` : '，無消費';
    const d = monthDelta[mi];
    const dirCls = directionClassFromDelta(d);
    const ariaDir = directionAriaFromDelta(d);
    monthBtns.push(
      `<div class="analysis-year-mo${dirCls}" aria-label="${displayYear} 年 ${mi} 月${ariaAmt}${ariaDir}">
        <span class="analysis-year-mo-label">${mi} 月</span>
        ${amt}
      </div>`,
    );
  }
  const label = `${displayYear} 年`;
  return `<div class="analysis-period-nav analysis-period-nav--year">
    <div class="analysis-cal-nav-row">
      <button type="button" class="analysis-nav-btn" onclick="shiftAnalysisYear(-1)" aria-label="上一年">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <div class="analysis-cal-nav-title">${esc(label)}</div>
      <button type="button" class="analysis-nav-btn" onclick="shiftAnalysisYear(1)" aria-label="下一年">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
      </button>
    </div>
    <div class="analysis-year-months" role="group" aria-label="各月消費金額">${monthBtns.join('')}</div>
  </div>`;
}

function buildAnalysisPeriodNav(period, allDaily, filterDate) {
  const today = todayStr();
  const statsByDate = statsByDateFromDaily(allDaily);
  const weekStartSunday = addDaysTaipei(getSundayOfWeekContaining(today), appState.analysisWeekOffset * 7);
  const monthYm = shiftYm(currentYm(), appState.analysisMonthOffset);
  const y0 = parseInt(today.slice(0, 4), 10);
  const displayYear = y0 + appState.analysisYearOffset;
  if (period === 'week') {
    return analysisWeekNavHtml(weekStartSunday, today, statsByDate, filterDate);
  }
  if (period === 'month') {
    return analysisMonthNavHtml(monthYm, today, statsByDate, filterDate);
  }
  return analysisYearNavHtml(displayYear, allDaily);
}

export function renderAnalysis() {
  const el = document.getElementById('analysis-content');
  if (!el) return;

  const anchorOpts = {
    weekOffset: appState.analysisWeekOffset,
    monthOffset: appState.analysisMonthOffset,
    yearOffset: appState.analysisYearOffset,
  };
  const base = getAnalysisRangeAnchored(appState.analysisPeriod, anchorOpts);
  let fromStr = base.fromStr;
  let toStr = base.toStr;
  let periodLabel = base.periodLabel;

  if (appState.analysisFilterDate) {
    const fd = appState.analysisFilterDate;
    if (compareDateStr(fd, base.fromStr) >= 0 && compareDateStr(fd, base.toStr) <= 0) {
      fromStr = fd;
      toStr = fd;
      periodLabel = fd;
    } else {
      appState.analysisFilterDate = null;
    }
  }

  const allDaily = getDailyRecords().filter(r => !r._voided && r.type === 'daily');
  const periodNav = buildAnalysisPeriodNav(
    appState.analysisPeriod,
    allDaily,
    appState.analysisFilterDate,
  );
  const filterClearHtml = appState.analysisFilterDate
    ? `<div class="analysis-filter-clear-wrap"><button type="button" class="analysis-filter-clear btn btn-ghost btn-sm" onclick="clearAnalysisDayFilter()">顯示整段期間</button></div>`
    : '';

  const records = allDaily.filter(r => r.date >= fromStr && r.date <= toStr);

  let total = 0;
  let huTotal = 0;
  let zhanTotal = 0;
  const catTotals = {};
  for (const r of records) {
    const a = parseFloat(r.amount) || 0;
    if (r.splitMode === '兩人付') {
      const hu = parseFloat(r.paidHu) || 0;
      const zhan = parseFloat(r.paidZhan) || 0;
      huTotal += hu;
      zhanTotal += zhan;
      total += hu + zhan;
    } else {
      total += a;
      if (r.paidBy === USER_A) huTotal += a;
      else if (r.paidBy === USER_B) zhanTotal += a;
    }
    const cat = r.category || '未分類';
    catTotals[cat] = (catTotals[cat] || 0) + a;
  }

  const tabs = ['week', 'month', 'year']
    .map(
      p =>
        `<button onclick="setAnalysisPeriod('${p}')" style="flex:1;padding:9px;border-radius:10px;border:none;cursor:pointer;font-size:13px;font-weight:600;background:${appState.analysisPeriod === p ? 'var(--primary)' : 'var(--bg-secondary)'};color:${appState.analysisPeriod === p ? '#fff' : 'var(--text-muted)'};transition:.15s">
      ${{ week: '本週', month: '本月', year: '本年' }[p]}
    </button>`,
    )
    .join('');

  if (records.length === 0) {
    el.innerHTML = `
      <div class="analysis-tabs">${tabs}</div>
      ${periodNav}
      ${filterClearHtml}
      <div class="analysis-period">${esc(periodLabel)}</div>
      <div class="analysis-empty">
        <div class="analysis-empty-icon" aria-hidden="true">📊</div>
        <div class="analysis-empty-text">${esc(periodLabel)} 尚無支出紀錄</div>
      </div>`;
    return;
  }

  const huR = Math.round(huTotal);
  const zhanR = Math.round(zhanTotal);

  const { gambleTotal, nonGamblingTotal, nonGamblingSlices } = gamblingSplitFromCatTotals(catTotals, total);
  const gambleR = Math.round(gambleTotal);
  const nonGamR = Math.round(nonGamblingTotal);
  const pieDenom = nonGamblingTotal;
  const pieSlices = nonGamblingSlices.map(([cat, amt]) => ({
    cat,
    amount: amt,
    color: getCatPieColor(cat),
  }));

  let legendIdx = 0;
  const legendRows = [];
  for (const s of pieSlices) {
    const pctPie = pieDenom > 0 ? Math.round((s.amount / pieDenom) * 100) : 0;
    const amtR = Math.round(s.amount);
    legendRows.push(`<div class="analysis-legend-row" style="--legend-i:${legendIdx++}">
      <div class="analysis-legend-swatch" style="background:${s.color}"></div>
      <div class="analysis-legend-name">${esc(s.cat)}</div>
      <div class="analysis-legend-pct" data-analysis-count="${pctPie}" data-analysis-mode="pct">${prefersReducedMotion() ? `${pctPie}%` : '0%'}</div>
      <div class="analysis-legend-amt" data-analysis-count="${amtR}" data-analysis-mode="currency">${prefersReducedMotion() ? `NT$${amtR.toLocaleString()}` : 'NT$0'}</div>
    </div>`);
  }
  const legend = legendRows.join('');

  const dailyGamblePl = gambleR > 0 ? accumulateDailyGamblingWinLose(records) : null;
  const prm = prefersReducedMotion();
  const gamblePlHead = `<div class="analysis-gamble-pl-row analysis-gamble-pl-row--head">
      <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--name"></span>
      <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--num">贏</span>
      <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--num">輸</span>
      <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--num">淨</span>
    </div>`;
  const gamblePlCard =
    gambleR > 0 && dailyGamblePl
      ? `<div class="analysis-gamble-pl">
      <div class="analysis-gamble-pl-title">賭博輸贏</div>
      <div class="analysis-gamble-pl-grid" role="table" aria-label="賭博輸贏">
      ${gamblePlHead}
      ${[USER_A, USER_B]
        .map(name => {
          const x = dailyGamblePl[name];
          const wR = Math.round(x.win);
          const lR = Math.round(x.lose);
          const nR = Math.round(x.net);
          const netCls =
            nR > 0 ? 'analysis-gamble-pl-net--win' : nR < 0 ? 'analysis-gamble-pl-net--lose' : '';
          return `<div class="analysis-gamble-pl-row">
        <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--name">${esc(name)}</span>
        <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--num"><span data-analysis-count="${wR}" data-analysis-mode="currency">${prm ? `NT$${wR.toLocaleString()}` : 'NT$0'}</span></span>
        <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--num"><span data-analysis-count="${lR}" data-analysis-mode="currency">${prm ? `NT$${lR.toLocaleString()}` : 'NT$0'}</span></span>
        <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--num analysis-gamble-pl-cell--net ${netCls}"><span data-analysis-count="${nR}" data-analysis-mode="currency">${prm ? `NT$${nR.toLocaleString()}` : 'NT$0'}</span></span>
      </div>`;
        })
        .join('')}
      </div>
      <div class="analysis-gamble-pl-footnote">加總 NT$${gambleR.toLocaleString()}</div>
    </div>`
      : '';

  const labelOpts = {
    cat: appState.pieLabelShowCategory,
    pct: appState.pieLabelShowPct,
    amt: appState.pieLabelShowAmount,
  };

  const pieToggles = `
    <div class="analysis-pie-label-toggles" role="group" aria-label="圓餅圖環上顯示">
      <label class="analysis-pie-label-chip">
        <input type="checkbox" ${appState.pieLabelShowCategory ? 'checked' : ''} onchange="setPieLabelOption('cat', this.checked)">
        <span>分類</span>
      </label>
      <label class="analysis-pie-label-chip">
        <input type="checkbox" ${appState.pieLabelShowPct ? 'checked' : ''} onchange="setPieLabelOption('pct', this.checked)">
        <span>比例</span>
      </label>
      <label class="analysis-pie-label-chip">
        <input type="checkbox" ${appState.pieLabelShowAmount ? 'checked' : ''} onchange="setPieLabelOption('amt', this.checked)">
        <span>金額</span>
      </label>
    </div>`;

  const pieBlock =
    pieSlices.length === 0 && gambleR > 0
      ? `<div class="analysis-pie-empty">此期間無一般支出分類可畫圓餅（賭博見上方輸贏分析）</div>`
      : `<div class="analysis-pie-wrap">
      ${makePieChartSVG(pieSlices, pieDenom > 0 ? pieDenom : 1, labelOpts)}
    </div>`;

  const statHuStart = prefersReducedMotion() ? `NT$${huR.toLocaleString()}` : 'NT$0';
  const statZhanStart = prefersReducedMotion() ? `NT$${zhanR.toLocaleString()}` : 'NT$0';
  const totalPctStart = prefersReducedMotion() ? '100%' : '0%';
  const pieLegendAmtStart = prm ? `NT$${nonGamR.toLocaleString()}` : 'NT$0';

  el.innerHTML = `
    <div class="analysis-tabs">${tabs}</div>
    ${periodNav}
    ${filterClearHtml}
    <div class="analysis-period">${esc(periodLabel)}</div>
    <div class="analysis-stats-grid">
      <div class="analysis-stat-card">
        <div class="analysis-stat-label">${esc(USER_A)} 付出</div>
        <div class="analysis-stat-val analysis-stat-val--hu" data-analysis-count="${huR}" data-analysis-mode="currency">${statHuStart}</div>
      </div>
      <div class="analysis-stat-card">
        <div class="analysis-stat-label">${esc(USER_B)} 付出</div>
        <div class="analysis-stat-val analysis-stat-val--zhan" data-analysis-count="${zhanR}" data-analysis-mode="currency">${statZhanStart}</div>
      </div>
    </div>
    ${gamblePlCard}
    ${pieToggles}
    ${pieBlock}
    <div class="analysis-legend-card">
      ${legend}
      <div class="analysis-legend-row analysis-legend-row--total" style="--legend-n:${legendIdx}">
        <div class="analysis-legend-swatch analysis-legend-swatch--empty"></div>
        <div class="analysis-legend-name analysis-legend-name--total">合計</div>
        <div class="analysis-legend-pct" data-analysis-count="100" data-analysis-mode="pct">${totalPctStart}</div>
        <div class="analysis-legend-amt analysis-legend-amt--total" data-analysis-count="${nonGamR}" data-analysis-mode="currency">${pieLegendAmtStart}</div>
      </div>
    </div>`;

  playAnalysisCountUps(el);
}
