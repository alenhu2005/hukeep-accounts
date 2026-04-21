import { appState } from './state.js';
import {
  getTripById,
  getTripExpenses,
  getTripSettlementAdjustmentsFromRows,
  getTripSettlementDisplayRowsFromRows,
  getAvatarUrlByMemberName,
  getKnownMemberNames,
  getMemberColor,
  isHiddenMemberColorId,
  getHiddenMemberStyleKey,
} from './data.js';
import { computeExpenseShares, computeSettlements, tripExpenseBillNtd, tripExpenseFxFeeNtd } from './finance.js';
import { categoryBadgeHTML } from './category.js';
import { esc, jq, jqAttr, memberToneClass, memberToneVars, prefersReducedMotion, bindScrollReveal, toast } from './utils.js';
import { emptyHTML } from './views-shared.js';
import { navigate } from './navigation.js';
import { addDaysTaipei, compareDateStr, normalizeDate, todayStr, weekdayTaipeiSundayZero } from './time.js';
import { renderTripLotteryCard } from './trip-lottery.js';
import {
  hydrateTripCnyRateInput,
  isTripCnyModeEnabled,
  enableTripCnyModePermanent,
  getDetailAmountNt,
  setDetailAmountFromNt,
  syncDetailAmountCurrencyToggleUi,
  updateCnyRateInlineDisplay,
  readLiveCnyCache,
  readSavedCnyTwdRate,
  cnyAuxAmountFromNtd,
} from './trip-cny-rate.js';
import { showConfirm } from './dialog.js';

let tripSettleAnimGen = 0;

function parseMoneyLike(v) {
  if (v == null) return 0;
  const compact = String(v).replace(/[^\d.]/g, '');
  const n = parseFloat(compact);
  return Number.isFinite(n) ? n : 0;
}

function hasAnyExplicitZeroRaw(rawsByMember, members) {
  return members.some(m => {
    const raw = String(rawsByMember?.[m] ?? '');
    if (!/\d/.test(raw)) return false;
    return parseMoneyLike(raw) === 0;
  });
}

/** 離開行程明細時中止結算條／金額動畫 */
export function cancelTripSettlementAnim() {
  tripSettleAnimGen++;
}

/**
 * Reset trip-detail "add expense" amount draft.
 * Keeps item/note intact; clears total, payer amounts, and custom split amounts/state.
 * Called when leaving the page or switching payment modes.
 */
export function resetTripDetailAmountDraft(opts = {}) {
  const keepTotal = opts && opts.keepTotal === true;
  const totalEl = document.getElementById('d-amount');
  if (totalEl && !keepTotal) {
    totalEl.value = '';
  }
  if (!keepTotal) appState.detailAmountCurrency = 'TWD';
  if (totalEl) {
    totalEl.disabled = false;
    totalEl.classList.remove('split-custom-input--locked');
    totalEl.setAttribute('aria-disabled', 'false');
  }

  const per = document.getElementById('d-per-person');
  if (per) per.textContent = '';

  const payerList = document.getElementById('d-payers-list');
  if (payerList) payerList.innerHTML = '';

  // Clear multi-pay state (amount-related only).
  if (!keepTotal) appState.detailMultiPayTotalTouched = false;
  appState.detailMultiPayTouchedRows = {};
  appState.detailMultiPayLockedTarget = '';
  appState.detailMultiPayEditingTarget = '';
  appState.detailMultiPayNextRowId = 1;

  // Clear custom split state/values.
  appState.detailSplitCustom = {};
  appState.detailSplitTouched = {};
  if (!keepTotal) appState.detailSplitTotalTouched = false;
  if (!keepTotal) appState.detailSplitTotalDerived = false;
  appState.detailSplitEditingMember = '';
  appState.detailSplitLockedTarget = '';
  appState.detailSplitAutoFilledTarget = '';

  // Also clear any rendered custom split input values if present.
  const splitBox = document.getElementById('d-split-custom-list');
  if (splitBox) {
    splitBox.querySelectorAll('input[data-member]').forEach(inp => {
      inp.value = '';
      inp.disabled = false;
      inp.classList.remove('split-custom-input--locked');
      inp.setAttribute('aria-disabled', 'false');
    });
  }

  syncDetailAmountCurrencyToggleUi();
  updateCnyRateInlineDisplay();
}

function playTripSettlementAnimations() {
  const body = document.getElementById('settlement-body');
  if (!body) return;
  tripSettleAnimGen++;
  const gen = tripSettleAnimGen;
  const rows = body.querySelectorAll('.settlement-row--visual');
  if (rows.length === 0) return;

  const applyFinal = () => {
    rows.forEach(row => {
      const t = parseInt(row.getAttribute('data-amt') || '0', 10);
      const amtEl = row.querySelector('[data-settle-amt]');
      const cover = row.querySelector('.settlement-compare-cover');
      const pct = parseInt(row.getAttribute('data-bar-pct') || '0', 10);
      if (amtEl) amtEl.textContent = 'NT$' + t.toLocaleString();
      if (cover) cover.style.width = `${100 - pct}%`;
    });
  };

  if (prefersReducedMotion()) {
    applyFinal();
    return;
  }

  rows.forEach(row => {
    const amtEl = row.querySelector('[data-settle-amt]');
    const cover = row.querySelector('.settlement-compare-cover');
    if (amtEl) amtEl.textContent = 'NT$0';
    if (cover) cover.style.width = '100%';
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (gen !== tripSettleAnimGen) return;
      rows.forEach((row, idx) => {
        window.setTimeout(() => {
          if (gen !== tripSettleAnimGen) return;
          const cover = row.querySelector('.settlement-compare-cover');
          const pct = parseInt(row.getAttribute('data-bar-pct') || '0', 10);
          if (cover) cover.style.width = `${100 - pct}%`;
        }, 45 + idx * 85);
      });
      rows.forEach((row, idx) => {
        const target = parseInt(row.getAttribute('data-amt') || '0', 10);
        const amtEl = row.querySelector('[data-settle-amt]');
        if (!amtEl || target <= 0) return;
        const delay = 55 + idx * 85;
        const duration = 700;
        window.setTimeout(() => {
          if (gen !== tripSettleAnimGen) return;
          const start = performance.now();
          function frame(now) {
            if (gen !== tripSettleAnimGen) return;
            const u = Math.min(1, (now - start) / duration);
            const eased = 1 - (1 - u) ** 3;
            const v = Math.round(target * eased);
            amtEl.textContent = 'NT$' + v.toLocaleString();
            if (u < 1) requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        }, delay);
      });
    });
  });
}

function tripRecordAvatar(name, cssClass) {
  const url = getAvatarUrlByMemberName(name, 'trip');
  const color = getMemberColor(name);
  const rare = isHiddenMemberColorId(color.id);
  const sk = rare ? getHiddenMemberStyleKey(color.id) : '';
  const styleCls = sk ? ` member-rare--${sk}` : '';
  const rareCls = rare ? ` record-avatar--rare${styleCls}` : '';
  const toneCls = memberToneClass(rare);
  const tv = memberToneVars(color, rare);
  const previewable = cssClass === 'me';
  const previewClick = previewable
    ? ` onclick="event.stopPropagation();openMemberAvatarPreview(${jqAttr(name)})" title="預覽頭像"`
    : '';
  if (url) {
    if (previewable) {
      return `<button type="button" class="record-avatar ${cssClass}${rareCls}${toneCls} record-avatar-clickable"${tv ? ` style="${tv}"` : ''}${previewClick}><img class="record-avatar-img" src="${url}" alt="${esc(name)}"></button>`;
    }
    return `<div class="record-avatar ${cssClass}${rareCls}${toneCls}"${tv ? ` style="${tv}"` : ''}><img class="record-avatar-img" src="${url}" alt="${esc(name)}"></div>`;
  }
  if (cssClass === 'multi' || cssClass === 'split' || cssClass === 'settle') {
    return `<div class="record-avatar ${cssClass}">${esc(name)}</div>`;
  }
  const letterStyle = tv
    ? `background:${color.bg};color:${color.fg};${tv}`
    : `background:${color.bg};color:${color.fg}`;
  if (previewable) {
    return `<button type="button" class="record-avatar ${cssClass}${rareCls}${toneCls} record-avatar-clickable" style="${letterStyle}"${previewClick}>${esc(name.charAt(0))}</button>`;
  }
  return `<div class="record-avatar ${cssClass}${rareCls}${toneCls}" style="${letterStyle}">${esc(name.charAt(0))}</div>`;
}

function memberAvatarPill(name, cssClass) {
  const url = getAvatarUrlByMemberName(name, 'trip');
  const color = getMemberColor(name);
  const rare = isHiddenMemberColorId(color.id);
  const toneCls = memberToneClass(rare);
  const tv = memberToneVars(color, rare);
  const pv = `onclick="event.stopPropagation();openMemberAvatarPreview(${jqAttr(name)})" title="${esc(name)}" aria-label="預覽 ${esc(name)} 頭像"`;
  if (url) {
    return `<button type="button" class="${cssClass} settlement-pill-avatar-btn${toneCls}"${tv ? ` style="${tv}"` : ''} ${pv}><img src="${url}" alt="${esc(name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block"></button>`;
  }
  const parts = [`background:${color.bg}`, `color:${color.fg}`, `border-color:${color.fg}30`];
  if (tv) parts.push(tv);
  return `<button type="button" class="${cssClass} settlement-pill-avatar-btn${toneCls}" style="${parts.join(';')}" ${pv}>${esc(name.charAt(0))}</button>`;
}

function tripPhotoThumb(e) {
  if (!e.photoUrl) return '';
  return `<button type="button" class="record-photo-btn" onclick="event.stopPropagation();openPhotoLightbox('${e.photoUrl.replace(/'/g, "\\'")}')" title="查看照片" aria-label="查看照片">
    <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
  </button>`;
}

/** 人民幣輔助金額：有存檔用存檔；否則人民幣行程下依目前匯率換算（舊台幣帳補顯示） */
function tripExpenseCnyHtml(e) {
  let c = parseFloat(e.amountCny);
  if (!Number.isFinite(c) || c <= 0) {
    const tid = e.tripId;
    if (!tid || !isTripCnyModeEnabled(tid)) return '';
    const live = readLiveCnyCache();
    const rate = live && live.rate > 0 ? live.rate : readSavedCnyTwdRate();
    if (!(rate > 0)) return '';
    const nt = Math.round(parseFloat(e.amount) || 0);
    if (nt <= 0) return '';
    c = cnyAuxAmountFromNtd(nt, rate);
    if (!(c > 0)) return '';
  }
  const t = c.toFixed(2).replace(/\.?0+$/, '');
  const mute = e._voided ? '' : 'color:var(--text-muted);';
  return `<div style="font-size:13px;font-weight:600;margin-top:2px;${mute}">¥${t}</div>`;
}

function tripExpenseFxFeeHtml(e) {
  const fee = tripExpenseFxFeeNtd(e);
  if (fee <= 0) return '';
  const mute = e._voided ? '' : 'color:var(--text-muted);';
  return `<div style="font-size:12px;font-weight:600;margin-top:2px;${mute}">手續／匯差 NT$${Math.round(fee)}</div>`;
}

function tripExpenseHTML(e, totalMembers, recordIndex = 0) {
  const ri = `--record-i:${recordIndex};`;
  const hasCustomSplit = Array.isArray(e.splitDetails) && e.splitDetails.length > 0;
  const label = hasCustomSplit
    ? '詳細分攤'
    : (e.splitAmong.length === totalMembers ? '均分' : e.splitAmong.join('、'));
  const noteEl = e.note ? `<div class="record-note">${esc(e.note)}</div>` : '';
  const clickAttr = e._voided ? '' : `onclick='openEditRecordById(${jq(e.id)},true)' style="cursor:pointer" title="點擊編輯"`;
  const photoEl = tripPhotoThumb(e);
  const shareLines = computeExpenseShares(e);
  const splitMeta = hasCustomSplit
    ? shareLines.map(s => `${esc(s.name)} NT$${Math.round(s.amount)}`).join('、')
    : '';

  if (e.payers && Array.isArray(e.payers)) {
    const payerStr = e.payers.map(p => `${esc(p.name)} NT$${Math.round(p.amount)}`).join(' ＋ ');
    const perPerson = shareLines.length ? Math.round(shareLines[0].amount) : 0;
    return `<div class="record-item${e._voided ? ' is-voided' : ''}" style="${ri}">
      ${tripRecordAvatar('多', 'multi')}
      <div class="record-info" ${clickAttr}>
        <div class="record-name">
          <span class="record-name-text">${esc(e.item)}</span>
          <span class="badge${e._voided ? ' badge-void' : ''}">${e._voided ? '已撤回' : '多人出款'}</span>
          ${categoryBadgeHTML(e.category)}
        </div>
        <div class="record-meta">${esc(e.date)} · ${payerStr}${hasCustomSplit ? ` · ${splitMeta}` : ` · 每人 NT$${perPerson}`}</div>
        ${noteEl}
      </div>
      ${photoEl}
      <div class="record-amount" style="${e._voided ? 'color:#9ca3af;text-decoration:line-through' : ''}"><div>NT$${Math.round(e.amount)}</div>${tripExpenseFxFeeHtml(e)}${tripExpenseCnyHtml(e)}</div>
    </div>`;
  }

  return `<div class="record-item${e._voided ? ' is-voided' : ''}" style="${ri}">
    ${tripRecordAvatar(e.paidBy, 'me')}
    <div class="record-info" ${clickAttr}>
      <div class="record-name">
        <span class="record-name-text">${esc(e.item)}</span>
        <span class="badge${e._voided ? ' badge-void' : ''}">${e._voided ? '已撤回' : esc(label)}</span>
        ${categoryBadgeHTML(e.category)}
      </div>
      <div class="record-meta">${esc(e.date)} · ${esc(e.paidBy)}付${hasCustomSplit ? ` · ${splitMeta}` : ` · 每人 NT$${shareLines.length ? Math.round(shareLines[0].amount) : 0}`}</div>
      ${noteEl}
    </div>
    ${photoEl}
    <div class="record-amount" style="${e._voided ? 'color:#9ca3af;text-decoration:line-through' : ''}"><div>NT$${Math.round(e.amount)}</div>${tripExpenseFxFeeHtml(e)}${tripExpenseCnyHtml(e)}</div>
  </div>`;
}

function tripSettlementHTML(s, recordIndex = 0) {
  const ri = `--record-i:${recordIndex};`;
  const clickAttr = s._voided
    ? ''
    : `onclick='openEditRecordById(${jq(s.id)},"tripSettlement")' style="cursor:pointer" title="點擊檢視／撤回"`;
  return `<div class="record-item is-settlement${s._voided ? ' is-voided' : ''}" style="${ri}">
    <div class="record-avatar settle">↕</div>
    <div class="record-info" ${clickAttr}>
      <div class="record-name">
        <span class="record-name-text">出遊還款</span>
        <span class="badge ${s._voided ? 'badge-void' : 'badge-settle'}">${s._voided ? '已撤回' : '還款'}</span>
      </div>
      <div class="record-meta">${esc(s.date)} · ${esc(s.from)} → ${esc(s.to)}</div>
    </div>
    <div class="record-amount${s._voided ? '' : ' record-amount--settle'}" style="${s._voided ? 'color:#9ca3af;text-decoration:line-through' : ''}">NT$${Math.round(s.amount)}</div>
  </div>`;
}

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

/**
 * 行程歷史日期範圍：有紀錄時起點＝最早一筆（前面沒資料就不納入）；無紀錄時起點＝建立日或今天。
 * 終點＝最後一筆紀錄日。
 * @returns {{ start: string, end: string }}
 */
function tripHistoryDateRange(trip, expenses, settlements) {
  const fromCreated = normalizeDate(trip.createdAt) || '';
  const startFromCreated = /^\d{4}-\d{2}-\d{2}/.test(fromCreated) ? fromCreated.slice(0, 10) : '';
  const minRec = minDateStrInTripRecords(expenses, settlements);
  const maxRec = maxDateStrInTripRecords(expenses, settlements);
  let start;
  if (minRec) {
    start = minRec;
  } else {
    start = startFromCreated || todayStr();
  }
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

function tripStatsByDateFromTrip(expenses, settlements) {
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

/** 該週的星期日（台北日曆；與 weekdayTaipeiSundayZero 一致） */
function sundayOnOrBefore(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = weekdayTaipeiSundayZero(y, m, d);
  return addDaysTaipei(dateStr, -wd);
}

/** 從第一個相關週日到最後一個相關週日，共有幾「週」面板（0 起） */
function tripHistoryMaxWeekOffset(firstSunday, lastSunday) {
  let max = 0;
  for (let s = firstSunday; compareDateStr(s, lastSunday) < 0; s = addDaysTaipei(s, 7)) {
    max++;
  }
  return max;
}

/**
 * 每列固定 日→六（星期日為第一格）；僅行程範圍內的日期可點選。
 * @param {{ start: string, end: string }} range
 * @param {Map<string, number>} statsByDate
 * @returns {{ html: string, rangeMeta: string }}
 */
function tripHistoryStripHTML(range, weekOffset, statsByDate, filterDate, today) {
  const wdLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const firstSunday = sundayOnOrBefore(range.start);
  const lastSunday = sundayOnOrBefore(range.end);
  const maxOffset = tripHistoryMaxWeekOffset(firstSunday, lastSunday);
  const w = Math.min(Math.max(0, weekOffset), maxOffset);
  const pageSunday = addDaysTaipei(firstSunday, w * 7);
  const pageSaturday = addDaysTaipei(pageSunday, 6);
  const totalDays =
    compareDateStr(range.start, range.end) <= 0
      ? eachDateInclusive(range.start, range.end).length
      : 0;
  const canPrev = w > 0;
  const canNext = w < maxOffset;
  const cells = [];
  /** 本列在行程範圍內的日期（用於標題，不含占位） */
  let pageSpanFirst = '';
  let pageSpanLast = '';
  for (let i = 0; i < 7; i++) {
    const ds = addDaysTaipei(pageSunday, i);
    const inRange = compareDateStr(ds, range.start) >= 0 && compareDateStr(ds, range.end) <= 0;
    if (!inRange) {
      continue;
    }
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

/** 與 allRows 順序一致（較新的列在陣列後方 → 顯示時排在同日前方） */
/** 歷史紀錄分組小計：人民幣行程時附帶依目前匯率換算之 ¥（灰字、與台幣間空格） */
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
    if (row.type === 'tripExpense' && row.action === 'add' && row.tripId === tripId) {
      idx.set(row.id, i);
    }
    if (row.type === 'tripSettlement' && row.action === 'add' && row.tripId === tripId) {
      idx.set(row.id, i);
    }
  });
  return idx;
}

function buildTripExpensesByDayHTML(expenses, settlements, trip, allRows, filterDate) {
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

  /** 查看全部：頂部一列加總，下方單一列表（仍依日期新→舊、同日內原順序） */
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

export function renderDetailMemberChips(members) {
  const el = document.getElementById('detail-member-chips');
  if (el._scrollRevealCleanup) el._scrollRevealCleanup();
  el.innerHTML = members
    .map((m, i) => {
      const avatarUrl = getAvatarUrlByMemberName(m, 'trip');
      const color = getMemberColor(m);
      const rare = isHiddenMemberColorId(color.id);
      const sk = rare ? getHiddenMemberStyleKey(color.id) : '';
      const styleCls = sk ? ` member-rare--${sk}` : '';
      const avCls = rare ? ` member-chip-avatar--rare${styleCls}` : '';
      const toneCls = memberToneClass(rare);
      const tv = memberToneVars(color, rare);
      const chipStyle = tv ? ` style="--chip-i:${i};${tv}"` : ` style="--chip-i:${i}"`;
      const fbStyle = tv
        ? `background:${color.bg};color:${color.fg};${tv}`
        : `background:${color.bg};color:${color.fg}`;
      const avatarHtml = avatarUrl
        ? `<img class="member-chip-avatar${avCls}${toneCls}" src="${avatarUrl}" alt="${esc(m)} 頭像"${tv ? ` style="${tv}"` : ''}>`
        : `<span class="member-chip-avatar member-chip-avatar--fallback${rare ? ` member-chip-avatar-fallback--rare${styleCls}` : ''}${toneCls}" style="${fbStyle}" aria-hidden="true">${esc(m.charAt(0))}</span>`;
      const avatarBtn = `<button type="button" class="member-chip-avatar-btn" onclick="openMemberAvatarPreview(${jqAttr(m)})" title="預覽頭像" aria-label="預覽 ${esc(m)} 頭像">${avatarHtml}</button>`;

      const removeBtn =
        members.length > 2
          ? `<button class="member-chip-remove" title="移除" onclick="removeMemberAction(${jqAttr(m)})">
           <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
         </button>`
          : '';
      return `<span class="member-chip${rare ? ` member-chip--rare${styleCls}` : ''}${toneCls}"${chipStyle}>
          ${avatarBtn}
          <span class="member-chip-name">${esc(m)}</span>
          ${removeBtn}
        </span>`;
    })
    .join('');
}

function renderDetailKnownMembers(trip) {
  const el = document.getElementById('detail-known-members');
  if (!el) return;
  if (el._scrollRevealCleanup) el._scrollRevealCleanup();
  const known = getKnownMemberNames();
  const available = known.filter(n => !trip.members.includes(n));
  if (available.length === 0 || trip._closed) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="known-member-bar">
    <span class="known-member-bar-label">快速加入</span>
    ${available.map((n, ki) => {
      const c = getMemberColor(n);
      const rare = isHiddenMemberColorId(c.id);
      const sk = rare ? getHiddenMemberStyleKey(c.id) : '';
      const styleCls = sk ? ` member-rare--${sk}` : '';
      const kTone = memberToneClass(rare);
      const kTv = memberToneVars(c, rare);
      return `<button type="button" class="known-member-bar-btn${rare ? ` known-member-bar-btn--rare${styleCls}` : ''}${kTone}"${kTv ? ` style="--km-i:${ki};${kTv}"` : ` style="--km-i:${ki}"`} onclick="addDetailMemberByName(${jqAttr(n)})">
        <span class="known-member-bar-dot${rare ? ` known-member-bar-dot--rare${styleCls}` : ''}" style="background:${c.fg}">${esc(n.charAt(0))}</span>${esc(n)}
      </button>`;
    }).join('')}
  </div>`;
}

export function renderSplitChips(members) {
  const el = document.getElementById('d-split-chips');
  el.innerHTML = members
    .map(m => {
      const active = appState.detailSplitAmong.includes(m);
      return `<button class="split-chip ${active ? 'active' : ''}" onclick="toggleSplit(${jqAttr(m)})">${esc(m)}</button>`;
    })
    .join('');
  renderSplitCustomList();
  updatePerPerson();
}

function resolveSplitLockTarget(members, totalReady, customMap, rawMap, activeMember = '', activeRawValue = '') {
  if (totalReady) {
    const activeRaw = String(activeRawValue ?? '');
    // While editing: empty means "not decided yet" => don't force residual target.
    if (activeMember && !/\d/.test(activeRaw)) return '';

    const auto = String(appState.detailSplitAutoFilledTarget || '').trim();
    const rawAll = { ...(rawMap || {}), ...(activeMember ? { [activeMember]: activeRaw } : {}) };
    // "Unfilled" means: input has no digits (empty). Explicit 0 is considered "filled".
    const unfilledByRaw = members.filter(m => {
      const raw = String(rawAll?.[m] ?? '');
      const hasDigit = /\d/.test(raw);
      if (!hasDigit) return true;
      return false;
    });
    // Keep residual target stable once chosen (auto-filled), unless user is actively editing it.
    if (auto && members.includes(auto) && auto !== activeMember) return auto;
    return unfilledByRaw.length === 1 ? unfilledByRaw[0] : '';
  }
  // Total not provided: only lock total when all member rows have been touched.
  // In custom split UI we only support residual when total is fixed.
  return '';
}

export function renderSplitCustomList() {
  const box = document.getElementById('d-split-custom-list');
  if (!box) return;
  const useCustom = appState.detailSplitMode === 'custom';
  box.style.display = useCustom ? '' : 'none';
  if (!useCustom) {
    box.innerHTML = '';
    return;
  }
  if (appState.detailSplitAmong.length === 0) {
    box.innerHTML = '';
    return;
  }
  const members = appState.detailSplitAmong.slice();
  const touchedMap = appState.detailSplitTouched || {};
  const totalVal = getDetailAmountNt();
  // Treat "total has value" as ready even if total wasn't the last interacted field.
  const totalReady = totalVal > 0 || (appState.detailMultiPay && totalVal > 0);
  const active = document.activeElement;
  const activeMember =
    active && active.getAttribute && active.getAttribute('data-member') ? String(active.getAttribute('data-member') || '') : '';
  const activeRawValue = active && activeMember && 'value' in active ? String(active.value || '') : '';
  const rawMap = Object.fromEntries(
    Array.from(box.querySelectorAll('input[data-member]')).map(inp => [
      String(inp.getAttribute('data-member') || ''),
      String(inp.value || ''),
    ]),
  );
  const uiRawAll = { ...rawMap, ...(activeMember ? { [activeMember]: activeRawValue } : {}) };
  const activeEmpty = !!activeMember && !/\d/.test(String(activeRawValue || ''));
  const anyZero = totalReady && hasAnyExplicitZeroRaw(uiRawAll, members);
  const editingMember = String(appState.detailSplitEditingMember || '').trim();
  // UX: while user is editing any split row, don't lock/disable anything.
  const suppressLock = !!editingMember || (totalReady && (anyZero || activeEmpty));
  const lock = suppressLock
    ? ''
    : resolveSplitLockTarget(
        members,
        totalReady,
        appState.detailSplitCustom || {},
        rawMap,
        activeMember,
        activeRawValue,
      );
  // UX: still compute the lock target while typing, but never disable/overwrite the active field.
  appState.detailSplitLockedTarget = lock;
  box.innerHTML = appState.detailSplitAmong
    .map(name => {
      const v = parseFloat(appState.detailSplitCustom?.[name]) || 0;
      const locked = !suppressLock && lock === name;
      const isActiveField = active && active.getAttribute && active.getAttribute('data-member') === name;
      const disable = !suppressLock && locked && !isActiveField;
      const touched = !!appState.detailSplitTouched?.[name];
      const showZero = touched && parseMoneyLike(appState.detailSplitCustom?.[name]) <= 0;
      return `<div class="split-custom-row">
        <div class="split-custom-name">${esc(name)}</div>
        <input type="text" class="form-input form-input-amount${locked ? ' split-custom-input--locked' : ''}" data-member="${esc(name)}" value="${v > 0 || showZero ? Math.round(v) : ''}" placeholder="0"
          lang="en" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off"
          inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" aria-label="${esc(name)} 分攤金額"
          ${disable ? 'disabled aria-disabled="true"' : ''}
          onfocus="beginDetailSplitEdit(${jqAttr(name)})"
          onblur="endDetailSplitEdit(${jqAttr(name)})"
          oninput="setDetailSplitAmount(${jqAttr(name)}, this.value)">
      </div>`;
    })
    .join('');
}

function renderSettlement(members, expenses, trip) {
  const bar = document.getElementById('settlement-bar');
  const body = document.getElementById('settlement-body');
  const active = expenses.filter(e => !e._voided);
  const voidCount = expenses.length - active.length;

  if (expenses.length === 0) {
    bar.className = 'balance-bar';
    bar.style.background = '';
    body.innerHTML = `<div class="balance-content">
      <div class="balance-icon" style="background:#eff6ff">
        <svg viewBox="0 0 24 24" style="fill:#3b82f6"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
      </div>
      <div>
        <div class="balance-label">目前結算</div>
        <div style="font-size:20px;font-weight:700">尚未記帳</div>
        <div class="balance-sub">新增消費後即可計算分攤</div>
      </div>
    </div>`;
    return;
  }

  if (active.length === 0) {
    bar.className = 'balance-bar';
    bar.style.background = '';
    body.innerHTML = `<div class="balance-content">
      <div class="balance-icon" style="background:#eff6ff">
        <svg viewBox="0 0 24 24" style="fill:#3b82f6"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
      </div>
      <div>
        <div class="balance-label">目前結算</div>
        <div style="font-size:20px;font-weight:700">無有效消費</div>
        <div class="balance-sub">共 ${voidCount} 筆已撤回</div>
      </div>
    </div>`;
    return;
  }

  const adjustments = trip
    ? getTripSettlementAdjustmentsFromRows(trip.id, appState.allRows)
    : [];
  const settlements = computeSettlements(members, active, adjustments);
  const dueSettlements = settlements.filter(s => Math.round(parseFloat(s.amount) || 0) > 0);
  const total = active.reduce((s, e) => s + tripExpenseBillNtd(e), 0);

  if (dueSettlements.length === 0) {
    bar.className = 'balance-bar';
    bar.style.background = '';
    body.innerHTML = `<div class="balance-content">
      <div class="balance-icon" style="background:#eff6ff">
        <svg viewBox="0 0 24 24" style="fill:#3b82f6"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
      </div>
      <div>
        <div class="balance-label">目前結算</div>
        <div style="font-size:22px;font-weight:700">未有積欠金額</div>
        <div class="balance-sub">有效 ${active.length} 筆 · NT$${Math.round(total)}</div>
      </div>
    </div>`;
    return;
  }

  bar.className = 'balance-bar';
  bar.style.background = '#f59e0b';
  const maxPay = Math.max(...dueSettlements.map(s => s.amount), 1);
  const canSettle = trip && !trip._closed;
  const rowsHtml = dueSettlements
    .map(s => {
      const amt = Math.round(s.amount);
      const barPct = Math.round((s.amount / maxPay) * 100);
      const coverW = prefersReducedMotion() ? 100 - barPct : 100;
      const repayBtn = canSettle
        ? `<button type="button" class="settle-btn settle-btn--inline" data-from="${esc(s.from)}" data-to="${esc(
            s.to,
          )}" onclick="recordTripSettlementOneAction(this)">還款</button>`
        : '';
      return `<div class="settlement-row settlement-row--visual" data-amt="${amt}" data-bar-pct="${barPct}">
      <div class="settlement-flow">
        ${memberAvatarPill(s.from, 'settlement-pill settlement-pill--payer')}
        <span class="settlement-names">${esc(s.from)}</span>
        <span class="settlement-arrow" aria-hidden="true">→</span>
        ${memberAvatarPill(s.to, 'settlement-pill settlement-pill--payee')}
        <span class="settlement-names">${esc(s.to)}</span>
        <div class="settlement-flow-tail">
        <span class="settlement-amount" data-settle-amt>NT$${prefersReducedMotion() ? amt.toLocaleString() : '0'}</span>
        ${repayBtn}
        </div>
      </div>
      <div class="settlement-compare-track settlement-compare-track--sharedgrad" aria-hidden="true">
        <div class="settlement-compare-grad"></div>
        <div class="settlement-compare-cover" style="width:${coverW}%"></div>
      </div>
    </div>`;
    })
    .join('');
  body.innerHTML = `<div class="settlement-collapse">
    <button type="button" class="settlement-collapse-trigger" onclick="toggleCollapsible('settlement-flows-panel','settlement-flows-icon')" aria-expanded="true">
      <div class="settlement-collapse-trigger__main">
        <span class="settlement-collapse-title">誰要付給誰</span>
        <span class="settlement-header-meta">有效 ${active.length} 筆 · NT$${Math.round(total)}</span>
      </div>
      <span class="settlement-collapse-chevron" aria-hidden="true">
        <svg id="settlement-flows-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>
      </span>
    </button>
    <div id="settlement-flows-panel" class="collapsible-panel is-open">
      <div class="collapsible-panel__inner settlement-collapse-panel-inner">
        <div class="settlement-list settlement-list--visual">${rowsHtml}</div>
      </div>
    </div>
  </div>`;
  playTripSettlementAnimations();
}

function updatePerPerson() {
  if (appState.detailMultiPay) {
    // In multi-pay mode we still need split (custom) locking/autofill.
    updateMultiPayTotal();
  }
  const a = getDetailAmountNt();
  const note = document.getElementById('d-per-person');
  if (appState.detailSplitMode === 'custom') {
    if (note) note.textContent = '';
    const totalEl = document.getElementById('d-amount');
    const total = getDetailAmountNt();
    const members = appState.detailSplitAmong.slice();
    // Treat "total has value" as ready even if total wasn't the last interacted field.
    const totalReady = total > 0 || (appState.detailMultiPay && total > 0);
    const active = document.activeElement;
    const activeMember =
      active && active.getAttribute && active.getAttribute('data-member') ? String(active.getAttribute('data-member') || '') : '';
    const activeRawValue = active && activeMember && 'value' in active ? String(active.value || '') : '';
    const splitBox = document.getElementById('d-split-custom-list');
    const rawMap = splitBox
      ? Object.fromEntries(
          Array.from(splitBox.querySelectorAll('input[data-member]')).map(inp => [
            String(inp.getAttribute('data-member') || ''),
            String(inp.value || ''),
          ]),
        )
      : {};

    const uiRawAll = { ...rawMap, ...(activeMember ? { [activeMember]: activeRawValue } : {}) };
    const activeEmpty = !!activeMember && !/\d/.test(String(activeRawValue || ''));
    const anyZero = totalReady && hasAnyExplicitZeroRaw(uiRawAll, members);
    const editingMember = String(appState.detailSplitEditingMember || '').trim();
    // UX: while user is editing any split row, don't lock/autofill/derive total yet.
    const suppressLock = !!editingMember || (totalReady && (anyZero || activeEmpty));

    // If total is not provided, but all custom split rows are filled, derive total from split sum.
    // Use appState.detailSplitCustom as source of truth to avoid UI/state timing races.
    const totalIsEmpty = totalEl && !/\d/.test(String(totalEl.value || ''));
    const allFilled = members.length > 0 && members.every(m => /\d/.test(String(uiRawAll?.[m] ?? '')));
    if (!suppressLock && totalEl && totalIsEmpty && allFilled && document.activeElement !== totalEl) {
      const sumFromState = members.reduce((s, m) => {
        const v = m === activeMember ? parseMoneyLike(activeRawValue) : parseMoneyLike(appState.detailSplitCustom?.[m]);
        return s + (Number.isFinite(v) ? v : 0);
      }, 0);
      if (sumFromState > 0) {
        setDetailAmountFromNt(Math.round(sumFromState));
        appState.detailSplitTotalTouched = false;
        appState.detailSplitTotalDerived = true;
      }
    }

    // Hard guarantee: when suppressing locks (any 0 or active empty), force-clear all disabled/locked UI.
    if (suppressLock) {
      appState.detailSplitLockedTarget = '';
      appState.detailSplitAutoFilledTarget = '';
      appState.detailSplitTotalDerived = false;
      if (totalEl) {
        totalEl.disabled = false;
        totalEl.classList.remove('split-custom-input--locked');
        totalEl.setAttribute('aria-disabled', 'false');
      }
      const inputs = Array.from(document.querySelectorAll('#d-split-custom-list input[data-member]'));
      inputs.forEach(inp => {
        inp.disabled = false;
        inp.classList.remove('split-custom-input--locked');
        inp.setAttribute('aria-disabled', 'false');
      });
      return;
    }

    // If any value is explicitly zero, do not lock or auto-fill residual.
    const lock = suppressLock
      ? ''
      : resolveSplitLockTarget(
          members,
          totalReady,
          appState.detailSplitCustom || {},
          rawMap,
          activeMember,
          activeRawValue,
        );
    // UX: keep computing residual, but never hijack the input user is editing.
    appState.detailSplitLockedTarget = lock;

    if (totalEl) {
      const lockTotal = lock === 'total';
      const shouldDisable = !suppressLock && lockTotal && active !== totalEl;
      const derived = !!appState.detailSplitTotalDerived && active !== totalEl;
      const disableTotal = shouldDisable || derived;
      totalEl.disabled = disableTotal;
      totalEl.classList.toggle('split-custom-input--locked', lockTotal || derived);
      totalEl.setAttribute('aria-disabled', disableTotal ? 'true' : 'false');
    }
    // Apply member-row lock state immediately without requiring full rerender.
    Array.from(document.querySelectorAll('#d-split-custom-list input[data-member]')).forEach(inp => {
      const m = String(inp.getAttribute('data-member') || '');
      const shouldLock = !suppressLock && lock === m;
      const shouldDisable = !suppressLock && shouldLock && active !== inp;
      inp.disabled = shouldDisable;
      // Keep "locked" styling even if we can't disable the active field.
      inp.classList.toggle('split-custom-input--locked', shouldLock);
      inp.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
    });

    // Keep the locked target auto-calculated (user cannot edit, system may update).
    if (!suppressLock && lock && lock !== 'total' && total > 0) {
      const used = members
        .filter(m => m !== lock)
        .reduce((s, m) => s + parseMoneyLike(appState.detailSplitCustom?.[m]), 0);
      const residual = Math.max(0, total - used);
      appState.detailSplitCustom[lock] = residual;
      appState.detailSplitAutoFilledTarget = lock;
      const inp = Array.from(document.querySelectorAll('#d-split-custom-list input[data-member]'))
        .find(el => el.getAttribute('data-member') === lock);
      if (inp && active !== inp) inp.value = residual > 0 ? String(Math.round(residual)) : '';
    }

    const sum = members.reduce((s, m) => s + parseMoneyLike(appState.detailSplitCustom?.[m]), 0);

    // If total is the locked/unfilled one, keep it synced to member split sum.
    if (totalEl && lock === 'total' && active !== totalEl) {
      setDetailAmountFromNt(Math.round(sum));
    }

    return;
  }
  note.textContent =
    a > 0 && appState.detailSplitAmong.length > 0
      ? '每人 NT$' + Math.round(a / appState.detailSplitAmong.length)
      : '';
}

function updateMultiPayTotal() {
  const payerAmountInputs = Array.from(document.querySelectorAll('#d-payers-list .payer-amount'));
  const payerRows = payerAmountInputs
    .map(inp => {
      const row = inp.closest('.payer-row');
      const name = row?.querySelector('input.payer-name')?.value || '';
      const rowId = String(row?.dataset?.rowId || '').trim();
      return {
        rowId,
        name: String(name || '').trim(),
        amountEl: inp,
        amount: parseMoneyLike(inp.value),
        touched: !!appState.detailMultiPayTouchedRows?.[rowId],
      };
    })
    .filter(r => r.name);

  const totalEl = document.getElementById('d-amount');
  const totalVal = getDetailAmountNt();

  const sumPayers = payerRows.reduce((s, r) => s + r.amount, 0);

  // Multi-pay rule (UX-first):
  // - If user did NOT provide total (total untouched or cleared), total should always be derived
  //   from payer sum (and treated as locked) to minimize redundant input.
  // - If user DID provide total, lock exactly one remaining payer row as residual when possible.
  const editing = String(appState.detailMultiPayEditingTarget || '').trim();
  let lockTarget = '';
  const untouchedPayers = payerRows.filter(r => !r.touched);
  const zeroPayers = payerRows.filter(r => r.amount <= 0);
  const userProvidedTotal = appState.detailMultiPayTotalTouched && totalVal > 0;
  if (!userProvidedTotal) {
    // Auto-total mode: always lock total (derive from sum of payer amounts).
    lockTarget = 'total';
  } else {
    // User-provided total: lock exactly one remaining unfilled payer row as residual when possible.
    // Prefer value-based fallback to avoid state desync edge cases.
    if (zeroPayers.length === 1) {
      const z = zeroPayers[0];
      if (z?.rowId) lockTarget = `row:${z.rowId}`;
    } else if (untouchedPayers.length === 1) {
      const t = untouchedPayers[0];
      if (t?.rowId) lockTarget = `row:${t.rowId}`;
    }
  }
  appState.detailMultiPayLockedTarget = lockTarget;

  // Clear existing lock styles/disabled states.
  if (totalEl) {
    totalEl.disabled = false;
    totalEl.classList.remove('split-custom-input--locked');
    totalEl.setAttribute('aria-disabled', 'false');
  }
  payerRows.forEach(r => {
    r.amountEl.disabled = false;
    r.amountEl.classList.remove('split-custom-input--locked');
    r.amountEl.setAttribute('aria-disabled', 'false');
  });

  const active = document.activeElement;
  const activeRow = payerRows.find(r => r.amountEl === active);

  // Keep autofill running while typing, but never overwrite the active field.

  // Apply lock + auto-calc for the last unfilled field.
  if (lockTarget === 'total' && totalEl) {
    if (active !== totalEl) {
      // If user hasn't provided total, keep it synced to payer sum.
      setDetailAmountFromNt(sumPayers > 0 ? Math.round(sumPayers) : 0);
      // Only disable when we're in auto-total mode (user did not provide total).
      const autoTotal = !userProvidedTotal;
      totalEl.disabled = autoTotal;
      totalEl.classList.toggle('split-custom-input--locked', autoTotal);
      totalEl.setAttribute('aria-disabled', autoTotal ? 'true' : 'false');
    }
  } else if (lockTarget.startsWith('row:')) {
    const targetRowId = lockTarget.slice(4);
    const target = payerRows.find(r => r.rowId === targetRowId);
    if (target) {
      // Never lock the field currently being edited.
      if (active === target.amountEl || editing === `row:${targetRowId}`) {
        const n = appState.detailSplitAmong.length || 1;
        const displayTotal = totalVal > 0 ? totalVal : sumPayers;
        const note = document.getElementById('d-per-person');
        if (note) {
          note.textContent = displayTotal > 0 && n > 0 ? `每人 NT$${Math.round(displayTotal / n)}` : '';
        }
        return;
      }
      const used = payerRows
        .filter(r => r.rowId !== targetRowId)
        .reduce((s, r) => s + r.amount, 0);
      const residual = Math.max(0, totalVal > 0 ? totalVal - used : sumPayers - used);
      target.amountEl.value = residual > 0 ? String(Math.round(residual)) : '';
      target.amountEl.disabled = true;
      target.amountEl.classList.add('split-custom-input--locked');
      target.amountEl.setAttribute('aria-disabled', 'true');
    }
  }

  const n = appState.detailSplitAmong.length || 1;
  const displayTotal = totalVal > 0 ? totalVal : sumPayers;

  // Also refresh per-person note (避免切換到多人出款時留下舊內容).
  const note = document.getElementById('d-per-person');
  if (note) {
    if (appState.detailSplitMode === 'custom') note.textContent = '';
    else note.textContent = displayTotal > 0 && n > 0 ? `每人 NT$${Math.round(displayTotal / n)}` : '';
  }
}

export function shiftTripHistoryWeek(delta) {
  appState.tripDetailHistoryWeekOffset += delta;
  if (appState.tripDetailHistoryWeekOffset < 0) appState.tripDetailHistoryWeekOffset = 0;
  renderTripDetail();
}

export function selectTripHistoryDay(ds) {
  if (appState.tripDetailHistoryFilterDate === ds) {
    appState.tripDetailHistoryFilterDate = null;
  } else {
    appState.tripDetailHistoryFilterDate = ds;
  }
  renderTripDetail();
}

export function clearTripHistoryDayFilter() {
  appState.tripDetailHistoryFilterDate = null;
  renderTripDetail();
}

/** 長按頂欄行程名：確認後永久開啟此行程的人民幣模式（不可關閉） */
function bindTripDetailNameCnyModeLongPress(nameEl, trip) {
  if (!nameEl || !trip) return;
  const cnyOn = isTripCnyModeEnabled(trip.id);
  const key = `${trip.id}-${trip._closed ? 'c' : 'o'}-${cnyOn ? 'on' : 'off'}`;
  if (nameEl.dataset.cnyLongpressKey === key) return;
  nameEl.dataset.cnyLongpressKey = key;
  nameEl._cnyLongpressAbort?.abort();
  const ac = new AbortController();
  nameEl._cnyLongpressAbort = ac;

  nameEl.classList.toggle('detail-name--cny-longpress', !trip._closed && !cnyOn);

  let timer = null;
  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const run = () => {
    clearTimer();
    if (trip._closed || isTripCnyModeEnabled(trip.id)) return;
    void (async () => {
      const ok = await showConfirm(
        '開啟人民幣模式？',
        '此行程將永久顯示「人民幣／參考匯率」欄位，並與新台幣互相換算。開啟後無法關閉。',
      );
      if (!ok) return;
      enableTripCnyModePermanent(trip.id);
      toast('已開啟人民幣模式');
      renderTripDetail();
    })();
  };
  const start = () => {
    if (trip._closed || isTripCnyModeEnabled(trip.id)) return;
    clearTimer();
    timer = setTimeout(run, 650);
  };

  nameEl.addEventListener('touchstart', start, { signal: ac.signal, passive: true });
  nameEl.addEventListener('touchend', clearTimer, { signal: ac.signal });
  nameEl.addEventListener('touchcancel', clearTimer, { signal: ac.signal });
  nameEl.addEventListener('mousedown', start, { signal: ac.signal });
  nameEl.addEventListener('mouseup', clearTimer, { signal: ac.signal });
  nameEl.addEventListener('mouseleave', clearTimer, { signal: ac.signal });
  nameEl.addEventListener(
    'contextmenu',
    e => {
      if (trip._closed || isTripCnyModeEnabled(trip.id)) return;
      e.preventDefault();
    },
    { signal: ac.signal },
  );
}

export function renderTripDetail() {
  const trip = getTripById(appState.currentTripId);
  if (!trip) {
    if (appState.currentPage === 'tripDetail') navigate('trips');
    return;
  }
  if (appState._tripDetailHistoryTripId !== trip.id) {
    appState.tripDetailHistoryWeekOffset = 0;
    appState.tripDetailHistoryFilterDate = null;
    appState._tripDetailHistoryTripId = trip.id;
  }
  const expenses = getTripExpenses(appState.currentTripId);
  const settlements = getTripSettlementDisplayRowsFromRows(appState.currentTripId, appState.allRows);
  appState._tripExpenseCache = expenses;
  appState._tripSettlementCache = settlements;

  const nameEl = document.getElementById('detail-name');
  if (nameEl) {
    nameEl.textContent = trip.name;
    bindTripDetailNameCnyModeLongPress(nameEl, trip);
    if (isTripCnyModeEnabled(trip.id)) nameEl.removeAttribute('title');
    else if (!trip._closed) nameEl.title = '長按行程名稱可開啟人民幣模式（開啟後無法關閉）';
    else nameEl.removeAttribute('title');
  }
  const cnyOn = isTripCnyModeEnabled(trip.id);
  if (!cnyOn) appState.detailAmountCurrency = 'TWD';
  const ccyWrap = document.getElementById('d-amount-currency-wrap');
  const rateInline = document.getElementById('d-cny-rate-inline');
  if (ccyWrap) ccyWrap.style.display = cnyOn ? '' : 'none';
  if (rateInline) rateInline.style.display = cnyOn ? '' : 'none';
  if (cnyOn) {
    syncDetailAmountCurrencyToggleUi();
    updateCnyRateInlineDisplay();
  }
  const amtInp = document.getElementById('d-amount');
  if (amtInp && cnyOn) {
    amtInp.setAttribute('inputmode', appState.detailAmountCurrency === 'CNY' ? 'decimal' : 'numeric');
    amtInp.setAttribute('aria-label', appState.detailAmountCurrency === 'CNY' ? '金額（人民幣）' : '金額（新台幣）');
  } else if (amtInp) {
    amtInp.setAttribute('inputmode', 'numeric');
    amtInp.setAttribute('aria-label', '金額（新台幣）');
  }

  const activeTotal = expenses.filter(e => !e._voided).length;
  document.getElementById('detail-count').textContent = `有效 ${activeTotal} 筆`;

  renderDetailMemberChips(trip.members);
  renderDetailKnownMembers(trip);
  renderTripLotteryCard(trip);

  if (!appState.detailPaidBy || !trip.members.includes(appState.detailPaidBy)) {
    appState.detailPaidBy = trip.members[0] || '';
  }
  const paidWrap = document.getElementById('d-paidby-toggles');
  if (paidWrap) {
    paidWrap.innerHTML = trip.members
      .map(
        m =>
          `<button type="button" class="btn-toggle${m === appState.detailPaidBy ? ' active' : ''}" data-member="${esc(m)}" onclick="setDetailPaidBy(${jqAttr(m)})">${esc(m)}</button>`,
      )
      .join('');
  }

  appState.detailSplitAmong = appState.detailSplitAmong.filter(m => trip.members.includes(m));
  if (appState.detailSplitAmong.length === 0) appState.detailSplitAmong = [...trip.members];
  for (const k of Object.keys(appState.detailSplitCustom || {})) {
    if (!trip.members.includes(k)) delete appState.detailSplitCustom[k];
  }
  for (const k of Object.keys(appState.detailSplitTouched || {})) {
    if (!trip.members.includes(k)) delete appState.detailSplitTouched[k];
  }
  appState.detailSplitLockedTarget = '';
  appState.detailSplitAutoFilledTarget = '';
  if (!appState.detailMultiPay) {
    appState.detailMultiPayTotalTouched = false;
    appState.detailMultiPayTouchedRows = {};
    appState.detailMultiPayLockedTarget = '';
    appState.detailMultiPayEditingTarget = '';
  }
  renderSplitChips(trip.members);

  renderSettlement(trip.members, expenses, trip);

  const headerActions = document.getElementById('trip-header-actions');
  const archiveBar = document.getElementById('trip-archive-bar');
  const addCard = document.getElementById('add-expense-card');
  if (trip._closed) {
    if (headerActions) headerActions.innerHTML = '';
    archiveBar.innerHTML = `<div class="trip-closed-bar">
      <div class="trip-closed-bar-note">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;flex-shrink:0"><path d="M20 6h-2.18c.07-.44.18-.88.18-1 0-2.21-1.79-4-4-4s-4 1.79-4 4c0 .12.11.56.18 1H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-3c1.1 0 2 .9 2 2 0 .12-.11.56-.18 1h-3.64C12.11 5.56 12 5.12 12 5c0-1.1.9-2 2-2zm0 10l-4-4 1.41-1.41L14 10.17l4.59-4.58L20 7l-6 6z"/></svg>
        此行程已結束，僅供瀏覽
      </div>
      <div class="trip-closed-bar-actions">
        <button type="button" class="btn btn-primary btn-sm" onclick='copyTripSettlementSummary(${jq(trip.id)})'>複製結算懶人包</button>
        <button type="button" class="btn btn-outline btn-sm" onclick='reopenTripAction(${jq(trip.id)})'>重新開啟</button>
      </div>
    </div>`;
    addCard.style.display = 'none';
  } else {
    if (headerActions) {
      headerActions.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" style="color:var(--text-muted);font-size:12px;gap:5px;flex-shrink:0" onclick='closeTripAction(${jq(trip.id)})'>
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M20 6h-2.18c.07-.44.18-.88.18-1 0-2.21-1.79-4-4-4s-4 1.79-4 4c0 .12.11.56.18 1H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-3c1.1 0 2 .9 2 2 0 .12-.11.56-.18 1h-3.64C12.11 5.56 12 5.12 12 5c0-1.1.9-2 2-2zm0 10l-4-4 1.41-1.41L14 10.17l4.59-4.58L20 7l-6 6z"/></svg>
        結束行程
      </button>`;
    }
    archiveBar.innerHTML = '';
    addCard.style.display = '';
  }

  const expEl = document.getElementById('detail-expenses');
  if (expEl._scrollRevealCleanup) expEl._scrollRevealCleanup();
  const range = tripHistoryDateRange(trip, expenses, settlements);
  const firstSunday = sundayOnOrBefore(range.start);
  const lastSunday = sundayOnOrBefore(range.end);
  const maxWeekOffset = tripHistoryMaxWeekOffset(firstSunday, lastSunday);
  if (appState.tripDetailHistoryWeekOffset > maxWeekOffset) {
    appState.tripDetailHistoryWeekOffset = maxWeekOffset;
  }
  const statsByDate = tripStatsByDateFromTrip(expenses, settlements);
  const today = todayStr();
  const filterDate = appState.tripDetailHistoryFilterDate;
  const { html: stripHtml, rangeMeta: tripHistoryRangeMeta } = tripHistoryStripHTML(
    range,
    appState.tripDetailHistoryWeekOffset,
    statsByDate,
    filterDate,
    today,
  );
  const headerMetaEl = document.getElementById('trip-history-range-meta');
  if (headerMetaEl) {
    headerMetaEl.textContent = tripHistoryRangeMeta;
    headerMetaEl.hidden = !tripHistoryRangeMeta;
  }
  if (expenses.length === 0 && settlements.length === 0) {
    expEl.innerHTML = `${stripHtml}<div class="trip-history-list">${emptyHTML('還沒有消費或還款紀錄', '')}</div>`;
  } else {
    expEl.innerHTML = `${stripHtml}<div class="trip-history-list">${buildTripExpensesByDayHTML(
      expenses,
      settlements,
      trip,
      appState.allRows,
      filterDate,
    )}</div>`;
  }

  const doReveal = appState.revealTripExpensesNext;
  appState.revealTripExpensesNext = false;
  if (expenses.length > 0 || settlements.length > 0) {
    bindScrollReveal(expEl, '.trip-day-group, .record-item', { enabled: doReveal });
  }
  const chipsEl = document.getElementById('detail-member-chips');
  if (chipsEl) bindScrollReveal(chipsEl, '.member-chip', { enabled: doReveal });
  const kmRoot = document.getElementById('detail-known-members');
  if (kmRoot) bindScrollReveal(kmRoot, '.known-member-bar-btn', { enabled: doReveal });

  syncDetailTripFormLabels();
}

/** 依賭博模式更新出遊新增消費表單文案與分類選單狀態 */
export function syncDetailTripFormLabels() {
  const g = appState.detailGamblingMode;
  const paid = document.getElementById('d-label-paidby');
  if (paid) paid.textContent = g ? '誰贏錢？' : '誰先付錢？';
  const mp = document.getElementById('d-label-multipay-toggle');
  if (mp) {
    if (appState.detailMultiPay) mp.textContent = g ? '單人贏錢' : '單人付款';
    else mp.textContent = g ? '多人贏錢' : '多人出款';
  }
  const sub = document.getElementById('d-label-payers-sub');
  if (sub) sub.textContent = g ? '各贏多少？' : '各自出了多少？';
  const spl = document.getElementById('d-label-split');
  if (spl) spl.textContent = g ? '誰承擔（輸家）？' : '誰要分攤？';
  const sm = document.getElementById('d-label-split-mode');
  if (sm) sm.textContent = appState.detailSplitMode === 'custom' ? '改回均分' : g ? '詳細輸贏' : '詳細分攤';
  const toggles = document.getElementById('d-paidby-toggles');
  if (toggles) toggles.setAttribute('aria-label', g ? '誰贏錢' : '誰先付錢');
  const gambleBtn = document.getElementById('d-gambling-toggle');
  if (gambleBtn) {
    gambleBtn.classList.toggle('d-gambling-toggle--on', !!g);
    gambleBtn.setAttribute('aria-pressed', g ? 'true' : 'false');
  }
  if (isTripCnyModeEnabled(appState.currentTripId)) {
    hydrateTripCnyRateInput();
    import('./actions/trip-form.js').then(m => {
      m.applyTripCnyToTwd();
      void m.refreshTripLiveCnyRateUi({ force: false });
    });
  }
}

export { updatePerPerson, updateMultiPayTotal };
