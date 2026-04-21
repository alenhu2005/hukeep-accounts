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
  getTripExpenseAmountRevisionTrail,
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
import { computeBalance, computeExpenseShares, computeSettlements } from '../finance.js';
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
    img.classList.remove('edit-photo-preview--enter');
    removeBtn.style.display = 'none';
    return;
  }

  img.src = dataUrl;
  img.classList.remove('hidden');
  removeBtn.style.display = '';
  if (!prefersReducedMotion()) {
    img.classList.remove('edit-photo-preview--enter');
    void img.offsetWidth;
    requestAnimationFrame(() => img.classList.add('edit-photo-preview--enter'));
  }
}


export function openEditRecord(r) {
  if (r._voided) return;
  appState._editRecord = r;
  editPhotoPendingChange = null;

  const isTripSettlement = r.type === 'tripSettlement';
  const catGrp = document.getElementById('edit-category-group');
  const noteGrp = document.getElementById('edit-note-photo-group');
  const dateInput = document.getElementById('edit-date');
  const dateGrp = dateInput?.closest('.form-group');
  const submitBtn = document.getElementById('edit-submit-btn');
  if (isTripSettlement) {
    if (catGrp) catGrp.style.display = 'none';
    if (noteGrp) noteGrp.style.display = 'none';
    if (dateGrp) dateGrp.style.display = 'none';
    if (submitBtn) submitBtn.style.display = 'none';
  } else {
    if (catGrp) catGrp.style.display = '';
    if (noteGrp) noteGrp.style.display = '';
    if (dateGrp) dateGrp.style.display = '';
    if (submitBtn) submitBtn.style.display = '';
  }

  const tripAmtGrp = document.getElementById('edit-trip-amount-group');
  const tripAmtInput = document.getElementById('edit-trip-amount');
  if (tripAmtGrp && tripAmtInput) {
    if (isTripSettlement || r.type !== 'tripExpense') {
      tripAmtGrp.style.display = 'none';
      tripAmtInput.value = '';
    } else {
      tripAmtGrp.style.display = '';
      const v = parseFloat(r.amount) || 0;
      tripAmtInput.value = v > 0 ? String(Math.round(v)) : '';
    }
  }

  const voidBtn = document.getElementById('edit-void-btn');
  if (voidBtn) {
    const canVoid =
      r &&
      (r.type === 'daily' ||
        r.type === 'settlement' ||
        r.type === 'tripExpense' ||
        r.type === 'tripSettlement') &&
      r.id;
    voidBtn.style.display = canVoid ? '' : 'none';
    voidBtn.disabled = !canVoid;
  }

  const summary = document.getElementById('edit-summary');
  if (summary) {
    const amt = parseFloat(r.amount) || 0;
    if (isTripSettlement) {
      summary.innerHTML =
        `<div class="edit-summary-item">出遊還款</div>` +
        `<div class="edit-summary-meta">${esc(r.date || '')} · ${esc(String(r.from || ''))} → ${esc(String(r.to || ''))} · NT$${Math.round(amt)}</div>`;
      if (!prefersReducedMotion()) {
        summary.classList.remove('edit-summary--swap');
        void summary.offsetWidth;
        requestAnimationFrame(() => summary.classList.add('edit-summary--swap'));
      }
    } else {
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
      const hasCustomSplit = Array.isArray(r.splitDetails) && r.splitDetails.length > 0;
      const names = r.splitAmong.map(m => esc(String(m))).join('、');
      const trip = r.tripId ? getTripById(r.tripId) : null;
      if (hasCustomSplit) {
        const lines = computeExpenseShares(r)
          .map(s => `${esc(String(s.name || ''))} NT$${Math.round(s.amount)}`)
          .join('、');
        splitHtml = `<div class="edit-summary-split" role="group" aria-label="分攤說明">
          <div class="edit-summary-split-row"><span class="edit-summary-split-k">分攤對象</span><span class="edit-summary-split-v">${names}</span></div>
          <div class="edit-summary-split-row"><span class="edit-summary-split-k">詳細分攤</span><span class="edit-summary-split-v">${lines}</span></div>
        </div>`;
      } else {
        const n = r.splitAmong.length;
        const sh = computeExpenseShares(r);
        const per = sh.length ? Math.round(sh[0].amount) : Math.round(amt / n);
        const tm = trip?.members?.length ?? 0;
        const fullTrip = tm > 0 && n === tm;
        splitHtml = `<div class="edit-summary-split" role="group" aria-label="分攤說明">
          <div class="edit-summary-split-row"><span class="edit-summary-split-k">分攤對象</span><span class="edit-summary-split-v">${names}${fullTrip ? ` <span class="edit-summary-split-tag">全員均分</span>` : ''}</span></div>
          <div class="edit-summary-split-row"><span class="edit-summary-split-k">每人負擔</span><span class="edit-summary-split-v">NT$${per.toLocaleString()}</span></div>
        </div>`;
      }
    }

    const cnyRaw = parseFloat(r.amountCny);
    const cnyPart =
      Number.isFinite(cnyRaw) && cnyRaw > 0
        ? ` · ¥${cnyRaw.toFixed(2).replace(/\.?0+$/, '')}`
        : '';
    let amountRevHtml = '';
    if (r.type === 'tripExpense' && r.id) {
      const rev = getTripExpenseAmountRevisionTrail(r.id, appState.allRows);
      if (rev.length >= 2) {
        const rows = rev
          .map((s, i) => {
            const d = esc(String(s.date || '').slice(0, 10));
            const delta = i > 0 ? s.amount - rev[i - 1].amount : 0;
            const deltaHtml =
              i > 0 && delta !== 0
                ? ` <span class="edit-summary-amt-rev-delta">${delta > 0 ? '+' : ''}${delta}</span>`
                : '';
            return `<div class="edit-summary-amt-rev-row">${d}　NT$${s.amount.toLocaleString()}${deltaHtml}</div>`;
          })
          .join('');
        amountRevHtml = `<div class="edit-summary-amt-rev" role="group" aria-label="金額修訂紀錄">
          <div class="edit-summary-amt-rev__label">金額修訂紀錄</div>
          <div class="edit-summary-amt-rev__rows">${rows}</div>
        </div>`;
      }
    }
    summary.innerHTML = `<div class="edit-summary-item">${esc(r.item || '—')}</div>`
      + `<div class="edit-summary-meta">${esc(r.date || '')}${payLine ? ' · ' + payLine : ''}${amt ? ' · NT$' + Math.round(amt) : ''}${cnyPart}</div>`
      + amountRevHtml
      + splitHtml;
    if (!prefersReducedMotion()) {
      summary.classList.remove('edit-summary--swap');
      void summary.offsetWidth;
      requestAnimationFrame(() => summary.classList.add('edit-summary--swap'));
    }
    }
  }

  document.getElementById('edit-date').value = r.date || todayStr();
  document.getElementById('edit-note').value = r.note || '';
  document.getElementById('edit-category').value = r.category || guessCategoryFromItem(r.item) || '';

  const inp = document.getElementById('edit-photo-input');
  if (inp) inp.value = '';
  setEditPhotoPreview(r.photoUrl || null);

  document.getElementById('edit-overlay').classList.add('open');
}

export function openEditRecordById(id, kind) {
  let r;
  if (kind === true || kind === 'tripExpense') {
    r = appState._tripExpenseCache.find(x => x.id === id);
  } else if (kind === 'tripSettlement') {
    r = appState._tripSettlementCache.find(x => x.id === id);
  } else {
    r = appState._dailyRecordsCache.find(x => x.id === id);
  }
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
  }, 340);
  appState._editRecord = null;
  editPhotoPendingChange = null;

  const tripAmtInp = document.getElementById('edit-trip-amount');
  if (tripAmtInp) tripAmtInp.value = '';

  // Clear preview UI; next openEditRecord will reload stored photo.
  setEditPhotoPreview(null);
}

export async function voidEditingRecord() {
  const r = appState._editRecord;
  if (!r || !r.id || r._voided) return;
  const isTripExp = r.type === 'tripExpense';
  const isTripSettle = r.type === 'tripSettlement';
  const isTripLedger = isTripExp || isTripSettle;
  const label =
    r.type === 'settlement' || r.type === 'tripSettlement'
      ? '還款'
      : r.item || '消費';
  const amount = parseFloat(r.amount) || 0;
  const ok = await showConfirm(
    '撤回這筆紀錄？',
    `「${label}」— NT$${Math.round(amount)} 將標記為撤回，${isTripLedger ? '分帳' : '帳面'}隨之更動，紀錄仍保留。`,
  );
  if (!ok) return;

  closeEditRecord();

  let row;
  if (isTripExp) row = { type: 'tripExpense', action: 'void', id: r.id };
  else if (isTripSettle) row = { type: 'tripSettlement', action: 'void', id: r.id };
  else row = { type: 'daily', action: 'void', id: r.id };
  if (!isTripLedger) snapshotPendingHomeBalanceFromAbs();
  appState.allRows.push(row);
  if (isTripLedger) renderTripDetail();
  else renderHome();
  try {
    const pr = await postRow(row);
    toast(pr.status === 'queued' ? '已暫存，連上網路後會自動上傳' : '已撤回');
  } catch (e) {
    undoOptimisticPush(row);
    if (!isTripLedger) cancelHomeBalanceAnim();
    if (isTripLedger) renderTripDetail();
    else renderHome();
    toast(formatPostError(e));
  }
}

export async function submitEditRecord() {
  if (!appState._editRecord) return;
  if (appState._editRecord.type === 'tripSettlement') {
    toast('出遊還款僅可撤回，無法編輯');
    return;
  }
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
  let tripAmountPatch = {};
  if (isTrip) {
    const newAmt = parseMoneyLike(document.getElementById('edit-trip-amount')?.value);
    if (!Number.isFinite(newAmt) || newAmt <= 0) {
      toast('請輸入有效的新台幣金額');
      return;
    }
    const origAmt = parseFloat(appState._editRecord.amount) || 0;
    const amountChanged = Math.abs(origAmt - newAmt) > 1e-6;
    tripAmountPatch = {
      amount: newAmt,
      ...(amountChanged ? { fxFeeNtd: 0 } : {}),
    };
  }
  const optimisticRow = {
    type: appState._editRecord.type,
    action: 'edit',
    id: appState._editRecord.id,
    date,
    note,
    category,
    ...tripAmountPatch,
    ...(hasPhoto ? { photoUrl: photoUrlToSet, photoFileId: '' } : {}),
  };
  const postPayload = {
    type: appState._editRecord.type,
    action: 'edit',
    id: appState._editRecord.id,
    date,
    note,
    category,
    ...tripAmountPatch,
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

