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
import {
  undoOptimisticPush,
  parseMoneyLike,
  snapshotPendingHomeBalanceFromAbs,
  fileToJpegDataUrl,
  snapshotRows,
  restoreRowsSnapshot,
  applyOptimisticPayload,
} from './shared.js';
import {
  getDetailAmountNt,
  isTripCnyModeEnabled,
  syncDetailAmountCurrencyToggleUi,
  cnyAuxAmountFromNtd,
} from '../trip-cny-rate.js';

export async function submitTripExpense() {
  const item = document.getElementById('d-item').value.trim();
  const note = document.getElementById('d-note').value.trim();
  if (!item) {
    toast('請填寫消費項目');
    return;
  }
  if (appState.detailSplitAmong.length === 0) {
    toast('請選擇分攤成員');
    return;
  }
  let splitDetails = appState.detailSplitMode === 'custom'
    ? appState.detailSplitAmong
      .map(name => ({
        name,
        amount: parseMoneyLike(appState.detailSplitCustom?.[name]),
      }))
      
    : [];
  const reconcileCustomSplit = (targetAmount) => {
    if (appState.detailSplitMode !== 'custom') return { ok: true, total: 0 };

    const missing = splitDetails.filter(s => s.amount <= 0);
    if (missing.length > 1) {
      return { ok: false, reason: 'MISSING_TOO_MANY' };
    }

    if (missing.length === 1) {
      const missName = missing[0].name;
      const used = splitDetails
        .filter(s => s.name !== missName)
        .reduce((s, x) => s + x.amount, 0);
      const residual = Math.max(0, targetAmount - used);
      splitDetails = splitDetails.map(s => (s.name === missName ? { ...s, amount: residual } : s));
      appState.detailSplitCustom[missName] = residual;
    }

    let splitTotal = splitDetails.reduce((s, x) => s + x.amount, 0);
    if (Math.abs(splitTotal - targetAmount) > 0.01) {
      const splitLock = String(appState.detailSplitLockedTarget || '');
      if (splitLock && splitLock !== 'total') {
        const used = splitDetails
          .filter(s => s.name !== splitLock)
          .reduce((s, x) => s + x.amount, 0);
        const residual = Math.max(0, targetAmount - used);
        splitDetails = splitDetails.map(s => (s.name === splitLock ? { ...s, amount: residual } : s));
        appState.detailSplitCustom[splitLock] = residual;
        splitTotal = splitDetails.reduce((s, x) => s + x.amount, 0);
      }
    }
    return { ok: Math.abs(splitTotal - targetAmount) <= 0.01, total: splitTotal };
  };

  let amount;
  let paidBy;
  let extraFields = {};
  if (appState.detailMultiPay) {
    const nameEls = document.querySelectorAll('#d-payers-list .payer-name');
    const amountEls = document.querySelectorAll('#d-payers-list .payer-amount');
    const collectPayers = () =>
      Array.from(nameEls)
        .map((sel, i) => ({
          name: (sel.value || '').trim(),
          amount: parseMoneyLike(amountEls[i]?.value),
        }))
        .filter(p => p.amount > 0 && p.name);
    const payers = collectPayers();
    if (payers.length === 0) {
      toast('請在各列填寫付款人與金額（總計為各列出資相加）');
      return;
    }
    const names = payers.map(p => p.name);
    if (new Set(names).size !== names.length) {
      toast('各列出款人不可重複，請改選或刪除多餘的列');
      return;
    }
    if (names.length < 2) {
      toast('多人出款請至少兩位不同出資人；只有一人出資請改「單人付款」');
      return;
    }
    amount = payers.reduce((s, p) => s + p.amount, 0);
    const totalVal = getDetailAmountNt();
    if (totalVal > 0 && Math.abs(totalVal - amount) > 0.01) {
      const lock = String(appState.detailMultiPayLockedTarget || '');
      if (lock.startsWith('row:')) {
        const rowId = lock.slice(4);
        const rows = Array.from(document.querySelectorAll('#d-payers-list .payer-row'));
        const lockRow = rows.find(r => String(r.dataset.rowId || '') === rowId);
        const lockName = (lockRow?.querySelector('input.payer-name')?.value || '').trim();
        if (lockName) {
          const others = payers.filter(p => p.name !== lockName);
          const residual = Math.max(0, totalVal - others.reduce((s, p) => s + p.amount, 0));
          payers = [...others, { name: lockName, amount: residual }];
          amount = payers.reduce((s, p) => s + p.amount, 0);
          const lockInput = lockRow?.querySelector('.payer-amount');
          if (lockInput) lockInput.value = residual > 0 ? String(Math.round(residual)) : '';
        } else {
          toast(`總金額 NT$${Math.round(totalVal)} 與出款合計 NT$${Math.round(amount)} 不一致，請對齊後再送出`);
          return;
        }
      } else {
        toast(`總金額 NT$${Math.round(totalVal)} 與出款合計 NT$${Math.round(amount)} 不一致，請對齊後再送出`);
        return;
      }
    }
    if (appState.detailSplitMode === 'custom') {
      const split = reconcileCustomSplit(amount);
      if (!split.ok) {
        if (split.reason === 'MISSING_TOO_MANY') {
          toast('詳細分攤模式下，至少要先填完除最後一位外的分攤金額');
        } else {
          toast(`詳細分攤合計 NT$${Math.round(split.total || 0)} 與出款合計 NT$${Math.round(amount)} 不一致`);
        }
        return;
      }
    }
    paidBy = '';
    extraFields = appState.detailSplitMode === 'custom' ? { payers, splitDetails } : { payers };
  } else {
    amount = getDetailAmountNt();
    paidBy = appState.detailPaidBy;
    if (!amount || amount <= 0) {
      toast('請輸入有效金額');
      return;
    }
    if (!paidBy) {
      toast('請選擇付款人');
      return;
    }
    if (appState.detailSplitMode === 'custom') {
      const split = reconcileCustomSplit(amount);
      if (!split.ok) {
        if (split.reason === 'MISSING_TOO_MANY') {
          toast('詳細分攤模式下，至少要先填完除最後一位外的分攤金額');
        } else {
          toast(`詳細分攤合計 NT$${Math.round(split.total || 0)} 與總金額 NT$${Math.round(amount)} 不一致`);
        }
        return;
      }
      extraFields = { splitDetails };
    }
  }
  if (appState.detailSplitMode === 'custom' && splitDetails.length > 0 && !extraFields.splitDetails) {
    extraFields = { ...extraFields, splitDetails };
  }

  let category = '';
  if (appState.detailGamblingMode) {
    category = GAMBLING_CATEGORY;
  }

  const cnyTrip = isTripCnyModeEnabled(appState.currentTripId);
  const rate = parseMoneyLike(document.getElementById('d-cny-rate')?.value);
  let amountCnyVal = 0;
  if (cnyTrip && rate > 0 && amount > 0) {
    if (appState.detailAmountCurrency === 'CNY') {
      amountCnyVal = parseMoneyLike(document.getElementById('d-amount')?.value);
    } else {
      amountCnyVal = cnyAuxAmountFromNtd(amount, rate);
    }
  }

  const btn = document.getElementById('d-submit');
  btn.disabled = true;
  btn.textContent = '記帳中…';

  const row = {
    type: 'tripExpense',
    action: 'add',
    id: uid(),
    tripId: appState.currentTripId,
    item,
    amount,
    paidBy,
    splitAmong: JSON.stringify(appState.detailSplitAmong),
    date: todayStr(),
    note,
    ...(category ? { category } : {}),
    ...(amountCnyVal > 0 ? { amountCny: amountCnyVal } : {}),
    ...extraFields,
  };
  const snapshot = snapshotRows();
  applyOptimisticPayload(row);
  pauseSyncBriefly(5000);
  renderTripDetail();

  try {
    const sentRow = appState.allRows.find(r => r && r.type === 'tripExpense' && r.id === row.id) || row;
    const pr = await postRow(row, { syncTarget: sentRow });
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '已記帳！');
    appState.detailGamblingMode = false;
  } catch (e) {
    restoreRowsSnapshot(snapshot);
    renderTripDetail();
    toast(formatPostError(e));
  }

  document.getElementById('d-item').value = '';
  document.getElementById('d-amount').value = '';
  appState.detailAmountCurrency = 'TWD';
  syncDetailAmountCurrencyToggleUi();
  const amtInp = document.getElementById('d-amount');
  if (amtInp) {
    amtInp.setAttribute('inputmode', 'numeric');
    amtInp.setAttribute('aria-label', '金額（新台幣）');
  }
  document.getElementById('d-note').value = '';
  if (appState.detailSplitMode === 'custom') {
    appState.detailSplitCustom = {};
    appState.detailSplitTouched = {};
    appState.detailSplitTotalTouched = false;
    appState.detailSplitEditingMember = '';
    appState.detailSplitLockedTarget = '';
    renderSplitCustomList();
  }
  if (appState.detailMultiPay) {
    document.querySelectorAll('#d-payers-list .payer-amount').forEach(el => {
      el.value = '';
    });
  }
  syncDetailTripFormLabels();
  btn.disabled = false;
  btn.textContent = '記起來';
}

export async function voidTripExpenseAction(id) {
  const r = appState._tripExpenseCache.find(x => x.id === id);
  if (!r) return;
  const item = r.item || '消費';
  const amount = parseFloat(r.amount) || 0;
  const ok = await showConfirm(
    '撤回這筆紀錄？',
    `「${item}」— NT$${Math.round(amount)} 會保留在歷史紀錄中，但不再列入目前帳務。`,
  );
  if (!ok) return;
  const row = { type: 'tripExpense', action: 'void', id };
  const snapshot = snapshotRows();
  applyOptimisticPayload(row, { pending: false });
  renderTripDetail();
  try {
    const syncTarget = appState.allRows.find(x => x && x.type === 'tripExpense' && x.id === id) || null;
    const pr = await postRow(row, { syncTarget });
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動同步撤回' : '已撤回');
  } catch (e) {
    restoreRowsSnapshot(snapshot);
    renderTripDetail();
    toast(formatPostError(e));
  }
}

export async function copyTripSettlementSummary(tripId) {
  const trip = getTripById(tripId);
  if (!trip) return;
  const expenses = getTripExpenses(tripId);
  const text = buildTripSettlementSummaryText(trip, expenses);
  try {
    await navigator.clipboard.writeText(text);
    toast('結算摘要已複製');
  } catch {
    toast('無法複製，請檢查瀏覽器權限');
  }
}
