import { USER_A, USER_B } from './config.js';
import { appState } from './state.js';
import { todayStr } from './time.js';
import { uid, toast, esc, jqAttr } from './utils.js';
import { postRow, formatPostError } from './api.js';
import { getDailyRecords, getTripById, getTripExpenses, getTripSettlementAdjustmentsFromRows, getKnownMemberNames, getAvatarUrlByMemberName, getMemberColor } from './data.js';
import { computeBalance, computeSettlements } from './finance.js';
import { showConfirm } from './dialog.js';
import { guessCategoryFromItem } from './category.js';
import { navigate } from './navigation.js';
import { pauseSyncBriefly } from './sync-pause.js';
import { renderHome, cancelHomeBalanceAnim } from './views-home.js';
import { renderTrips } from './views-trips.js';
import {
  renderTripDetail,
  renderSplitChips,
  updatePerPerson,
  updateMultiPayTotal,
} from './views-trip-detail.js';
import { buildTripSettlementSummaryText } from './trip-stats.js';

/** Safely remove an optimistic row by object reference (handles concurrent ops). */
function undoOptimisticPush(row) {
  const idx = appState.allRows.lastIndexOf(row);
  if (idx !== -1) appState.allRows.splice(idx, 1);
}

function snapshotPendingHomeBalanceFromAbs() {
  const b = computeBalance(getDailyRecords());
  appState.pendingHomeBalanceFromAbs = b === 0 ? 0 : Math.round(Math.abs(b));
}

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
  if (!el) return;
  const open = el.classList.toggle('is-open');
  const icon = document.getElementById(iconId);
  if (icon) {
    icon.innerHTML = open
      ? '<path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>'
      : '<path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>';
  }
}

// ── Trip detail form ─────────────────────────────────────────────────────────
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
  appState.detailMultiPay = next;
  document.getElementById('d-paidby-group').style.display = appState.detailMultiPay ? 'none' : '';
  document.getElementById('d-amount-group').style.display = appState.detailMultiPay ? 'none' : '';
  document.getElementById('d-multipay-group').style.display = appState.detailMultiPay ? '' : 'none';
  if (mtog) mtog.textContent = appState.detailMultiPay ? '單人付款' : '多人出款';
  if (appState.detailMultiPay) {
    document.getElementById('d-payers-list').innerHTML = '';
    addPayerRow(members);
    addPayerRow(members);
    refreshPayerToggleDisabledState();
  } else {
    refreshPayerToggleDisabledState();
  }
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
    mtog.textContent = '多人出款';
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
  const da = document.getElementById('d-amount');
  if (da && amt > 0) da.value = String(Math.round(amt));

  renderTripDetail();
}

export function removePayerRow(btn) {
  const row = btn && btn.closest('.payer-row');
  if (row) row.remove();
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
      <input type="text" class="form-input form-input-amount payer-amount" placeholder="金額"
        lang="en" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off"
        inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" aria-label="付款金額"
        oninput="updateMultiPayTotal()">
      <button type="button" class="payer-row-remove" onclick="removePayerRow(this)" aria-label="刪除此列">×</button>
    </div>`;
  list.appendChild(row);
  refreshPayerToggleDisabledState();
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

// ── Trips ────────────────────────────────────────────────────────────────────
export function showCreateTripForm() {
  appState.newTripMembers = [];
  document.getElementById('new-trip-name').value = '';
  document.getElementById('new-member-input').value = '';
  renderNewTripMemberChips();
  renderKnownMemberPicker();
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
  renderKnownMemberPicker();
}

export function removeNewTripMember(name) {
  appState.newTripMembers = appState.newTripMembers.filter(m => m !== name);
  renderNewTripMemberChips();
  renderKnownMemberPicker();
}

function renderNewTripMemberChips() {
  document.getElementById('new-trip-member-chips').innerHTML = appState.newTripMembers
    .map(m => {
      const avatarUrl = getAvatarUrlByMemberName(m);
      const color = getMemberColor(m);
      const avatarHtml = avatarUrl
        ? `<img class="member-chip-avatar" src="${avatarUrl}" alt="${esc(m)} 頭像">`
        : `<span class="member-chip-avatar member-chip-avatar--fallback" style="background:${color.bg};color:${color.fg}" aria-hidden="true">${esc(m.charAt(0))}</span>`;
      return `<span class="member-chip">
        ${avatarHtml}
        <span class="member-chip-name">${esc(m)}</span>
        <button class="member-chip-remove" onclick="removeNewTripMember(${jqAttr(m)})">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </span>`;
    })
    .join('');
}

function renderKnownMemberPicker() {
  const el = document.getElementById('known-member-picker');
  if (!el) return;
  const known = getKnownMemberNames();
  const available = known.filter(n => !appState.newTripMembers.includes(n));
  if (available.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="known-member-bar">
    <span class="known-member-bar-label">快速加入</span>
    ${available.map(n => {
      const c = getMemberColor(n);
      return `<button type="button" class="known-member-bar-btn" onclick="pickKnownMemberForTrip(${jqAttr(n)})">
        <span class="known-member-bar-dot" style="background:${c.fg}">${esc(n.charAt(0))}</span>${esc(n)}
      </button>`;
    }).join('')}
  </div>`;
}

export function pickKnownMemberForTrip(name) {
  if (!name || appState.newTripMembers.includes(name)) return;
  appState.newTripMembers.push(name);
  renderNewTripMemberChips();
  renderKnownMemberPicker();
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
  pauseSyncBriefly(5000);
  navigate('tripDetail', row.id);

  try {
    const pr = await postRow(row);
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : `「${name}」行程已建立`);
  } catch (e) {
    undoOptimisticPush(row);
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
    const pr = await postRow(row);
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '行程已刪除');
  } catch (e) {
    undoOptimisticPush(row);
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
    const pr = await postRow(row);
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '行程已結束');
  } catch (e) {
    undoOptimisticPush(row);
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
    const pr = await postRow(row);
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : `「${trip.name}」已重新開啟`);
  } catch (e) {
    undoOptimisticPush(row);
    renderTripDetail();
    toast(formatPostError(e));
  }
}

// ── Member directory ─────────────────────────────────────────────────────────
export function toggleMemberDirectory() {
  const panel = document.getElementById('member-dir-panel');
  const overlay = document.getElementById('member-dir-overlay');
  const isOpen = panel.classList.contains('is-open');
  if (isOpen) { closeMemberDirectory(); return; }
  renderMemberDirectory();
  overlay.classList.add('is-open');
  panel.classList.add('is-open');
}

export function closeMemberDirectory() {
  document.getElementById('member-dir-panel').classList.remove('is-open');
  document.getElementById('member-dir-overlay').classList.remove('is-open');
}

function renderMemberDirectory() {
  const body = document.getElementById('member-dir-body');
  const members = getKnownMemberNames();
  if (members.length === 0) {
    body.innerHTML = '<div class="member-dir-empty">尚無成員紀錄</div>';
    return;
  }
  body.innerHTML = members.map(name => {
    const url = getAvatarUrlByMemberName(name);
    const color = getMemberColor(name);
    const avatarHtml = url
      ? `<img class="member-dir-avatar-img" src="${url}" alt="${esc(name)}">`
      : `<span class="member-dir-avatar-fallback" style="background:${color.bg};color:${color.fg}">${esc(name.charAt(0))}</span>`;
    return `<div class="member-dir-item" data-member="${esc(name)}">
      <button type="button" class="member-dir-avatar" onclick="openAvatarPickerForMember(${jqAttr(name)})" title="更換頭像" style="background:${color.bg}">
        ${avatarHtml}
        <span class="member-dir-avatar-edit">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 7l1-2h4l1 2h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3zm3 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/></svg>
        </span>
      </button>
      <div class="member-dir-name">${esc(name)}</div>
      <div class="member-dir-actions">
        <button type="button" class="member-dir-action-btn" onclick="renameMemberPrompt(${jqAttr(name)})" title="改名">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button type="button" class="member-dir-action-btn member-dir-action-btn--danger" onclick="deleteKnownMember(${jqAttr(name)})" title="刪除">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

export function toggleTripColorPicker(tripId) {
  const el = document.getElementById('tcp-' + tripId);
  if (!el) return;
  const wasOpen = el.style.display !== 'none';
  document.querySelectorAll('.trip-color-picker').forEach(p => { p.style.display = 'none'; });
  if (!wasOpen) el.style.display = '';
}

export async function setTripColor(tripId, colorId) {
  const row = { type: 'trip', action: 'setColor', id: tripId, colorId };
  appState.allRows.push(row);
  renderTrips();
  try {
    const pr = await postRow(row);
    if (pr.status === 'queued') toast('已暫存，連上網路後會自動上傳');
  } catch (e) {
    undoOptimisticPush(row);
    renderTrips();
    toast(formatPostError(e));
  }
}

export async function renameMemberPrompt(oldName) {
  const newName = prompt(`將「${oldName}」改名為：`, oldName);
  if (!newName || newName.trim() === '' || newName.trim() === oldName) return;
  const trimmed = newName.trim();
  const existing = getKnownMemberNames();
  if (existing.includes(trimmed)) { toast(`「${trimmed}」已存在`); return; }
  const row = { type: 'memberProfile', action: 'rename', memberName: oldName, newName: trimmed };
  appState.allRows.push(row);
  renderMemberDirectory();
  refreshCurrentView();
  try {
    const pr = await postRow(row);
    if (pr.status === 'queued') toast('已暫存，連上網路後會自動上傳');
  } catch (e) {
    undoOptimisticPush(row);
    renderMemberDirectory();
    refreshCurrentView();
    toast(formatPostError(e));
  }
}

export async function deleteKnownMember(name) {
  if (!name) return;
  const ok = await showConfirm(`刪除成員「${name}」？`, '該成員將從選單中移除，但已參與的行程紀錄不受影響。');
  if (!ok) return;
  const row = { type: 'memberProfile', action: 'delete', memberName: name };
  appState.allRows.push(row);
  renderMemberDirectory();
  renderKnownMemberPicker();
  refreshCurrentView();
  try {
    const pr = await postRow(row);
    if (pr.status === 'queued') toast('已暫存，連上網路後會自動上傳');
  } catch (e) {
    undoOptimisticPush(row);
    renderMemberDirectory();
    renderKnownMemberPicker();
    refreshCurrentView();
    toast(formatPostError(e));
  }
}

function refreshCurrentView() {
  if (appState.currentPage === 'tripDetail') renderTripDetail();
  else if (appState.currentPage === 'trips') renderTrips();
}

// ── Trip members ─────────────────────────────────────────────────────────────
export async function addDetailMemberByName(name) {
  if (!name) return;
  const trip = getTripById(appState.currentTripId);
  if (!trip) return;
  if (trip.members.includes(name)) { toast(`「${name}」已在名單中`); return; }
  const row = { type: 'tripMember', action: 'add', tripId: appState.currentTripId, memberName: name };
  appState.allRows.push(row);
  renderTripDetail();
  try {
    const pr = await postRow(row);
    if (pr.status === 'queued') toast('已暫存，連上網路後會自動上傳');
  } catch (e) {
    undoOptimisticPush(row);
    renderTripDetail();
    toast(formatPostError(e));
  }
}

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
    const pr = await postRow(row);
    if (pr.status === 'queued') toast('已暫存，連上網路後會自動上傳');
  } catch (e) {
    undoOptimisticPush(row);
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
    const pr = await postRow(row);
    if (pr.status === 'queued') toast('已暫存，連上網路後會自動上傳');
  } catch (e) {
    undoOptimisticPush(row);
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
    const collectPayers = () =>
      Array.from(nameEls)
        .map((sel, i) => ({
          name: (sel.value || '').trim(),
          amount: parseFloat(amountEls[i]?.value) || 0,
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
    paidBy = '';
    extraFields = { payers };
  } else {
    amount = parseFloat(document.getElementById('d-amount').value);
    paidBy = appState.detailPaidBy;
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
  pauseSyncBriefly(5000);
  renderTripDetail();

  try {
    const pr = await postRow(row);
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '已記帳！');
  } catch (e) {
    undoOptimisticPush(row);
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
    const pr = await postRow(row);
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '已撤回');
  } catch (e) {
    undoOptimisticPush(row);
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
const EDIT_PHOTO_STORAGE_KEY_PREFIX = 'ledger_edit_photo_v1';

let editPhotoPendingChange = null;
/**
 * @typedef {{ kind: 'replace'; dataUrl: string } | { kind: 'remove' }} EditPhotoPendingChange
 */

function editPhotoStorageKey(type, id) {
  return `${EDIT_PHOTO_STORAGE_KEY_PREFIX}:${String(type || '')}:${String(id || '')}`;
}

function readEditPhotoDataUrl(type, id) {
  try {
    const k = editPhotoStorageKey(type, id);
    return localStorage.getItem(k) || null;
  } catch {
    return null;
  }
}

function writeEditPhotoDataUrl(type, id, dataUrl) {
  const k = editPhotoStorageKey(type, id);
  localStorage.setItem(k, dataUrl);
}

function removeEditPhotoDataUrl(type, id) {
  const k = editPhotoStorageKey(type, id);
  localStorage.removeItem(k);
}

function setEditPhotoPreview(dataUrl) {
  const img = document.getElementById('edit-photo-preview');
  const removeBtn = document.getElementById('edit-photo-remove-btn');
  const inp = document.getElementById('edit-photo-input');

  if (!img || !removeBtn || !inp) return;

  if (!dataUrl) {
    img.src = '';
    img.classList.add('hidden');
    removeBtn.style.display = 'none';
    return;
  }

  img.src = dataUrl;
  img.classList.remove('hidden');
  removeBtn.style.display = '';
}

async function fileToJpegDataUrl(file, { maxDim = 1024, quality = 0.78 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image load failed'));
      img.src = url;
    });

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('bad image dimensions');

    const scale = Math.min(1, maxDim / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unsupported');
    ctx.drawImage(img, 0, 0, outW, outH);

    // Use JPEG to reduce localStorage size vs raw PNG.
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ensureEditSheetDragToDismiss() {
  const overlay = document.getElementById('edit-overlay');
  if (!overlay || overlay._dragDismissBound) return;
  const dialog = overlay.querySelector('.edit-dialog');
  const header = overlay.querySelector('.edit-dialog-header');
  if (!dialog || !header) return;

  overlay._dragDismissBound = true;

  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let dragging = false;

  const reset = () => {
    overlay.classList.remove('sheet-dragging');
    dialog.style.transition = '';
    dialog.style.transform = '';
    dragging = false;
  };

  header.addEventListener(
    'touchstart',
    e => {
      if (!overlay.classList.contains('open')) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startY = t.clientY;
      lastY = startY;
      lastT = Date.now();
      dragging = true;
      overlay.classList.add('sheet-dragging');
      dialog.style.transition = 'none';
    },
    { passive: true },
  );

  header.addEventListener(
    'touchmove',
    e => {
      if (!dragging) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const y = t.clientY;
      const dy = Math.max(0, y - startY);
      lastY = y;
      lastT = Date.now();

      // Move sheet down
      dialog.style.transform = `translateY(${dy}px)`;
    },
    { passive: true },
  );

  header.addEventListener(
    'touchend',
    () => {
      if (!dragging) return;
      const dy = Math.max(0, lastY - startY);
      const dt = Math.max(1, Date.now() - lastT);
      const v = dy / dt; // px/ms rough

      const shouldClose = dy > 120 || v > 1.2;
      if (shouldClose) {
        reset();
        closeEditRecord();
        return;
      }

      // Snap back
      dialog.style.transition = 'transform 0.22s var(--ease-soft)';
      dialog.style.transform = 'translateY(0)';
      setTimeout(reset, 240);
    },
    { passive: true },
  );

  header.addEventListener(
    'touchcancel',
    () => {
      if (!dragging) return;
      dialog.style.transition = 'transform 0.22s var(--ease-soft)';
      dialog.style.transform = 'translateY(0)';
      setTimeout(reset, 240);
    },
    { passive: true },
  );
}

export function openEditRecord(r) {
  if (r._voided) return;
  appState._editRecord = r;
  editPhotoPendingChange = null;

  ensureEditSheetDragToDismiss();

  const voidBtn = document.getElementById('edit-void-btn');
  if (voidBtn) {
    const canVoid = r && (r.type === 'daily' || r.type === 'settlement' || r.type === 'tripExpense') && r.id;
    voidBtn.style.display = canVoid ? '' : 'none';
    voidBtn.disabled = !canVoid;
  }

  const summary = document.getElementById('edit-summary');
  if (summary) {
    const amt = parseFloat(r.amount) || 0;
    let payLine = '';
    if (r.type === 'tripExpense' && Array.isArray(r.payers) && r.payers.length) {
      const parts = r.payers
        .filter(p => p && String(p.name || '').trim() && (parseFloat(p.amount) || 0) > 0)
        .map(p => `${esc(String(p.name).trim())} NT$${Math.round(parseFloat(p.amount) || 0)}`);
      if (parts.length) payLine = parts.join(' ＋ ');
    }
    if (!payLine && r.paidBy) payLine = `${esc(String(r.paidBy))}付`;

    let splitHtml = '';
    if (r.type === 'tripExpense' && Array.isArray(r.splitAmong) && r.splitAmong.length > 0) {
      const n = r.splitAmong.length;
      const per = Math.round(amt / n);
      const names = r.splitAmong.map(m => esc(String(m))).join('、');
      const trip = r.tripId ? getTripById(r.tripId) : null;
      const tm = trip?.members?.length ?? 0;
      const fullTrip = tm > 0 && n === tm;
      splitHtml = `<div class="edit-summary-split" role="group" aria-label="分攤說明">
        <div class="edit-summary-split-row"><span class="edit-summary-split-k">分攤對象</span><span class="edit-summary-split-v">${names}${fullTrip ? ` <span class="edit-summary-split-tag">全員均分</span>` : ''}</span></div>
        <div class="edit-summary-split-row"><span class="edit-summary-split-k">每人負擔</span><span class="edit-summary-split-v">NT$${per.toLocaleString()}</span></div>
      </div>`;
    }

    summary.innerHTML = `<div class="edit-summary-item">${esc(r.item || '—')}</div>`
      + `<div class="edit-summary-meta">${esc(r.date || '')}${payLine ? ' · ' + payLine : ''}${amt ? ' · NT$' + Math.round(amt) : ''}</div>`
      + splitHtml;
  }

  document.getElementById('edit-date').value = r.date || todayStr();
  document.getElementById('edit-note').value = r.note || '';
  document.getElementById('edit-category').value = r.category || guessCategoryFromItem(r.item) || '';

  const inp = document.getElementById('edit-photo-input');
  if (inp) inp.value = '';
  setEditPhotoPreview(r.photoUrl || null);

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
  const overlay = document.getElementById('edit-overlay');
  if (!overlay) return;
  if (!overlay.classList.contains('open')) return;
  if (overlay._closingTimer) clearTimeout(overlay._closingTimer);
  overlay.classList.add('closing');
  overlay._closingTimer = setTimeout(() => {
    overlay.classList.remove('open');
    overlay.classList.remove('closing');
    overlay._closingTimer = null;
  }, 180);
  appState._editRecord = null;
  editPhotoPendingChange = null;

  // Clear preview UI; next openEditRecord will reload stored photo.
  setEditPhotoPreview(null);
}

export async function voidEditingRecord() {
  const r = appState._editRecord;
  if (!r || !r.id || r._voided) return;
  const isTrip = r.type === 'tripExpense';
  const label = r.type === 'settlement' ? '還款' : (r.item || '消費');
  const amount = parseFloat(r.amount) || 0;
  const ok = await showConfirm(
    '撤回這筆紀錄？',
    `「${label}」— NT$${Math.round(amount)} 將標記為撤回，${isTrip ? '分帳' : '帳面'}隨之更動，紀錄仍保留。`,
  );
  if (!ok) return;

  closeEditRecord();

  const row = isTrip
    ? { type: 'tripExpense', action: 'void', id: r.id }
    : { type: 'daily', action: 'void', id: r.id };
  if (!isTrip) snapshotPendingHomeBalanceFromAbs();
  appState.allRows.push(row);
  if (isTrip) renderTripDetail();
  else renderHome();
  try {
    const pr = await postRow(row);
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '已撤回');
  } catch (e) {
    undoOptimisticPush(row);
    if (!isTrip) cancelHomeBalanceAnim();
    if (isTrip) renderTripDetail();
    else renderHome();
    toast(formatPostError(e));
  }
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
  // Persist photo change via GAS: photoDataUrl -> photoUrl/photoFileId.
  // - replace: photoDataUrl = base64
  // - remove: photoDataUrl = '' (GAS 會把 photoUrl/photoFileId 清空)
  let photoDataUrlToSend;
  let photoUrlToSet;
  if (editPhotoPendingChange && appState._editRecord.id) {
    if (editPhotoPendingChange.kind === 'remove') {
      photoDataUrlToSend = '';
      photoUrlToSet = '';
    } else {
      photoDataUrlToSend = editPhotoPendingChange.dataUrl;
      // Optimistic UI: use local dataUrl as photoUrl until sync replaces with Drive url.
      photoUrlToSet = editPhotoPendingChange.dataUrl;
    }
  }

  const hasPhoto = photoDataUrlToSend !== undefined;
  if (hasPhoto && typeof navigator !== 'undefined' && navigator.onLine === false) {
    toast('離線狀態無法上傳照片，請連上網路後再試');
    return;
  }
  const optimisticRow = {
    type: appState._editRecord.type,
    action: 'edit',
    id: appState._editRecord.id,
    date,
    note,
    category,
    ...(hasPhoto ? { photoUrl: photoUrlToSet, photoFileId: '' } : {}),
  };
  const postPayload = {
    type: appState._editRecord.type,
    action: 'edit',
    id: appState._editRecord.id,
    date,
    note,
    category,
    ...(hasPhoto ? { photoDataUrl: photoDataUrlToSend, photoFileId: '' } : {}),
  };
  appState.allRows.push(optimisticRow);
  doRender();
  closeEditRecord();
  try {
    // 圖片不上離線佇列：避免 localStorage 容量問題 & 離線顯示不一致
    const pr = await postRow(postPayload, { syncTarget: optimisticRow, allowQueue: !hasPhoto });
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '已更新');
  } catch (e) {
    undoOptimisticPush(optimisticRow);
    doRender();
    toast(formatPostError(e));
  }
}

export function openEditPhotoPicker() {
  const inp = document.getElementById('edit-photo-input');
  if (!inp) return;
  // Prefer file picker / camera on supported mobile browsers.
  inp.click();
}

export async function handleEditPhotoSelected(ev) {
  const rec = appState._editRecord;
  if (!rec || !rec.id) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    toast('離線狀態無法上傳照片，請連上網路後再試');
    return;
  }
  const inp = ev && ev.target;
  const file = inp && inp.files && inp.files[0];
  if (!file) return;

  if (!String(file.type || '').startsWith('image/')) {
    toast('請選擇圖片檔');
    return;
  }
  // Prevent extreme files from freezing the tab.
  if (file.size > 8_000_000) {
    toast('圖片檔案過大，請改選較小的照片');
    return;
  }

  try {
    const dataUrl = await fileToJpegDataUrl(file);
    editPhotoPendingChange = { kind: 'replace', dataUrl };
    setEditPhotoPreview(dataUrl);
  } catch {
    toast('照片讀取失敗，請再試一次');
  }
}

export function removeEditPhoto() {
  const rec = appState._editRecord;
  if (!rec || !rec.id) return;
  editPhotoPendingChange = { kind: 'remove' };
  setEditPhotoPreview(null);

  const inp = document.getElementById('edit-photo-input');
  if (inp) inp.value = '';
}

// ── Avatar uploader (global, per memberName) ──────────────────────────────
let avatarUploadMemberName = null;

export function openAvatarPickerForMember(memberName) {
  avatarUploadMemberName = memberName;
  const inp = document.getElementById('avatar-upload-input');
  if (!inp) return;
  inp.value = '';
  inp.click();
}

export function setApiUrl(url) {
  const u = String(url || '').trim();
  if (!u) {
    toast('請輸入 GAS Web App URL');
    return;
  }
  try {
    localStorage.setItem('ledger_api_url_v1', u);
  } catch {
    toast('無法儲存 API URL（可能無法使用 localStorage）');
    return;
  }
  toast('已更新 API URL，重新整理中…');
  setTimeout(() => location.reload(), 300);
}

export async function handleAvatarSelected(ev) {
  const memberName = avatarUploadMemberName;
  avatarUploadMemberName = null;

  const inp = ev && ev.target;
  const file = inp && inp.files && inp.files[0];
  if (!memberName || !file) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    toast('離線狀態無法上傳頭像，請連上網路後再試');
    return;
  }

  if (!String(file.type || '').startsWith('image/')) {
    toast('請選擇圖片檔');
    return;
  }
  // Avatar 用小一點，避免上傳/解碼太重。
  if (file.size > 8_000_000) {
    toast('圖片檔案過大，請改選較小的照片');
    return;
  }

  let dataUrl;
  try {
    dataUrl = await fileToJpegDataUrl(file, { maxDim: 256, quality: 0.78 });
  } catch {
    toast('照片讀取失敗，請再試一次');
    return;
  }

  // Optimistic: 立刻在 UI 顯示，之後下一次同步會用 Drive URL 覆蓋。
  const optimisticRow = {
    type: 'avatar',
    action: 'set',
    id: uid(),
    memberName,
    avatarUrl: dataUrl,
  };
  appState.allRows.push(optimisticRow);
  if (appState.currentPage === 'home') renderHome();
  else if (appState.currentTripId) renderTripDetail();
  if (document.getElementById('member-dir-panel')?.classList.contains('is-open')) renderMemberDirectory();

  try {
    const pr = await postRow(
      {
        type: 'avatar',
        action: 'set',
        id: optimisticRow.id,
        memberName,
        avatarDataUrl: dataUrl,
      },
      // 圖片不上離線佇列：避免 localStorage 容量問題 & 離線顯示不一致
      { syncTarget: optimisticRow, allowQueue: false },
    );
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '頭像已更新');
  } catch (e) {
    undoOptimisticPush(optimisticRow);
    if (appState.currentPage === 'home') renderHome();
    else if (appState.currentTripId) renderTripDetail();
    if (document.getElementById('member-dir-panel')?.classList.contains('is-open')) renderMemberDirectory();
    toast(formatPostError(e));
  }
}

export { exportBackupCSV, copyBackupText, exportTechnicalCSV } from './backup.js';
export { updateMultiPayTotal, updatePerPerson } from './views-trip-detail.js';

export function openBackupMenu() {
  document.getElementById('backup-overlay')?.classList.add('open');
}

export function closeBackupMenu() {
  document.getElementById('backup-overlay')?.classList.remove('open');
}
