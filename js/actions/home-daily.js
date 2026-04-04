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

// ── Home form ────────────────────────────────────────────────────────────────
export function setHomePaidBy(val) {
  appState.homePaidBy = val;
  ['胡', '詹'].forEach(v => document.getElementById('pb-' + v).classList.toggle('active', v === val));
}

export function setHomeSplitMode(val) {
  appState.homeSplitMode = val;
  ['均分', '只有胡', '只有詹', '兩人付'].forEach(v =>
    document.getElementById('sm-' + v).classList.toggle('active', v === val),
  );
  const isBoth = val === '兩人付';
  document.getElementById('h-amount-group').style.display = isBoth ? 'none' : '';
  document.getElementById('h-both-group').style.display = isBoth ? '' : 'none';
  document.getElementById('h-paidby-group').style.display = isBoth ? 'none' : '';
}
// ── Daily actions ────────────────────────────────────────────────────────────
/** @param {HTMLElement} el 按鈕（含 data-from / data-to，供辨識轉帳對象） */
export async function recordTripSettlementOneAction(el) {
  const trip = getTripById(appState.currentTripId);
  if (!trip || trip._closed || !el) return;

  const from = el.getAttribute('data-from') || '';
  const to = el.getAttribute('data-to') || '';
  if (!from || !to) return;

  const expenses = getTripExpenses(trip.id);
  const active = expenses.filter(e => !e._voided);
  if (active.length === 0) {
    toast('無有效消費可結清');
    return;
  }

  const adjustments = getTripSettlementAdjustmentsFromRows(trip.id, appState.allRows);
  const settlements = computeSettlements(trip.members, active, adjustments);
  const match = settlements.find(s => s.from === from && s.to === to);
  if (!match || match.amount < 0.01) {
    toast('此筆已結清或建議已變更');
    renderTripDetail();
    return;
  }

  const amount = Math.round(match.amount);
  const ok = await showConfirm('記錄還款', `${from} 付給 ${to} NT$${amount}`);
  if (!ok) return;

  const row = {
    type: 'tripSettlement',
    action: 'add',
    id: uid(),
    tripId: trip.id,
    date: todayStr(),
    from,
    to,
    amount,
  };

  const startLen = appState.allRows.length;
  appState.allRows.push(row);
  renderTripDetail();

  try {
    const pr = await postRow(row);
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '已記錄還款');
  } catch (e) {
    undoOptimisticPush(row);
    renderTripDetail();
    toast(formatPostError(e));
  }
}

export async function recordSettlement() {
  const records = getDailyRecords();
  const balance = computeBalance(records);
  if (balance === 0) return;

  const debtor = balance > 0 ? USER_B : USER_A;
  const creditor = balance > 0 ? USER_A : USER_B;
  const amount = Math.round(Math.abs(balance));

  const ok = await showConfirm('記錄還款', `${debtor} 還給 ${creditor} NT$${amount}，記錄後餘額歸零。`);
  if (!ok) return;

  const row = { type: 'settlement', action: 'add', id: uid(), date: todayStr(), amount, paidBy: debtor };
  snapshotPendingHomeBalanceFromAbs();
  appState.allRows.push(row);
  renderHome();
  try {
    const pr = await postRow(row);
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '已記錄還款！');
  } catch (e) {
    undoOptimisticPush(row);
    cancelHomeBalanceAnim();
    renderHome();
    toast(formatPostError(e));
  }
}

export async function submitDailyRecord() {
  const item = document.getElementById('h-item').value.trim();
  const note = document.getElementById('h-note').value.trim();
  if (!item) {
    toast('請填寫消費項目');
    return;
  }

  let amount;
  let paidBy;
  let extraFields = {};
  if (appState.homeSplitMode === '兩人付') {
    const hu = parseFloat(document.getElementById('h-paidhu').value) || 0;
    const zhan = parseFloat(document.getElementById('h-paidzhan').value) || 0;
    if (hu + zhan <= 0) {
      toast('請輸入各自出的金額');
      return;
    }
    amount = hu + zhan;
    paidBy = '兩人';
    extraFields = { paidHu: hu, paidZhan: zhan };
  } else {
    amount = parseFloat(document.getElementById('h-amount').value);
    paidBy = appState.homePaidBy;
    if (!amount || amount <= 0) {
      toast('請輸入有效金額');
      return;
    }
  }

  const btn = document.getElementById('h-submit');
  btn.disabled = true;
  btn.textContent = '記帳中…';

  const row = {
    type: 'daily',
    action: 'add',
    id: uid(),
    date: todayStr(),
    item,
    amount,
    paidBy,
    splitMode: appState.homeSplitMode,
    note,
    ...extraFields,
  };
  snapshotPendingHomeBalanceFromAbs();
  appState.allRows.push(row);
  pauseSyncBriefly(5000);
  renderHome();

  try {
    const pr = await postRow(row);
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '已記帳！');
  } catch (e) {
    undoOptimisticPush(row);
    cancelHomeBalanceAnim();
    renderHome();
    toast(formatPostError(e));
  }

  document.getElementById('h-item').value = '';
  document.getElementById('h-amount').value = '';
  document.getElementById('h-paidhu').value = '';
  document.getElementById('h-paidzhan').value = '';
  document.getElementById('h-note').value = '';
  btn.disabled = false;
  btn.textContent = '記起來';
}

export async function voidDailyRecord(id) {
  const r = appState._dailyRecordsCache.find(x => x.id === id);
  if (!r) return;
  const label = r.type === 'settlement' ? '還款' : (r.item || '消費');
  const amount = parseFloat(r.amount) || 0;
  const ok = await showConfirm(
    '撤回這筆紀錄？',
    `「${label}」— NT$${Math.round(amount)} 將標記為撤回，帳面隨之更動，紀錄仍保留。`,
  );
  if (!ok) return;
  const row = { type: 'daily', action: 'void', id };
  snapshotPendingHomeBalanceFromAbs();
  appState.allRows.push(row);
  renderHome();
  try {
    const pr = await postRow(row);
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '已撤回');
  } catch (e) {
    undoOptimisticPush(row);
    cancelHomeBalanceAnim();
    renderHome();
    toast(formatPostError(e));
  }
}

