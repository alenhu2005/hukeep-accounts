import { USER_A, USER_B } from '../config.js';
import { appState } from '../state.js';
import { todayStr } from '../time.js';
import {
  uid,
  toast,
  esc,
  jqAttr,
  jq,
  randomUniformIndex,
  memberToneClass,
  memberToneVars,
  prefersReducedMotion,
  bindScrollReveal,
} from '../utils.js';
import { postRow, formatPostError } from '../api.js';
import {
  getDailyRecords,
  getTripById,
  getTripExpenses,
  getTripSettlementAdjustmentsFromRows,
  getKnownMemberNames,
  getAvatarUrlByMemberName,
  getMemberColor,
  getMemberColorId,
  isHiddenMemberColorId,
  getHiddenMemberStyleKey,
  MEMBER_COLORS,
  HIDDEN_MEMBER_COLORS,
  TRIP_COLORS,
  pickRandomTripColorId,
} from '../data.js';
import { computeBalance, computeSettlements } from '../finance.js';
import { showConfirm, showAlert } from '../dialog.js';
import { guessCategoryFromItem, GAMBLING_CATEGORY } from '../category.js';
import { navigate } from '../navigation.js';
import { pauseSyncBriefly } from '../sync-pause.js';
import { renderHome, cancelHomeBalanceAnim } from '../views-home.js';
import { renderTrips } from '../views-trips.js';
import {
  renderTripDetail,
  renderSplitChips,
  renderSplitCustomList,
  updatePerPerson,
  updateMultiPayTotal,
  resetTripDetailAmountDraft,
  syncDetailTripFormLabels,
} from '../views-trip-detail.js';
import { buildTripSettlementSummaryText } from '../trip-stats.js';
import { toggleCollapsible } from '../ui-collapsible.js';
import { undoOptimisticPush, parseMoneyLike, snapshotPendingHomeBalanceFromAbs, fileToJpegDataUrl } from './shared.js';
import {
  persistCnyTwdRate,
  fetchLiveCnyToTwdRate,
  isLiveCnyCacheFresh,
  isTripCnyModeEnabled,
  getDetailAmountNt,
  setDetailAmountFromNt,
  updateCnyRateInlineDisplay,
} from '../trip-cny-rate.js';

function refreshDetailAmountDisplayAfterRate() {
  const nt = getDetailAmountNt();
  setDetailAmountFromNt(nt);
}

/** 新增消費標題列：整列收合；點「賭博模式」等內嵌按鈕時不收合 */
export function tripDetailFormHeaderClick(e) {
  if (e?.target?.closest?.('button, a, input, textarea, select')) return;
  toggleCollapsible('detail-form', 'detail-toggle-icon', 'detail-form-header-toggle');
}

export function tripDetailFormHeaderKeydown(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  toggleCollapsible('detail-form', 'detail-toggle-icon', 'detail-form-header-toggle');
}

// ── Trip detail form ─────────────────────────────────────────────────────────
export function toggleDetailGamblingMode() {
  appState.detailGamblingMode = !appState.detailGamblingMode;
  syncDetailTripFormLabels();
}

export function setDetailPaidBy(name) {
  const trip = getTripById(appState.currentTripId);
  if (!trip || !trip.members.includes(name)) return;
  appState.detailPaidBy = name;
  document.querySelectorAll('#d-paidby-toggles .btn-toggle').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.member === name);
  });
}

export function toggleMultiPay() {
  const trip = getTripById(appState.currentTripId);
  const members = trip ? trip.members : [];
  const mtog = document.getElementById('d-multipay-toggle');
  if (mtog?.disabled) return;
  const next = !appState.detailMultiPay;
  if (next && members.length < 2) return;

  // UX: switching payment mode should not keep amount draft.
  resetTripDetailAmountDraft({ keepTotal: true });

  appState.detailMultiPay = next;
  document.getElementById('d-paidby-group').style.display = appState.detailMultiPay ? 'none' : '';
  // Keep total amount visible so we can lock/auto-calc the last unfilled field.
  document.getElementById('d-amount-group').style.display = '';
  document.getElementById('d-multipay-group').style.display = appState.detailMultiPay ? '' : 'none';
  syncDetailTripFormLabels();
  if (appState.detailMultiPay) {
    document.getElementById('d-payers-list').innerHTML = '';
    appState.detailMultiPayTouchedRows = {};
    appState.detailMultiPayNextRowId = 1;
    // If total already has value, treat it as user-provided so residual locking can work immediately.
    appState.detailMultiPayTotalTouched = getDetailAmountNt() > 0;
    addPayerRow(members);
    addPayerRow(members);
    refreshPayerToggleDisabledState();
  } else {
    refreshPayerToggleDisabledState();
  }
  // Reset multi-pay lock target on mode switch.
  appState.detailMultiPayLockedTarget = '';
  appState.detailMultiPayEditingTarget = '';
  if (!appState.detailMultiPay) appState.detailMultiPayTotalTouched = false;
  updatePerPerson();
}

function usedPayerNamesExcludingRow(excludeRow) {
  const used = new Set();
  document.querySelectorAll('#d-payers-list .payer-row').forEach(r => {
    if (r === excludeRow) return;
    const inp = r.querySelector('input.payer-name');
    const v = (inp && inp.value) || '';
    if (v.trim()) used.add(v.trim());
  });
  return used;
}

/** 已在其他列選過的成員：按鈕淡灰不可點；「＋ 新增」在成員已各一列時 disabled */
export function refreshPayerToggleDisabledState() {
  const addBtn = document.getElementById('d-add-payer-row-btn');
  const trip = getTripById(appState.currentTripId);
  const members = trip ? trip.members : [];
  const rows = document.querySelectorAll('#d-payers-list .payer-row');
  if (!appState.detailMultiPay) {
    if (addBtn) {
      addBtn.disabled = false;
      addBtn.classList.remove('is-disabled');
    }
    return;
  }
  const usedAll = usedPayerNamesExcludingRow(null);
  const full = members.length > 0 && usedAll.size >= members.length;
  if (addBtn) {
    addBtn.disabled = full;
    addBtn.classList.toggle('is-disabled', full);
  }
  rows.forEach(row => {
    const usedElsewhere = usedPayerNamesExcludingRow(row);
    row.querySelectorAll('.payer-name-toggles .btn-toggle').forEach(b => {
      const m = (b.dataset.member || '').trim();
      const blocked = usedElsewhere.has(m);
      b.disabled = blocked;
      b.classList.toggle('btn-toggle--blocked', blocked);
      b.setAttribute('aria-disabled', blocked ? 'true' : 'false');
    });
  });
}

function maybeCollapseMultiPayToSingle() {
  if (!appState.detailMultiPay) return;
  const rows = document.querySelectorAll('#d-payers-list .payer-row');
  if (rows.length > 1) return;

  let name = '';
  let amt = 0;
  if (rows.length === 1) {
    name = (rows[0].querySelector('input.payer-name')?.value || '').trim();
    amt = parseFloat(rows[0].querySelector('.payer-amount')?.value) || 0;
  }

  appState.detailMultiPay = false;
  const list = document.getElementById('d-payers-list');
  if (list) list.innerHTML = '';
  document.getElementById('d-paidby-group').style.display = '';
  document.getElementById('d-amount-group').style.display = '';
  document.getElementById('d-multipay-group').style.display = 'none';
  const mtog = document.getElementById('d-multipay-toggle');
  if (mtog) {
    syncDetailTripFormLabels();
    const tripNow = getTripById(appState.currentTripId);
    const mems = tripNow ? tripNow.members : [];
    mtog.disabled = mems.length < 2;
    mtog.classList.toggle('trip-multipay-toggle--blocked', mems.length < 2);
  }

  const trip = getTripById(appState.currentTripId);
  if (trip) {
    if (name && trip.members.includes(name)) appState.detailPaidBy = name;
    else if (trip.members[0]) appState.detailPaidBy = trip.members[0];
  }
  // UX: collapsing back to single-pay should not clear total amount.
  const hadTotal = getDetailAmountNt() > 0;
  resetTripDetailAmountDraft({ keepTotal: true });
  // If total was empty, keep it convenient by filling from the last remaining payer amount.
  if (!hadTotal && amt > 0) {
    setDetailAmountFromNt(Math.round(amt));
  }

  renderTripDetail();
}

export function removePayerRow(btn) {
  const row = btn && btn.closest('.payer-row');
  if (row) {
    const rowId = String(row.dataset.rowId || '').trim();
    if (rowId) delete appState.detailMultiPayTouchedRows[rowId];
    row.remove();
  }
  updateMultiPayTotal();
  refreshPayerToggleDisabledState();
  maybeCollapseMultiPayToSingle();
}

export function setPayerRowMember(btn) {
  const row = btn.closest('.payer-row');
  if (!row) return;
  const m = (btn.dataset.member || '').trim();
  if (usedPayerNamesExcludingRow(row).has(m) || btn.disabled) return;
  const hidden = row.querySelector('input.payer-name');
  if (hidden) hidden.value = m;
  row.querySelectorAll('.payer-name-toggles .btn-toggle').forEach(b => {
    b.classList.toggle('active', b === btn);
  });
  updateMultiPayTotal();
  refreshPayerToggleDisabledState();
}

export function addPayerRow(membersOverride) {
  const trip = getTripById(appState.currentTripId);
  const members = membersOverride || (trip ? trip.members : []);
  const list = document.getElementById('d-payers-list');
  const used = usedPayerNamesExcludingRow(null);
  const defaultMember = members.find(x => !used.has(x));
  if (defaultMember === undefined && members.length > 0) return;
  const pick = defaultMember ?? '';
  const row = document.createElement('div');
  row.className = 'payer-row';
  const rowId = String(appState.detailMultiPayNextRowId++);
  row.dataset.rowId = rowId;
  appState.detailMultiPayTouchedRows[rowId] = false;
  const toggles = members
    .map(
      m =>
        `<button type="button" class="btn-toggle${m === pick ? ' active' : ''}" data-member="${esc(m)}" onclick="setPayerRowMember(this)">${esc(m)}</button>`,
    )
    .join('');
  row.innerHTML = `
    <div class="btn-group btn-group-payer payer-name-toggles" role="group" aria-label="付款人">
      ${toggles}
    </div>
    <input type="hidden" class="payer-name" value="${esc(pick)}">
    <div class="payer-row-amount-line">
      <input type="text" class="form-input form-input-amount payer-amount" data-row-id="${esc(rowId)}" placeholder="金額"
        lang="en" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off"
        inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" aria-label="付款金額"
        onfocus="beginMultiPayEdit(this)"
        onblur="endMultiPayEdit(this)"
        oninput="handleMultiPayAmountInput(this)">
      <button type="button" class="payer-row-remove" onclick="removePayerRow(this)" aria-label="刪除此列">×</button>
    </div>`;
  list.appendChild(row);
  refreshPayerToggleDisabledState();
}

export function beginMultiPayEdit(payerAmountInput) {
  const inp = payerAmountInput;
  if (!inp) return;
  const row = inp.closest('.payer-row');
  const rowId = String(row?.dataset?.rowId || '').trim();
  appState.detailMultiPayEditingTarget = rowId ? `row:${rowId}` : 'total';
}

export function endMultiPayEdit(payerAmountInput) {
  const inp = payerAmountInput;
  if (!inp) return;
  if (document.activeElement === inp) return;
  appState.detailMultiPayEditingTarget = '';
  updateMultiPayTotal();
}

export function handleMultiPayAmountInput(payerAmountInput) {
  const inp = payerAmountInput;
  if (!inp) return;
  // If total is fixed by user input, prevent any single payer row from pushing sum > total.
  // Important: exclude disabled (auto-residual) row from cap calc to avoid "1 digit then stuck".
  if (appState.detailMultiPay) {
    const totalVal = getDetailAmountNt();
    if (appState.detailMultiPayTotalTouched && totalVal > 0) {
      const otherSum = Array.from(document.querySelectorAll('#d-payers-list .payer-amount'))
        .filter(el => el !== inp && !el.disabled)
        .reduce((s, el) => s + parseMoneyLike(el.value), 0);
      const maxAllowed = Math.max(0, totalVal - otherSum);
      const cur = parseMoneyLike(inp.value);
      if (cur > maxAllowed) {
        inp.value = maxAllowed > 0 ? String(Math.round(maxAllowed)) : '';
      }
    }
  }
  const rowId = String(inp.getAttribute('data-row-id') || '').trim();
  if (rowId) {
    appState.detailMultiPayTouchedRows[rowId] = parseMoneyLike(inp.value) > 0;
  }
  updateMultiPayTotal();
}

/** 消費項目欄按 Enter → 聚焦下一個金額欄（略過 IME 組字中的 Enter） */
export function focusAmountAfterHomeItem(ev) {
  if (ev.key !== 'Enter') return;
  if (ev.isComposing) return;
  ev.preventDefault();
  if (appState.homeSplitMode === '兩人付') {
    document.getElementById('h-paidhu')?.focus();
  } else {
    document.getElementById('h-amount')?.focus();
  }
}

/** 兩人付「各自出多少」：胡出 Enter → 詹出；詹出 Enter → 備注 */
export function focusNextInBothPayHome(ev) {
  if (ev.key !== 'Enter') return;
  if (ev.isComposing) return;
  ev.preventDefault();
  const id = ev.target && ev.target.id;
  if (id === 'h-paidhu') {
    document.getElementById('h-paidzhan')?.focus();
  } else if (id === 'h-paidzhan') {
    document.getElementById('h-note')?.focus();
  }
}

export function focusAmountAfterTripItem(ev) {
  if (ev.key !== 'Enter') return;
  if (ev.isComposing) return;
  ev.preventDefault();
  if (appState.detailMultiPay) {
    const list = document.getElementById('d-payers-list');
    if (!list.querySelector('.payer-amount')) {
      addPayerRow();
    }
    list.querySelector('.payer-amount')?.focus();
  } else {
    document.getElementById('d-amount')?.focus();
  }
}

export function toggleSplit(name) {
  if (appState.detailSplitAmong.includes(name)) {
    if (appState.detailSplitAmong.length <= 1) return;
    appState.detailSplitAmong = appState.detailSplitAmong.filter(m => m !== name);
  } else {
    appState.detailSplitAmong = [...appState.detailSplitAmong, name];
  }
  const trip = getTripById(appState.currentTripId);
  if (trip) renderSplitChips(trip.members);
}

export function toggleDetailSplitMode() {
  appState.detailSplitMode = appState.detailSplitMode === 'custom' ? 'equal' : 'custom';
  syncDetailTripFormLabels();
  if (appState.detailSplitMode === 'custom') {
    appState.detailSplitTotalTouched = getDetailAmountNt() > 0;
  } else {
    // Back to equal split: clear all custom split values/state.
    appState.detailSplitCustom = {};
    appState.detailSplitTouched = {};
    appState.detailSplitTotalTouched = false;
    appState.detailSplitLockedTarget = '';
    appState.detailSplitEditingMember = '';
  }
  renderSplitCustomList();
  updatePerPerson();
}

export function setDetailSplitAmount(name, rawValue) {
  const key = String(name || '').trim();
  if (!key) return;
  const rawStr = String(rawValue ?? '');
  const hasAnyDigit = /\d/.test(rawStr);
  const val = parseMoneyLike(rawStr);
  let next = Number.isFinite(val) && val > 0 ? val : 0;

  // Custom split guard: never let split total exceed total amount.
  if (appState.detailSplitMode === 'custom') {
    const total = getDetailAmountNt();
    // Enforce hard cap whenever total has a value (or multi-pay mode),
    // regardless of whether the total input was the last touched field.
    if (total > 0 || appState.detailMultiPay) {
      // UX: when there is a computed residual (locked target), do not count it in cap calculation;
      // otherwise typing the 2nd-to-last field gets "stuck" at 1 digit (residual consumes remaining).
      const locked = String(appState.detailSplitLockedTarget || appState.detailSplitAutoFilledTarget || '').trim();
      const excludeLocked = locked && locked !== 'total' && locked !== key;
      const otherSum = appState.detailSplitAmong
        .filter(m => m !== key && (!excludeLocked || m !== locked))
        .reduce((s, m) => s + parseMoneyLike(appState.detailSplitCustom?.[m]), 0);
      // If total is not provided (0), don't cap.
      const maxAllowed = total > 0 ? Math.max(0, total - otherSum) : Infinity;
      if (next > maxAllowed) next = maxAllowed;
    }
  }

  appState.detailSplitCustom[key] = next;
  // UX: empty input means "unfilled" (not explicit zero). Typing 0 is explicit zero.
  appState.detailSplitTouched[key] = hasAnyDigit;
  // If user edits the previously auto-filled residual target, it's no longer "unfilled".
  if (appState.detailSplitAutoFilledTarget === key) {
    appState.detailSplitAutoFilledTarget = '';
  }
  const input = Array.from(document.querySelectorAll('#d-split-custom-list input[data-member]'))
    .find(el => el.getAttribute('data-member') === key);
  if (input && document.activeElement === input) {
    // UX: keep explicit zero visible while typing; empty means "unfilled".
    if (next > 0) input.value = String(Math.round(next));
    else input.value = hasAnyDigit ? '0' : '';
  }
  updatePerPerson();
}

export function beginDetailSplitEdit(name) {
  appState.detailSplitEditingMember = String(name || '').trim();
}

export function endDetailSplitEdit(name) {
  const key = String(name || '').trim();
  if (appState.detailSplitEditingMember === key) appState.detailSplitEditingMember = '';
  // Apply residual autofill only after user finishes editing this row.
  updatePerPerson();
}

/**
 * 人民幣模式下：依輸入幣別與匯率更新內部台幣分攤；選 ¥ 時不覆寫輸入框為台幣。
 */
export function applyTripCnyToTwd() {
  if (!isTripCnyModeEnabled(appState.currentTripId)) return;
  const rateEl = document.getElementById('d-cny-rate');
  const totalEl = document.getElementById('d-amount');
  if (!totalEl) return;
  const rate = parseMoneyLike(rateEl?.value);

  if (appState.detailSplitTotalDerived) {
    appState.detailSplitTotalDerived = false;
    totalEl.disabled = false;
    totalEl.classList.remove('split-custom-input--locked');
    totalEl.setAttribute('aria-disabled', 'false');
  }

  if (appState.detailMultiPay) {
    appState.detailMultiPayTotalTouched = true;
    appState.detailMultiPayLockedTarget = '';
  }
  if (appState.detailSplitMode === 'custom') {
    appState.detailSplitTotalTouched = true;
  }

  if (appState.detailAmountCurrency === 'CNY') {
    const cny = parseMoneyLike(totalEl.value);
    if (cny > 0 && rate > 0) persistCnyTwdRate(rate);
  } else if (rate > 0) {
    persistCnyTwdRate(rate);
  }

  updatePerPerson();
}

export function handleDetailCnyInput() {
  applyTripCnyToTwd();
}

/**
 * 向公開 API 取得 CNY→TWD，更新隱藏匯率欄、總金額列旁一句匯率，並觸發換算。
 * @param {{ force?: boolean }} [opts] force=true 時強制重抓（略過 45 分鐘快取）
 */
export async function refreshTripLiveCnyRateUi(opts = {}) {
  if (!isTripCnyModeEnabled(appState.currentTripId)) return;
  const force = !!(opts && opts.force);
  const rateEl = document.getElementById('d-cny-rate');
  if (!rateEl) return;

  const got = await fetchLiveCnyToTwdRate({ force });
  if (!got) {
    updateCnyRateInlineDisplay();
    return;
  }

  rateEl.value = String(got.rate);
  updateCnyRateInlineDisplay();

  applyTripCnyToTwd();
  refreshDetailAmountDisplayAfterRate();
}

export function beginDetailTotalEdit() {
  appState.detailSplitEditingMember = '';
  // If total was derived (auto), allow user to override by unlocking it.
  if (appState.detailSplitTotalDerived) {
    appState.detailSplitTotalDerived = false;
    const totalEl = document.getElementById('d-amount');
    if (totalEl) {
      totalEl.disabled = false;
      totalEl.classList.remove('split-custom-input--locked');
      totalEl.setAttribute('aria-disabled', 'false');
    }
  }
  if (appState.detailMultiPay) appState.detailMultiPayEditingTarget = 'total';
}

export function handleDetailTotalInput() {
  // Any manual edit means total is no longer derived.
  if (appState.detailSplitTotalDerived) appState.detailSplitTotalDerived = false;
  if (appState.detailMultiPay) {
    appState.detailMultiPayTotalTouched = getDetailAmountNt() > 0;
    // If user clears total, stop forcing a locked multi-pay row.
    if (!appState.detailMultiPayTotalTouched) appState.detailMultiPayLockedTarget = '';
  }
  if (appState.detailSplitMode === 'custom') appState.detailSplitTotalTouched = true;
  updatePerPerson();
}

export function endDetailTotalEdit() {
  updatePerPerson();
  if (appState.detailMultiPay && appState.detailMultiPayEditingTarget === 'total') {
    appState.detailMultiPayEditingTarget = '';
  }
}

