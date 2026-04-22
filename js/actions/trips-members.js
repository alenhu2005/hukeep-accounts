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
      const rare = isHiddenMemberColorId(color.id);
      const sk = rare ? getHiddenMemberStyleKey(color.id) : '';
      const styleCls = sk ? ` member-rare--${sk}` : '';
      const avCls = rare ? ` member-chip-avatar--rare${styleCls}` : '';
      const toneCls = memberToneClass(rare);
      const tv = memberToneVars(color, rare);
      const chipStyle = tv ? ` style="${tv}"` : '';
      const fbStyle = tv
        ? `background:${color.bg};color:${color.fg};${tv}`
        : `background:${color.bg};color:${color.fg}`;
      const avatarHtml = avatarUrl
        ? `<img class="member-chip-avatar${avCls}${toneCls}" src="${avatarUrl}" alt="${esc(m)} 頭像"${tv ? ` style="${tv}"` : ''}>`
        : `<span class="member-chip-avatar member-chip-avatar--fallback${rare ? ` member-chip-avatar-fallback--rare${styleCls}` : ''}${toneCls}" style="${fbStyle}" aria-hidden="true">${esc(m.charAt(0))}</span>`;
      return `<span class="member-chip${rare ? ` member-chip--rare${styleCls}` : ''}${toneCls}"${chipStyle}>
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
      const rare = isHiddenMemberColorId(c.id);
      const sk = rare ? getHiddenMemberStyleKey(c.id) : '';
      const styleCls = sk ? ` member-rare--${sk}` : '';
      const kTone = memberToneClass(rare);
      const kTv = memberToneVars(c, rare);
      return `<button type="button" class="known-member-bar-btn${rare ? ` known-member-bar-btn--rare${styleCls}` : ''}${kTone}"${kTv ? ` style="${kTv}"` : ''} onclick="pickKnownMemberForTrip(${jqAttr(n)})">
        <span class="known-member-bar-dot${rare ? ` known-member-bar-dot--rare${styleCls}` : ''}" style="background:${c.fg}">${esc(n.charAt(0))}</span>${esc(n)}
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

  // New members get a random color by default (16-color cycle friendly).
  for (const m of appState.newTripMembers) {
    // eslint-disable-next-line no-await-in-loop
    await ensureRandomMemberColor(m);
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
  const tripColorId = pickRandomTripColorId(appState.allRows);
  const colorRow = { type: 'trip', action: 'setColor', id: row.id, colorId: tripColorId };
  const snapshot = snapshotRows();
  applyOptimisticPayload(row);
  applyOptimisticPayload(colorRow);
  hideCreateTripForm();
  pauseSyncBriefly(5000);
  navigate('tripDetail', row.id);

  try {
    const tripSyncTarget = appState.allRows.find(r => r && r.type === 'trip' && r.id === row.id) || null;
    const pr = await postRow(row, { syncTarget: tripSyncTarget });
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : `「${name}」行程已建立`);
    try {
      await postRow(colorRow, { syncTarget: tripSyncTarget });
    } catch (e2) {
      restoreRowsSnapshot(snapshot);
      toast(formatPostError(e2));
    }
  } catch (e) {
    restoreRowsSnapshot(snapshot);
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
  const snapshot = snapshotRows();
  applyOptimisticPayload(row, { pending: false });
  renderTrips();
  try {
    const pr = await postRow(row, { syncTarget: null });
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '行程已刪除');
  } catch (e) {
    restoreRowsSnapshot(snapshot);
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
  const snapshot = snapshotRows();
  applyOptimisticPayload(row);
  renderTripDetail();
  try {
    const syncTarget = appState.allRows.find(r => r && r.type === 'trip' && r.id === id) || null;
    const pr = await postRow(row, { syncTarget });
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '行程已結束');
  } catch (e) {
    restoreRowsSnapshot(snapshot);
    renderTripDetail();
    toast(formatPostError(e));
  }
}

export async function reopenTripAction(id) {
  const trip = getTripById(id);
  if (!trip) return;
  const row = { type: 'trip', action: 'reopen', id };
  const snapshot = snapshotRows();
  applyOptimisticPayload(row);
  renderTripDetail();
  try {
    const syncTarget = appState.allRows.find(r => r && r.type === 'trip' && r.id === id) || null;
    const pr = await postRow(row, { syncTarget });
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : `「${trip.name}」已重新開啟`);
  } catch (e) {
    restoreRowsSnapshot(snapshot);
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
  appState.revealMemberDirNext = true;
  renderMemberDirectory();
  overlay.classList.add('is-open');
  panel.classList.add('is-open');
}

export function closeMemberDirectory() {
  flushPendingMemberColors();
  document.getElementById('member-dir-panel').classList.remove('is-open');
  document.getElementById('member-dir-overlay').classList.remove('is-open');
}

let _pendingMemberColorFlushTimer = null;

function scheduleFlushPendingMemberColors() {
  if (_pendingMemberColorFlushTimer) clearTimeout(_pendingMemberColorFlushTimer);
  _pendingMemberColorFlushTimer = setTimeout(() => {
    _pendingMemberColorFlushTimer = null;
    flushPendingMemberColors();
  }, 900);
}

function getLastPersistedMemberColorId(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  for (let i = appState.allRows.length - 1; i >= 0; i--) {
    const r = appState.allRows[i];
    if (r && r.type === 'memberProfile' && r.memberName === n && r.colorId) {
      return String(r.colorId).trim();
    }
  }
  return '';
}

export async function flushPendingMemberColors() {
  const pending = appState.pendingMemberColors || {};
  const entries = Object.entries(pending);
  if (entries.length === 0) return;
  // Clear first so new taps can start a new batch.
  appState.pendingMemberColors = {};
  for (const [memberName, colorId] of entries) {
    const nextId = String(colorId || '').trim();
    if (!memberName || !nextId) continue;
    const prevId = getLastPersistedMemberColorId(memberName);
    if (prevId === nextId) continue;
    const row = { type: 'memberProfile', action: 'setColor', memberName, colorId: nextId };
    const snapshot = snapshotRows();
    applyOptimisticPayload(row);
    try {
      // eslint-disable-next-line no-await-in-loop
      const syncTarget =
        appState.allRows.find(r => r && r.type === 'memberProfile' && r.memberName === memberName) || null;
      const pr = await postRow(row, { syncTarget });
      if (pr.status === 'queued') toast('已暫存，連上網路後會自動上傳');
    } catch (e) {
      restoreRowsSnapshot(snapshot);
      toast(formatPostError(e));
    }
  }
  if (document.getElementById('member-dir-panel')?.classList.contains('is-open')) renderMemberDirectory();
}

// Best-effort flush when user reloads/closes the tab.
window.addEventListener('pagehide', () => {
  try { flushPendingMemberColors(); } catch { /* ignore */ }
});

export function openHiddenStylePreview() {
  const body = document.getElementById('member-preview-body');
  if (!body) return;
  const dark = document.documentElement.classList.contains('dark');
  body.innerHTML = HIDDEN_MEMBER_COLORS.map(h => {
    const sk = h.styleKey || '';
    const styleCls = sk ? ` member-rare--${sk}` : '';
    const label = h.label || h.id;
    const colorId = h.id || '';
    const fg = dark ? h.darkFg : h.fg;
    const bg = dark ? h.darkBg : h.bg;
    const pv = `--member-fg:${fg};--member-bg:${bg}`;
    const chip = `<span class="member-chip member-chip--rare${styleCls}" style="${pv}">
      <span class="member-chip-avatar member-chip-avatar--fallback member-chip-avatar-fallback--rare${styleCls}" style="background:${bg};color:${fg}" aria-hidden="true">隱</span>
      <span class="member-chip-name">${esc(label)}</span>
    </span>`;
    const dot = `<span class="known-member-bar-dot known-member-bar-dot--rare${styleCls}" style="background:${fg}" aria-hidden="true">隱</span>`;
    const avatar = `<span class="trip-lottery-avatar trip-lottery-avatar--fallback trip-lottery-avatar--rare${styleCls} trip-lottery-avatar-fallback--rare${styleCls}" style="background:${bg};color:${fg}" aria-hidden="true">隱</span>`;
    const frame = `<button type="button" class="member-dir-avatar member-dir-avatar--rare${styleCls}" style="background:${bg}" aria-label="${esc(label)} 框">
      <span class="member-dir-avatar-fallback member-dir-avatar-fallback--rare" style="background:${bg};color:${fg}">隱</span>
    </button>`;
    return `<div class="member-preview-row">
      <div class="member-preview-name">
        <div class="member-preview-label">${esc(label)}</div>
        <div class="member-preview-id">${esc(colorId)}</div>
      </div>
      <div class="member-preview-samples">
        ${chip}
        <span class="member-preview-sample">${dot}</span>
        <span class="member-preview-sample">${avatar}</span>
        <span class="member-preview-sample">${frame}</span>
      </div>
    </div>`;
  }).join('');
  document.getElementById('member-preview-overlay').classList.add('open');
}

export function closeHiddenStylePreview() {
  document.getElementById('member-preview-overlay').classList.remove('open');
}

// Hidden entry for preview: 7 taps within 1.6s, or long-press 1.1s on the "成員管理" title.
let _hiddenPreviewTapCount = 0;
let _hiddenPreviewTapAt = 0;
let _hiddenPreviewPressTimer = null;

export function hiddenPreviewSecretTap() {
  const now = Date.now();
  if (now - _hiddenPreviewTapAt > 1600) _hiddenPreviewTapCount = 0;
  _hiddenPreviewTapAt = now;
  _hiddenPreviewTapCount++;
  if (_hiddenPreviewTapCount >= 11) {
    _hiddenPreviewTapCount = 0;
    forceRefreshAssets();
    return;
  }
  if (_hiddenPreviewTapCount >= 7) {
    _hiddenPreviewTapCount = 0;
    openHiddenStylePreview();
  }
}

export function hiddenPreviewSecretPressStart() {
  if (_hiddenPreviewPressTimer) clearTimeout(_hiddenPreviewPressTimer);
  _hiddenPreviewPressTimer = setTimeout(() => {
    _hiddenPreviewPressTimer = null;
    openHiddenStylePreview();
  }, 1100);
}

export function hiddenPreviewSecretPressEnd() {
  if (_hiddenPreviewPressTimer) {
    clearTimeout(_hiddenPreviewPressTimer);
    _hiddenPreviewPressTimer = null;
  }
}

export async function forceRefreshAssets() {
  toast('正在更新資源…');
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      // eslint-disable-next-line no-await-in-loop
      for (const r of regs) await r.unregister();
    }
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      // eslint-disable-next-line no-await-in-loop
      for (const k of keys) await caches.delete(k);
    }
  } catch {
    /* ignore */
  }
  // Reload without relying on SW
  window.location.reload();
}

/** @type {string | null} */
let avatarPreviewMemberName = null;
/** @type {'trip' | 'daily'} */
let avatarPreviewScope = 'trip';

export function openMemberAvatarPreview(memberName, scope = 'trip') {
  const name = String(memberName || '').trim();
  if (!name) return;
  avatarPreviewMemberName = name;
  avatarPreviewScope = scope === 'daily' ? 'daily' : 'trip';
  const isDailyPreview = avatarPreviewScope === 'daily';
  const url = getAvatarUrlByMemberName(name, avatarPreviewScope);
  const color = getMemberColor(name);
  const rare = isHiddenMemberColorId(color.id);
  const sk = rare ? getHiddenMemberStyleKey(color.id) : '';
  const styleCls = sk ? ` member-rare--${sk}` : '';
  const dTone = memberToneClass(rare);
  const dTv = memberToneVars(color, rare);
  const ringCls = isDailyPreview
    ? 'member-avatar-preview-ring member-avatar-preview-ring--plain'
    : `member-avatar-preview-ring${rare ? ` member-avatar-preview-ring--rare${styleCls}` : ''}${dTone}`;
  const innerEl = document.getElementById('member-avatar-preview-inner');
  const titleEl = document.getElementById('member-avatar-preview-title');
  if (!innerEl || !titleEl) return;
  titleEl.textContent = name;
  if (url) {
    const st = !isDailyPreview && dTv ? ` style="${dTv}"` : '';
    innerEl.innerHTML = `<div class="${ringCls}"${st}><img class="member-avatar-preview-img" src="${url}" alt="${esc(name)} 頭像"></div>`;
  } else {
    const fb = isDailyPreview
      ? 'member-avatar-preview-fallback'
      : `member-avatar-preview-fallback${rare ? ` member-avatar-preview-fallback--rare${styleCls}` : ''}${dTone}`;
    const st = isDailyPreview
      ? `background:${color.bg};color:${color.fg}`
      : `background:${color.bg};color:${color.fg}${dTv ? `;${dTv}` : ''}`;
    innerEl.innerHTML = `<div class="${ringCls}"><div class="${fb}" style="${st}">${esc(name.charAt(0))}</div></div>`;
  }
  document.getElementById('member-avatar-preview-overlay')?.classList.toggle('member-avatar-preview-overlay--daily', isDailyPreview);
  document.getElementById('member-avatar-preview-overlay')?.classList.add('open');
}

export function closeMemberAvatarPreview() {
  const ov = document.getElementById('member-avatar-preview-overlay');
  if (ov) {
    ov.classList.remove('open');
    ov.classList.remove('member-avatar-preview-overlay--daily');
  }
  avatarPreviewMemberName = null;
  avatarPreviewScope = 'trip';
}

export function memberAvatarPreviewChangePhoto() {
  const name = avatarPreviewMemberName;
  const scope = avatarPreviewScope;
  closeMemberAvatarPreview();
  if (name) openAvatarPickerForMember(name, scope);
}

export function renderMemberDirectory() {
  const body = document.getElementById('member-dir-body');
  const panel = document.getElementById('member-dir-panel');
  const members = getKnownMemberNames();
  if (body._scrollRevealCleanup) body._scrollRevealCleanup();
  if (members.length === 0) {
    body.innerHTML = '<div class="member-dir-empty">尚無成員紀錄</div>';
    appState.revealMemberDirNext = false;
    return;
  }
  body.innerHTML = members.map((name, idx) => {
    const url = getAvatarUrlByMemberName(name, 'trip');
    const color = getMemberColor(name);
    const rare = isHiddenMemberColorId(color.id);
    const sk = rare ? getHiddenMemberStyleKey(color.id) : '';
    const styleCls = sk ? ` member-rare--${sk}` : '';
    const avImgCls = `member-dir-avatar-img${rare ? ' member-dir-avatar-img--rare' : ''}`;
    const fbCls = `member-dir-avatar-fallback${rare ? ' member-dir-avatar-fallback--rare' : ''}`;
    const avatarHtml = url
      ? `<img class="${avImgCls}" src="${url}" alt="${esc(name)}">`
      : `<span class="${fbCls}" style="background:${color.bg};color:${color.fg}">${esc(name.charAt(0))}</span>`;
    const dTone = memberToneClass(rare);
    const dTv = memberToneVars(color, rare);
    return `<div class="member-dir-item${rare ? ` member-dir-item--rare${styleCls}` : ''}${dTone}"${dTv ? ` style="--dir-i:${idx};${dTv}"` : ` style="--dir-i:${idx}"`} data-member="${esc(name)}">
      <button type="button" class="member-dir-avatar${rare ? ` member-dir-avatar--rare${styleCls}` : ''}${dTone}" onclick="openMemberAvatarPreview(${jqAttr(name)})" title="預覽頭像" style="background:${color.bg}${dTv ? `;${dTv}` : ''}">
        ${avatarHtml}
      </button>
      <div class="member-dir-name">${esc(name)}</div>
      <div class="member-dir-actions">
        <button type="button" class="member-dir-action-btn" onclick="cycleMemberColor(${jqAttr(name)})" title="換顏色">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 0 0 0 18h4a3 3 0 0 0 0-6h-1.5a1.5 1.5 0 1 1 0-3H16a3 3 0 0 0 0-6h-4zM7.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
        </button>
        <button type="button" class="member-dir-action-btn" onclick="renameMemberPrompt(${jqAttr(name)})" title="改名">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button type="button" class="member-dir-action-btn member-dir-action-btn--danger" onclick="deleteKnownMember(${jqAttr(name)})" title="刪除">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
  if (panel?.classList.contains('is-open')) {
    bindScrollReveal(body, '.member-dir-item', { enabled: appState.revealMemberDirNext });
    appState.revealMemberDirNext = false;
  }
}

export async function cycleMemberColor(memberName) {
  const name = String(memberName || '').trim();
  if (!name) return;

  const curId = getMemberColorId(name);
  const curIsHidden = HIDDEN_MEMBER_COLORS.some(h => h.id === curId);

  // 10 hidden styles/colors, each 0.5% (5/1000); total ~5% for any hidden.
  // Roll [0..999]: 0-49 => hidden[floor(roll/5)] (each 5/1000), otherwise normal cycle.
  const roll = randomUniformIndex(1000);
  if (roll < 50) {
    const hidden = HIDDEN_MEMBER_COLORS[Math.floor(roll / 5)];
    if (hidden) {
      appState.pendingMemberColors[name] = hidden.id;
      renderMemberDirectory();
      const hueName = hidden.label || hidden.id;
      await showAlert(
        '稀有配色！',
        `「${name}」刷到了隱藏色「${hueName}」。每次點換色約 5% 機率出現隱藏色（10 款各 0.5%），恭喜。`,
      );
      scheduleFlushPendingMemberColors();
      return;
    }
  }

  if (curIsHidden) {
    const ok = await showConfirm(
      '確定換掉隱藏色？',
      '目前是稀有配色，換成一般顏色後要再出現只能靠運氣。',
    );
    if (!ok) return;
  }

  const idx = MEMBER_COLORS.findIndex(c => c.id === curId);
  const next = MEMBER_COLORS[(idx >= 0 ? idx + 1 : 0) % MEMBER_COLORS.length];
  if (!next) return;
  appState.pendingMemberColors[name] = next.id;
  renderMemberDirectory();
  scheduleFlushPendingMemberColors();
}

function hasExplicitMemberColor(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  for (const r of appState.allRows) {
    if (r && r.type === 'memberProfile' && r.memberName === n && r.colorId) {
      return true;
    }
  }
  return false;
}

async function ensureRandomMemberColor(name) {
  const n = String(name || '').trim();
  if (!n) return;
  if (hasExplicitMemberColor(n)) return;
  const i = randomUniformIndex(MEMBER_COLORS.length);
  const picked = MEMBER_COLORS[i];
  if (!picked) return;
  const row = { type: 'memberProfile', action: 'setColor', memberName: n, colorId: picked.id };
  const snapshot = snapshotRows();
  applyOptimisticPayload(row);
  try {
    const syncTarget = appState.allRows.find(r => r && r.type === 'memberProfile' && r.memberName === n) || null;
    await postRow(row, { updateSyncUi: false, syncTarget });
  } catch {
    restoreRowsSnapshot(snapshot);
  }
}

export function toggleTripColorPicker(tripId) {
  const el = document.getElementById('tcp-' + tripId);
  if (!el) return;
  const wasOpen = el.classList.contains('is-open');
  document.querySelectorAll('.trip-color-picker').forEach(p => {
    p.classList.remove('is-open');
    p.setAttribute('aria-hidden', 'true');
  });
  if (!wasOpen) {
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
  }
}

export async function setTripColor(tripId, colorId) {
  if (!TRIP_COLORS.some(c => c.id === colorId)) return;
  const row = { type: 'trip', action: 'setColor', id: tripId, colorId };
  const snapshot = snapshotRows();
  applyOptimisticPayload(row);
  renderTrips();
  try {
    const syncTarget = appState.allRows.find(r => r && r.type === 'trip' && r.id === tripId) || null;
    const pr = await postRow(row, { syncTarget });
    if (pr.status === 'queued') toast('已暫存，連上網路後會自動上傳');
  } catch (e) {
    restoreRowsSnapshot(snapshot);
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
  const snapshot = snapshotRows();
  applyOptimisticPayload(row);
  renderMemberDirectory();
  refreshCurrentView();
  try {
    const syncTarget = appState.allRows.find(r => r && r.type === 'memberProfile' && r.memberName === trimmed) || null;
    const pr = await postRow(row, { syncTarget });
    if (pr.status === 'queued') toast('已暫存，連上網路後會自動上傳');
  } catch (e) {
    restoreRowsSnapshot(snapshot);
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
  const snapshot = snapshotRows();
  applyOptimisticPayload(row);
  renderMemberDirectory();
  renderKnownMemberPicker();
  refreshCurrentView();
  try {
    const syncTarget = appState.allRows.find(r => r && r.type === 'memberProfile' && r.memberName === name) || null;
    const pr = await postRow(row, { syncTarget });
    if (pr.status === 'queued') toast('已暫存，連上網路後會自動上傳');
  } catch (e) {
    restoreRowsSnapshot(snapshot);
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
  await ensureRandomMemberColor(name);
  const row = { type: 'tripMember', action: 'add', tripId: appState.currentTripId, memberName: name };
  const snapshot = snapshotRows();
  applyOptimisticPayload(row);
  renderTripDetail();
  try {
    const syncTarget = appState.allRows.find(r => r && r.type === 'trip' && r.id === appState.currentTripId) || null;
    const pr = await postRow(row, { syncTarget });
    if (pr.status === 'queued') toast('已暫存，連上網路後會自動上傳');
  } catch (e) {
    restoreRowsSnapshot(snapshot);
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
  await ensureRandomMemberColor(name);
  const row = { type: 'tripMember', action: 'add', tripId: appState.currentTripId, memberName: name };
  const snapshot = snapshotRows();
  applyOptimisticPayload(row);
  input.value = '';
  renderTripDetail();
  try {
    const syncTarget = appState.allRows.find(r => r && r.type === 'trip' && r.id === appState.currentTripId) || null;
    const pr = await postRow(row, { syncTarget });
    if (pr.status === 'queued') toast('已暫存，連上網路後會自動上傳');
  } catch (e) {
    restoreRowsSnapshot(snapshot);
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
  const snapshot = snapshotRows();
  applyOptimisticPayload(row);
  appState.detailSplitAmong = appState.detailSplitAmong.filter(m => m !== name);
  renderTripDetail();
  try {
    const syncTarget = appState.allRows.find(r => r && r.type === 'trip' && r.id === appState.currentTripId) || null;
    const pr = await postRow(row, { syncTarget });
    if (pr.status === 'queued') toast('已暫存，連上網路後會自動上傳');
  } catch (e) {
    restoreRowsSnapshot(snapshot);
    renderTripDetail();
    toast(formatPostError(e));
  }
}

