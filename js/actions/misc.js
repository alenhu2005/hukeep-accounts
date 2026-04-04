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
import { renderMemberDirectory } from './trips-members.js';

// ── Avatar uploader (global, per memberName) ──────────────────────────────
let avatarUploadMemberName = null;
let avatarUploadScope = 'auto';

export function openAvatarPickerForMember(memberName, scope = 'auto') {
  avatarUploadMemberName = memberName;
  avatarUploadScope = scope || 'auto';
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
  const scope = avatarUploadScope || 'auto';
  avatarUploadScope = 'auto';

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
    avatarScope: scope,
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
        avatarScope: scope,
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
export function openBackupMenu() {
  document.getElementById('backup-overlay')?.classList.add('open');
}

export function closeBackupMenu() {
  document.getElementById('backup-overlay')?.classList.remove('open');
}

