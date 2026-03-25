import { appState } from './state.js';
import { todayStr } from './time.js';
import { uid, toast, esc, jqAttr } from './utils.js';
import { postRow, formatPostError } from './api.js';
import { getDailyRecords, getTripById, getTripExpenses } from './data.js';
import { computeBalance } from './finance.js';
import { showConfirm } from './dialog.js';
import { guessCategoryFromItem } from './category.js';
import { navigate } from './navigation.js';
import { renderHome } from './views-home.js';
import { renderTrips } from './views-trips.js';
import {
  renderTripDetail,
  renderSplitChips,
  updatePerPerson,
  updateMultiPayTotal,
} from './views-trip-detail.js';
import { buildTripSettlementSummaryText } from './trip-stats.js';

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

export function toggleCollapsible(id, iconId) {
  const el = document.getElementById(id);
  const open = el.classList.toggle('open');
  document.getElementById(iconId).innerHTML = open
    ? '<path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>'
    : '<path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>';
}

// ── Trip detail form ─────────────────────────────────────────────────────────
export function toggleMultiPay() {
  appState.detailMultiPay = !appState.detailMultiPay;
  document.getElementById('d-paidby-group').style.display = appState.detailMultiPay ? 'none' : '';
  document.getElementById('d-amount-group').style.display = appState.detailMultiPay ? 'none' : '';
  document.getElementById('d-multipay-group').style.display = appState.detailMultiPay ? '' : 'none';
  document.getElementById('d-multipay-toggle').textContent = appState.detailMultiPay ? '單人付款' : '多人出款';
  if (appState.detailMultiPay) {
    document.getElementById('d-payers-list').innerHTML = '';
    const trip = getTripById(appState.currentTripId);
    const members = trip ? trip.members : [];
    addPayerRow(members);
    addPayerRow(members);
  }
  updatePerPerson();
}

export function addPayerRow(membersOverride) {
  const trip = getTripById(appState.currentTripId);
  const members = membersOverride || (trip ? trip.members : []);
  const list = document.getElementById('d-payers-list');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;align-items:center';
  row.innerHTML = `
    <select class="form-select payer-name" style="flex:1" onchange="updateMultiPayTotal()">
      ${members.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
    </select>
    <input type="number" class="form-input payer-amount" placeholder="金額" min="0" step="1"
      style="flex:1" oninput="updateMultiPayTotal()">
    <button type="button" onclick="this.parentNode.remove();updateMultiPayTotal()"
      style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;padding:0 4px">×</button>`;
  list.appendChild(row);
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

// ── Daily actions ────────────────────────────────────────────────────────────
export async function recordSettlement() {
  const records = getDailyRecords();
  const balance = computeBalance(records);
  if (balance === 0) return;

  const debtor = balance > 0 ? '詹' : '胡';
  const creditor = balance > 0 ? '胡' : '詹';
  const amount = Math.round(Math.abs(balance));

  const ok = await showConfirm('記錄還款', `${debtor} 還給 ${creditor} NT$${amount}，記錄後餘額歸零。`);
  if (!ok) return;

  const row = { type: 'settlement', action: 'add', id: uid(), date: todayStr(), amount, paidBy: debtor };
  appState.allRows.push(row);
  renderHome();
  try {
    await postRow(row);
    toast('已記錄還款！');
  } catch (e) {
    appState.allRows.pop();
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
  appState.allRows.push(row);
  renderHome();

  try {
    await postRow(row);
    toast('已記帳！');
  } catch (e) {
    appState.allRows.pop();
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
  appState.allRows.push(row);
  renderHome();
  try {
    await postRow(row);
    toast('已撤回');
  } catch (e) {
    appState.allRows.pop();
    renderHome();
    toast(formatPostError(e));
  }
}

// ── Trips ────────────────────────────────────────────────────────────────────
export function showCreateTripForm() {
  appState.newTripMembers = [];
  document.getElementById('new-trip-name').value = '';
  document.getElementById('new-member-input').value = '';
  renderNewTripMemberChips();
  document.getElementById('create-trip-card').style.display = '';
  document.getElementById('new-trip-name').focus();
}

export function hideCreateTripForm() {
  document.getElementById('create-trip-card').style.display = 'none';
  appState.newTripMembers = [];
}

export function addNewTripMember() {
  const input = document.getElementById('new-member-input');
  const name = input.value.trim();
  if (!name) return;
  if (appState.newTripMembers.includes(name)) {
    toast(`「${name}」已在名單中`);
    return;
  }
  appState.newTripMembers.push(name);
  input.value = '';
  input.focus();
  renderNewTripMemberChips();
}

export function removeNewTripMember(name) {
  appState.newTripMembers = appState.newTripMembers.filter(m => m !== name);
  renderNewTripMemberChips();
}

function renderNewTripMemberChips() {
  document.getElementById('new-trip-member-chips').innerHTML = appState.newTripMembers
    .map(
      m => `<span class="member-chip">${esc(m)}
      <button class="member-chip-remove" onclick="removeNewTripMember(${jqAttr(m)})">
        <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    </span>`,
    )
    .join('');
}

export async function createTrip() {
  const name = document.getElementById('new-trip-name').value.trim();
  if (!name) {
    toast('請填寫行程名稱');
    return;
  }
  if (appState.newTripMembers.length < 2) {
    toast('至少需要兩位成員');
    return;
  }

  const btn = document.getElementById('create-trip-btn');
  btn.disabled = true;
  btn.textContent = '建立中…';

  const row = {
    type: 'trip',
    action: 'add',
    id: uid(),
    name,
    members: JSON.stringify(appState.newTripMembers),
    createdAt: todayStr(),
  };
  appState.allRows.push(row);
  hideCreateTripForm();
  navigate('tripDetail', row.id);

  try {
    await postRow(row);
    toast(`「${name}」行程已建立`);
  } catch (e) {
    appState.allRows.pop();
    toast(formatPostError(e));
  }

  btn.disabled = false;
  btn.textContent = '建立行程';
}

export async function deleteTripAction(id) {
  const trip = getTripById(id);
  if (!trip) return;
  const ok = await showConfirm(`刪除行程「${trip.name}」？`, '這個動作無法還原，所有消費紀錄也會一併刪除。');
  if (!ok) return;
  const row = { type: 'trip', action: 'delete', id };
  appState.allRows.push(row);
  renderTrips();
  try {
    await postRow(row);
    toast('行程已刪除');
  } catch (e) {
    appState.allRows.pop();
    renderTrips();
    toast(formatPostError(e));
  }
}

export async function closeTripAction(id) {
  const trip = getTripById(id);
  if (!trip) return;
  const ok = await showConfirm(`結束行程「${trip.name}」？`, '結束後將無法新增消費，可隨時重新開啟。');
  if (!ok) return;
  const row = { type: 'trip', action: 'close', id };
  appState.allRows.push(row);
  renderTripDetail();
  try {
    await postRow(row);
    toast('行程已結束');
  } catch (e) {
    appState.allRows.pop();
    renderTripDetail();
    toast(formatPostError(e));
  }
}

export async function reopenTripAction(id) {
  const trip = getTripById(id);
  if (!trip) return;
  const row = { type: 'trip', action: 'reopen', id };
  appState.allRows.push(row);
  renderTripDetail();
  try {
    await postRow(row);
    toast(`「${trip.name}」已重新開啟`);
  } catch (e) {
    appState.allRows.pop();
    renderTripDetail();
    toast(formatPostError(e));
  }
}

// ── Trip members ─────────────────────────────────────────────────────────────
export async function addDetailMember() {
  const input = document.getElementById('detail-new-member');
  const name = input.value.trim();
  if (!name) return;
  const trip = getTripById(appState.currentTripId);
  if (!trip) return;
  if (trip.members.includes(name)) {
    toast(`「${name}」已在名單中`);
    return;
  }
  const row = { type: 'tripMember', action: 'add', tripId: appState.currentTripId, memberName: name };
  appState.allRows.push(row);
  input.value = '';
  renderTripDetail();
  try {
    await postRow(row);
  } catch (e) {
    appState.allRows.pop();
    renderTripDetail();
    toast(formatPostError(e));
  }
}

export async function removeMemberAction(name) {
  const trip = getTripById(appState.currentTripId);
  if (!trip || trip.members.length <= 2) return;
  const ok = await showConfirm(`移除成員「${name}」？`, '相關的消費紀錄不會被刪除，但該成員將從行程中移除。');
  if (!ok) return;
  const row = { type: 'tripMember', action: 'remove', tripId: appState.currentTripId, memberName: name };
  appState.allRows.push(row);
  appState.detailSplitAmong = appState.detailSplitAmong.filter(m => m !== name);
  renderTripDetail();
  try {
    await postRow(row);
  } catch (e) {
    appState.allRows.pop();
    renderTripDetail();
    toast(formatPostError(e));
  }
}

// ── Trip expenses ────────────────────────────────────────────────────────────
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

  let amount;
  let paidBy;
  let extraFields = {};
  if (appState.detailMultiPay) {
    const nameEls = document.querySelectorAll('#d-payers-list .payer-name');
    const amountEls = document.querySelectorAll('#d-payers-list .payer-amount');
    const payers = Array.from(nameEls)
      .map((sel, i) => ({
        name: sel.value,
        amount: parseFloat(amountEls[i].value) || 0,
      }))
      .filter(p => p.amount > 0);
    if (payers.length === 0) {
      toast('請輸入各自出的金額');
      return;
    }
    amount = payers.reduce((s, p) => s + p.amount, 0);
    paidBy = '多人';
    extraFields = { payers };
  } else {
    amount = parseFloat(document.getElementById('d-amount').value);
    paidBy = document.getElementById('d-paidby').value;
    if (!amount || amount <= 0) {
      toast('請輸入有效金額');
      return;
    }
    if (!paidBy) {
      toast('請選擇付款人');
      return;
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
    ...extraFields,
  };
  appState.allRows.push(row);
  renderTripDetail();

  try {
    await postRow(row);
    toast('已記帳！');
  } catch (e) {
    appState.allRows.pop();
    renderTripDetail();
    toast(formatPostError(e));
  }

  document.getElementById('d-item').value = '';
  document.getElementById('d-amount').value = '';
  document.getElementById('d-note').value = '';
  if (appState.detailMultiPay) {
    document.querySelectorAll('#d-payers-list .payer-amount').forEach(el => {
      el.value = '';
    });
  }
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
    `「${item}」— NT$${Math.round(amount)} 將標記為撤回，分帳隨之更動，紀錄仍保留。`,
  );
  if (!ok) return;
  const row = { type: 'tripExpense', action: 'void', id };
  appState.allRows.push(row);
  renderTripDetail();
  try {
    await postRow(row);
    toast('已撤回');
  } catch (e) {
    appState.allRows.pop();
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

// ── Edit dialog ──────────────────────────────────────────────────────────────
export function openEditRecord(r) {
  if (r._voided) return;
  appState._editRecord = r;
  document.getElementById('edit-date').value = r.date || todayStr();
  document.getElementById('edit-note').value = r.note || '';
  document.getElementById('edit-category').value = r.category || guessCategoryFromItem(r.item) || '';
  document.getElementById('edit-overlay').classList.add('open');
}

export function openEditRecordById(id, isTripExpense) {
  const r = isTripExpense
    ? appState._tripExpenseCache.find(x => x.id === id)
    : appState._dailyRecordsCache.find(x => x.id === id);
  if (!r) return;
  openEditRecord(r);
}

export function closeEditRecord() {
  document.getElementById('edit-overlay').classList.remove('open');
  appState._editRecord = null;
}

export async function submitEditRecord() {
  if (!appState._editRecord) return;
  const date = document.getElementById('edit-date').value;
  const note = document.getElementById('edit-note').value.trim();
  if (!date) {
    toast('請選擇日期');
    return;
  }

  const isTrip = appState._editRecord.type === 'tripExpense';
  const doRender = () => (isTrip ? renderTripDetail() : renderHome());

  const category = document.getElementById('edit-category').value;
  const row = {
    type: appState._editRecord.type,
    action: 'edit',
    id: appState._editRecord.id,
    date,
    note,
    category,
  };
  appState.allRows.push(row);
  doRender();
  closeEditRecord();
  try {
    await postRow(row);
    toast('已更新');
  } catch (e) {
    appState.allRows.pop();
    doRender();
    toast(formatPostError(e));
  }
}

export { exportBackupCSV, copyBackupText } from './backup.js';
export { updateMultiPayTotal, updatePerPerson };
