/**
 * Inline HTML handlers (onclick=...) expect globals on window.
 * Keep this list in sync with index.html and dynamic innerHTML in views.
 */
import { navigate } from './navigation.js';
import { cancelDialog } from './dialog.js';
import { toggleTheme } from './theme.js';
import { toggleAccentMenu, closeAccentMenu, setAccentTheme } from './accent-theme.js';
import {
  toggleHomeHistory,
  shiftHomeCalendarMonth,
  selectHomeCalendarDay,
  clearHomeCalendarDayFilter,
  toggleHomeCalendarModal,
  closeHomeCalendarModal,
} from './views-home.js';
import {
  setAnalysisPeriod,
  setPieLabelOption,
  shiftAnalysisWeek,
  shiftAnalysisMonth,
  shiftAnalysisYear,
  selectAnalysisDay,
  clearAnalysisDayFilter,
} from './views-analysis.js';
import {
  shiftTripHistoryWeek,
  selectTripHistoryDay,
  clearTripHistoryDayFilter,
} from './views-trip-detail.js';
import * as actions from './actions.js';
import { toggleDetailAmountCurrency } from './trip-cny-rate.js';
import {
  startTripLotteryDraw,
  setTripLotteryKeepInPool,
  resetTripLotteryPool,
  toggleTripLotteryPanel,
  removeFromTripLotteryPool,
  addToTripLotteryPoolFromInput,
  addToTripLotteryPoolFromSelect,
} from './trip-lottery.js';
import {
  openTripNumberBomb,
  closeNumberBombGame,
  nbombSyncSetupPanels,
  nbombStart,
  nbombGuess,
  nbombAgain,
  nbombSecretLotteryTitleTapFromClick,
  nbombSecretLotteryTitlePressStart,
  nbombSecretLotteryTitlePressEnd,
} from './trip-play-number-bomb.js';

let lbScale = 1, lbX = 0, lbY = 0, lbPinchDist = 0, lbPanning = false, lbStartX = 0, lbStartY = 0, lbOrigX = 0, lbOrigY = 0;

function lbApply() {
  const wrap = document.getElementById('photo-lightbox-wrap');
  if (wrap) wrap.style.transform = `translate(${lbX}px,${lbY}px) scale(${lbScale})`;
}
function lbReset() {
  lbScale = 1; lbX = 0; lbY = 0;
  const wrap = document.getElementById('photo-lightbox-wrap');
  if (wrap) wrap.style.transform = '';
}

function openPhotoLightbox(src) {
  if (!src) return;
  const lb = document.getElementById('photo-lightbox');
  const img = document.getElementById('photo-lightbox-img');
  if (!lb || !img) return;
  img.src = src;
  lbReset();
  lb.classList.add('open');
}
function closePhotoLightbox() {
  const lb = document.getElementById('photo-lightbox');
  if (lb) lb.classList.remove('open');
  lbReset();
}

(function initLightboxGestures() {
  let lastTap = 0;
  function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
  document.addEventListener('touchstart', e => {
    const lb = document.getElementById('photo-lightbox');
    if (!lb || !lb.classList.contains('open')) return;
    const wrap = document.getElementById('photo-lightbox-wrap');
    if (!wrap || !wrap.contains(e.target)) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      lbPinchDist = dist(e.touches);
      lbPanning = false;
    } else if (e.touches.length === 1 && lbScale > 1) {
      lbPanning = true;
      lbStartX = e.touches[0].clientX;
      lbStartY = e.touches[0].clientY;
      lbOrigX = lbX;
      lbOrigY = lbY;
    }
  }, { passive: false });

  document.addEventListener('touchmove', e => {
    const lb = document.getElementById('photo-lightbox');
    if (!lb || !lb.classList.contains('open')) return;
    if (e.touches.length === 2 && lbPinchDist > 0) {
      e.preventDefault();
      const d = dist(e.touches);
      lbScale = Math.max(1, Math.min(5, lbScale * (d / lbPinchDist)));
      lbPinchDist = d;
      if (lbScale <= 1.05) { lbX = 0; lbY = 0; }
      lbApply();
    } else if (e.touches.length === 1 && lbPanning) {
      e.preventDefault();
      lbX = lbOrigX + (e.touches[0].clientX - lbStartX);
      lbY = lbOrigY + (e.touches[0].clientY - lbStartY);
      lbApply();
    }
  }, { passive: false });

  document.addEventListener('touchend', e => {
    const lb = document.getElementById('photo-lightbox');
    if (!lb || !lb.classList.contains('open')) return;
    if (e.touches.length < 2) lbPinchDist = 0;
    if (e.touches.length === 0) {
      lbPanning = false;
      const now = Date.now();
      if (now - lastTap < 300) {
        if (lbScale > 1.05) { lbScale = 1; lbX = 0; lbY = 0; } else { lbScale = 2.5; }
        lbApply();
      }
      lastTap = now;
    }
    if (lbScale <= 1.05) { lbScale = 1; lbX = 0; lbY = 0; lbApply(); }
  });
})();

// Pause expensive visual effects when tab is hidden/backgrounded.
(function initAnimationPauseOnHidden() {
  function apply() {
    document.documentElement.classList.toggle('anim-paused', document.hidden);
  }
  document.addEventListener('visibilitychange', apply);
  apply();
})();

async function clearLocalCache() {
  const { showConfirm } = await import('./dialog.js');
  const ok = await showConfirm('清除本地快取？', '將清除本機暫存的帳務資料，下次開啟會重新從伺服器載入。');
  if (!ok) return;
  const { clearLedgerLocalStorage } = await import('./api.js');
  clearLedgerLocalStorage();
  try {
    localStorage.removeItem('ledger_sync_last_at_v1');
    sessionStorage.clear();
  } catch {}
  const { toast } = await import('./utils.js');
  toast('本地快取已清除，重新載入中…');
  setTimeout(() => location.reload(), 800);
}

Object.assign(window, {
  openPhotoLightbox,
  closePhotoLightbox,
  clearLocalCache,
  navigate,
  cancelDialog,
  openBackupMenu: actions.openBackupMenu,
  closeBackupMenu: actions.closeBackupMenu,
  toggleTheme,
  toggleAccentMenu,
  closeAccentMenu,
  setAccentTheme,
  toggleHomeHistory,
  shiftHomeCalendarMonth,
  selectHomeCalendarDay,
  clearHomeCalendarDayFilter,
  toggleHomeCalendarModal,
  closeHomeCalendarModal,
  setAnalysisPeriod,
  setPieLabelOption,
  shiftAnalysisWeek,
  shiftAnalysisMonth,
  shiftAnalysisYear,
  selectAnalysisDay,
  clearAnalysisDayFilter,
  shiftTripHistoryWeek,
  selectTripHistoryDay,
  clearTripHistoryDayFilter,
  closeEditRecord: actions.closeEditRecord,
  submitEditRecord: actions.submitEditRecord,
  voidEditingRecord: actions.voidEditingRecord,
  openEditPhotoPicker: actions.openEditPhotoPicker,
  handleEditPhotoSelected: actions.handleEditPhotoSelected,
  removeEditPhoto: actions.removeEditPhoto,
  openAvatarPickerForMember: actions.openAvatarPickerForMember,
  handleAvatarSelected: actions.handleAvatarSelected,
  openMemberAvatarPreview: actions.openMemberAvatarPreview,
  closeMemberAvatarPreview: actions.closeMemberAvatarPreview,
  memberAvatarPreviewChangePhoto: actions.memberAvatarPreviewChangePhoto,
  cycleMemberColor: actions.cycleMemberColor,
  pickKnownMemberForTrip: actions.pickKnownMemberForTrip,
  addDetailMemberByName: actions.addDetailMemberByName,
  toggleMemberDirectory: actions.toggleMemberDirectory,
  closeMemberDirectory: actions.closeMemberDirectory,
  openHiddenStylePreview: actions.openHiddenStylePreview,
  closeHiddenStylePreview: actions.closeHiddenStylePreview,
  hiddenPreviewSecretTap: actions.hiddenPreviewSecretTap,
  hiddenPreviewSecretPressStart: actions.hiddenPreviewSecretPressStart,
  hiddenPreviewSecretPressEnd: actions.hiddenPreviewSecretPressEnd,
  forceRefreshAssets: actions.forceRefreshAssets,
  renameMemberPrompt: actions.renameMemberPrompt,
  deleteKnownMember: actions.deleteKnownMember,
  toggleTripColorPicker: actions.toggleTripColorPicker,
  setTripColor: actions.setTripColor,
  setApiUrl: actions.setApiUrl,
  recordSettlement: actions.recordSettlement,
  recordTripSettlementOneAction: actions.recordTripSettlementOneAction,
  toggleCollapsible: actions.toggleCollapsible,
  toggleTripStatsPieCollapse: actions.toggleTripStatsPieCollapse,
  openTripStatsModal: actions.openTripStatsModal,
  closeTripStatsModal: actions.closeTripStatsModal,
  toggleTripStatsPieCollapseModal: actions.toggleTripStatsPieCollapseModal,
  tripDetailFormHeaderClick: actions.tripDetailFormHeaderClick,
  tripDetailFormHeaderKeydown: actions.tripDetailFormHeaderKeydown,
  setHomePaidBy: actions.setHomePaidBy,
  setHomeSplitMode: actions.setHomeSplitMode,
  submitDailyRecord: actions.submitDailyRecord,
  exportBackupCSV: actions.exportBackupCSV,
  exportTechnicalCSV: actions.exportTechnicalCSV,
  copyBackupText: actions.copyBackupText,
  showCreateTripForm: actions.showCreateTripForm,
  addNewTripMember: actions.addNewTripMember,
  hideCreateTripForm: actions.hideCreateTripForm,
  createTrip: actions.createTrip,
  addDetailMember: actions.addDetailMember,
  addPayerRow: actions.addPayerRow,
  removePayerRow: actions.removePayerRow,
  setPayerRowMember: actions.setPayerRowMember,
  setDetailPaidBy: actions.setDetailPaidBy,
  toggleMultiPay: actions.toggleMultiPay,
  submitTripExpense: actions.submitTripExpense,
  toggleDetailGamblingMode: actions.toggleDetailGamblingMode,
  updateMultiPayTotal: actions.updateMultiPayTotal,
  toggleSplit: actions.toggleSplit,
  toggleDetailSplitMode: actions.toggleDetailSplitMode,
  setDetailSplitAmount: actions.setDetailSplitAmount,
  beginDetailSplitEdit: actions.beginDetailSplitEdit,
  endDetailSplitEdit: actions.endDetailSplitEdit,
  beginDetailTotalEdit: actions.beginDetailTotalEdit,
  handleDetailTotalInput: actions.handleDetailTotalInput,
  endDetailTotalEdit: actions.endDetailTotalEdit,
  handleDetailCnyInput: actions.handleDetailCnyInput,
  toggleDetailAmountCurrency,
  beginMultiPayEdit: actions.beginMultiPayEdit,
  endMultiPayEdit: actions.endMultiPayEdit,
  handleMultiPayAmountInput: actions.handleMultiPayAmountInput,
  voidDailyRecord: actions.voidDailyRecord,
  openEditRecordById: actions.openEditRecordById,
  deleteTripAction: actions.deleteTripAction,
  copyTripSettlementSummary: actions.copyTripSettlementSummary,
  reopenTripAction: actions.reopenTripAction,
  closeTripAction: actions.closeTripAction,
  removeMemberAction: actions.removeMemberAction,
  voidTripExpenseAction: actions.voidTripExpenseAction,
  removeNewTripMember: actions.removeNewTripMember,
  focusAmountAfterHomeItem: actions.focusAmountAfterHomeItem,
  focusNextInBothPayHome: actions.focusNextInBothPayHome,
  focusAmountAfterTripItem: actions.focusAmountAfterTripItem,
  startTripLotteryDraw,
  setTripLotteryKeepInPool,
  resetTripLotteryPool,
  toggleTripLotteryPanel,
  removeFromTripLotteryPool,
  addToTripLotteryPoolFromInput,
  addToTripLotteryPoolFromSelect,
  openTripNumberBomb,
  closeNumberBombGame,
  nbombSyncSetupPanels,
  nbombStart,
  nbombGuess,
  nbombAgain,
  nbombSecretLotteryTitleTapFromClick,
  nbombSecretLotteryTitlePressStart,
  nbombSecretLotteryTitlePressEnd,
});
