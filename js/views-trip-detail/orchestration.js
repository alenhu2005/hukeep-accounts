import { tripDetailState } from '../state-accessors.js';
import { getTripById, getTripExpenses, getTripSettlementDisplayRowsFromRows } from '../data.js';
import { bindScrollReveal, esc, jq, toast } from '../utils.js';
import { navigate } from '../navigation.js';
import { renderTripLotteryCard } from '../trip-lottery.js';
import {
  hydrateTripCnyRateInput,
  isTripCnyModeEnabled,
  enableTripCnyModePermanent,
  syncDetailAmountCurrencyToggleUi,
  updateCnyRateInlineDisplay,
} from '../trip-cny-rate.js';
import { showConfirm } from '../dialog.js';
import { formatPostError } from '../api.js';
import {
  renderDetailKnownMembers,
  renderDetailMemberChips,
  renderSplitChips,
  resetRenderedSplitCustomInputs,
  syncDetailAmountUi,
} from './records.js';
import { renderSettlement } from './settlement.js';
import { renderTripHistory } from './history.js';

const DETAIL_NAME_MAX_FONT_PX = 16;
const DETAIL_NAME_MIN_FONT_PX = 11;
const DETAIL_NAME_SAFE_GAP_PX = 28;
let detailHeaderNameFitBound = false;

function syncTripDetailHeaderCountText() {
  const nameEl = document.getElementById('detail-name');
  const countEl = document.getElementById('detail-count');
  if (!nameEl || !countEl) return;
  const activeTotal = Math.max(0, parseInt(countEl.dataset.activeCount || '0', 10) || 0);
  const tripName = String(nameEl.dataset.fullName || nameEl.textContent || '').trim();
  const compact = window.innerWidth <= 460 || tripName.length >= 6;
  countEl.dataset.compact = compact ? 'true' : 'false';
  countEl.textContent = compact ? `${activeTotal}筆` : `有效 ${activeTotal} 筆`;
  if (compact) countEl.title = `有效 ${activeTotal} 筆`;
  else countEl.removeAttribute('title');
}

function fitTripDetailHeaderName() {
  const header = document.querySelector('#page-trip-detail > .header');
  const nameEl = document.getElementById('detail-name');
  if (!header || !nameEl) return;
  syncTripDetailHeaderCountText();

  const headerStyle = window.getComputedStyle(header);
  const gap = parseFloat(headerStyle.columnGap || headerStyle.gap || '0') || 0;
  const visibleChildren = Array.from(header.children).filter(el => window.getComputedStyle(el).display !== 'none');
  const otherWidth = visibleChildren
    .filter(el => el !== nameEl)
    .reduce((sum, el) => sum + el.getBoundingClientRect().width, 0);
  const totalGap = Math.max(0, visibleChildren.length - 1) * gap;
  const availableWidth = Math.max(
    56,
    Math.floor(header.clientWidth - otherWidth - totalGap - DETAIL_NAME_SAFE_GAP_PX),
  );

  nameEl.style.width = `${availableWidth}px`;
  nameEl.style.maxWidth = `${availableWidth}px`;
  nameEl.style.flexBasis = `${availableWidth}px`;
  nameEl.style.fontSize = `${DETAIL_NAME_MAX_FONT_PX}px`;

  let fontSize = DETAIL_NAME_MAX_FONT_PX;
  while (nameEl.scrollWidth > availableWidth && fontSize > DETAIL_NAME_MIN_FONT_PX) {
    fontSize -= 0.5;
    nameEl.style.fontSize = `${fontSize}px`;
  }
}

function scheduleFitTripDetailHeaderName() {
  if (tripDetailState().currentPage !== 'tripDetail') return;
  requestAnimationFrame(() => {
    requestAnimationFrame(fitTripDetailHeaderName);
  });
}

function ensureTripDetailHeaderNameFitBinding() {
  if (detailHeaderNameFitBound) return;
  detailHeaderNameFitBound = true;
  window.addEventListener('resize', scheduleFitTripDetailHeaderName);
}

/**
 * Reset trip-detail "add expense" amount draft.
 * Keeps item/note intact; clears total, payer amounts, and custom split amounts/state.
 * Called when leaving the page or switching payment modes.
 */
export function resetTripDetailAmountDraft(opts = {}) {
  const state = tripDetailState();
  const keepTotal = opts && opts.keepTotal === true;
  const totalEl = document.getElementById('d-amount');
  if (totalEl && !keepTotal) totalEl.value = '';
  if (!keepTotal) state.detailAmountCurrency = 'TWD';
  if (totalEl) {
    totalEl.disabled = false;
    totalEl.classList.remove('split-custom-input--locked');
    totalEl.setAttribute('aria-disabled', 'false');
  }

  const per = document.getElementById('d-per-person');
  if (per) per.textContent = '';

  const payerList = document.getElementById('d-payers-list');
  if (payerList) payerList.innerHTML = '';

  if (!keepTotal) state.detailMultiPayTotalTouched = false;
  state.detailMultiPayTouchedRows = {};
  state.detailMultiPayLockedTarget = '';
  state.detailMultiPayEditingTarget = '';
  state.detailMultiPayNextRowId = 1;

  state.detailSplitCustom = {};
  state.detailSplitTouched = {};
  if (!keepTotal) state.detailSplitTotalTouched = false;
  if (!keepTotal) state.detailSplitTotalDerived = false;
  state.detailSplitEditingMember = '';
  state.detailSplitLockedTarget = '';
  state.detailSplitAutoFilledTarget = '';

  resetRenderedSplitCustomInputs();
  syncDetailAmountUi();
}

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
      try {
        const pr = await enableTripCnyModePermanent(trip.id);
        toast(pr?.status === 'queued' ? '已開啟人民幣模式（連上網路後會寫入試算表）' : '已開啟人民幣模式');
      } catch (err) {
        toast(formatPostError(err));
      }
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
  ensureTripDetailHeaderNameFitBinding();
  const state = tripDetailState();
  const trip = getTripById(state.currentTripId);
  if (!trip) {
    if (state.currentPage === 'tripDetail') navigate('trips');
    return;
  }
  if (state._tripDetailHistoryTripId !== trip.id) {
    state.tripDetailHistoryWeekOffset = 0;
    state.tripDetailHistoryFilterDate = null;
    state._tripDetailHistoryTripId = trip.id;
  }
  const expenses = getTripExpenses(state.currentTripId);
  const settlements = getTripSettlementDisplayRowsFromRows(state.currentTripId, state.allRows);
  state._tripExpenseCache = expenses;
  state._tripSettlementCache = settlements;

  const nameEl = document.getElementById('detail-name');
  if (nameEl) {
    nameEl.textContent = trip.name;
    nameEl.dataset.fullName = trip.name;
    bindTripDetailNameCnyModeLongPress(nameEl, trip);
    if (isTripCnyModeEnabled(trip.id)) nameEl.removeAttribute('title');
    else if (!trip._closed) nameEl.title = '長按行程名稱可開啟人民幣模式（開啟後無法關閉）';
    else nameEl.removeAttribute('title');
  }
  const cnyOn = isTripCnyModeEnabled(trip.id);
  document.getElementById('page-trip-detail')?.classList.toggle('trip-detail--cny-mode', cnyOn);
  if (!cnyOn) state.detailAmountCurrency = 'TWD';
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
    amtInp.setAttribute('inputmode', state.detailAmountCurrency === 'CNY' ? 'decimal' : 'numeric');
    amtInp.setAttribute('aria-label', state.detailAmountCurrency === 'CNY' ? '金額（人民幣）' : '金額（新台幣）');
  } else if (amtInp) {
    amtInp.setAttribute('inputmode', 'numeric');
    amtInp.setAttribute('aria-label', '金額（新台幣）');
  }

  const activeTotal = expenses.filter(e => !e._voided).length;
  const detailCountEl = document.getElementById('detail-count');
  if (detailCountEl) detailCountEl.dataset.activeCount = String(activeTotal);

  renderDetailMemberChips(trip.members);
  renderDetailKnownMembers(trip);
  renderTripLotteryCard(trip);

  if (!state.detailPaidBy || !trip.members.includes(state.detailPaidBy)) {
    state.detailPaidBy = trip.members[0] || '';
  }
  const paidWrap = document.getElementById('d-paidby-toggles');
  if (paidWrap) {
    paidWrap.innerHTML = trip.members
      .map(
        m =>
          `<button type="button" class="btn-toggle${m === state.detailPaidBy ? ' active' : ''}" data-member="${esc(m)}" onclick="setDetailPaidBy(${JSON.stringify(m)})">${esc(m)}</button>`,
      )
      .join('');
  }

  state.detailSplitAmong = state.detailSplitAmong.filter(m => trip.members.includes(m));
  if (state.detailSplitAmong.length === 0) state.detailSplitAmong = [...trip.members];
  for (const k of Object.keys(state.detailSplitCustom || {})) {
    if (!trip.members.includes(k)) delete state.detailSplitCustom[k];
  }
  for (const k of Object.keys(state.detailSplitTouched || {})) {
    if (!trip.members.includes(k)) delete state.detailSplitTouched[k];
  }
  state.detailSplitLockedTarget = '';
  state.detailSplitAutoFilledTarget = '';
  if (!state.detailMultiPay) {
    state.detailMultiPayTotalTouched = false;
    state.detailMultiPayTouchedRows = {};
    state.detailMultiPayLockedTarget = '';
    state.detailMultiPayEditingTarget = '';
  }
  renderSplitChips(trip.members);

  renderSettlement(trip.members, expenses, trip, state.allRows);

  const headerActions = document.getElementById('trip-header-actions');
  const archiveBar = document.getElementById('trip-archive-bar');
  const addCard = document.getElementById('add-expense-card');
  if (trip._closed) {
    if (headerActions) headerActions.innerHTML = '';
    if (archiveBar) archiveBar.innerHTML = `<div class="trip-closed-bar">
      <div class="trip-closed-bar-note">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;flex-shrink:0"><path d="M20 6h-2.18c.07-.44.18-.88.18-1 0-2.21-1.79-4-4-4s-4 1.79-4 4c0 .12.11.56.18 1H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-3c1.1 0 2 .9 2 2 0 .12-.11.56-.18 1h-3.64C12.11 5.56 12 5.12 12 5c0-1.1.9-2 2-2zm0 10l-4-4 1.41-1.41L14 10.17l4.59-4.58L20 7l-6 6z"/></svg>
        此行程已結束，僅供瀏覽
      </div>
      <div class="trip-closed-bar-actions">
        <button type="button" class="btn btn-primary btn-sm" onclick='openTripClosureReportModal(${jq(trip.id)})'>查看結案報告</button>
        <button type="button" class="btn btn-outline btn-sm" onclick='reopenTripAction(${jq(trip.id)})'>重新開啟</button>
      </div>
    </div>`;
    if (addCard) addCard.style.display = 'none';
  } else {
    if (headerActions) {
      headerActions.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" style="color:var(--text-muted);font-size:12px;gap:5px;flex-shrink:0" onclick='closeTripAction(${jq(trip.id)})'>
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M20 6h-2.18c.07-.44.18-.88.18-1 0-2.21-1.79-4-4-4s-4 1.79-4 4c0 .12.11.56.18 1H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-3c1.1 0 2 .9 2 2 0 .12-.11.56-.18 1h-3.64C12.11 5.56 12 5.12 12 5c0-1.1.9-2 2-2zm0 10l-4-4 1.41-1.41L14 10.17l4.59-4.58L20 7l-6 6z"/></svg>
        結束行程
      </button>`;
    }
    if (archiveBar) archiveBar.innerHTML = '';
    if (addCard) addCard.style.display = '';
  }

  const doReveal = state.revealTripExpensesNext;
  state.revealTripExpensesNext = false;
  renderTripHistory(expenses, settlements, trip, state.allRows, doReveal);
  const chipsEl = document.getElementById('detail-member-chips');
  if (chipsEl) bindScrollReveal(chipsEl, '.member-chip', { enabled: doReveal });
  const kmRoot = document.getElementById('detail-known-members');
  if (kmRoot) bindScrollReveal(kmRoot, '.known-member-bar-btn', { enabled: doReveal });

  syncDetailTripFormLabels();
  scheduleFitTripDetailHeaderName();
}

export function syncDetailTripFormLabels() {
  const state = tripDetailState();
  const g = state.detailGamblingMode;
  const paid = document.getElementById('d-label-paidby');
  if (paid) paid.textContent = g ? '誰贏錢？' : '誰先付錢？';
  const mp = document.getElementById('d-label-multipay-toggle');
  if (mp) {
    if (state.detailMultiPay) mp.textContent = g ? '單人贏錢' : '單人付款';
    else mp.textContent = g ? '多人贏錢' : '多人出款';
  }
  const sub = document.getElementById('d-label-payers-sub');
  if (sub) sub.textContent = g ? '各贏多少？' : '各自出了多少？';
  const spl = document.getElementById('d-label-split');
  if (spl) spl.textContent = g ? '誰承擔（輸家）？' : '誰要分攤？';
  const sm = document.getElementById('d-label-split-mode');
  if (sm) sm.textContent = state.detailSplitMode === 'custom' ? '改回均分' : g ? '詳細輸贏' : '詳細分攤';
  const toggles = document.getElementById('d-paidby-toggles');
  if (toggles) toggles.setAttribute('aria-label', g ? '誰贏錢' : '誰先付錢');
  const gambleBtn = document.getElementById('d-gambling-toggle');
  if (gambleBtn) {
    gambleBtn.classList.toggle('d-gambling-toggle--on', !!g);
    gambleBtn.setAttribute('aria-pressed', g ? 'true' : 'false');
  }
  if (isTripCnyModeEnabled(state.currentTripId)) {
    hydrateTripCnyRateInput();
    import('../actions/trip-form.js').then(m => {
      m.applyTripCnyToTwd();
      void m.refreshTripLiveCnyRateUi({ force: false });
    });
  }
}
