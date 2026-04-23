import { appState } from './state.js';
import { render } from './render-registry.js';
import { persistSessionSnapshot } from './session-ui.js';
import { cancelHomeBalanceAnim, closeHomeCalendarModal } from './views-home.js';
import { cancelAnalysisCountAnim } from './views-analysis.js';
import { cancelTripSettlementAnim, resetTripDetailAmountDraft } from './views-trip-detail.js';
import { closeMemberDirectory } from './actions/trips-members.js';

function syncMemberDirFabVisibility(page = appState.currentPage, tripId = appState.currentTripId) {
  const fab = document.getElementById('member-dir-fab');
  if (!fab) return;
  const shouldShow = page === 'trips' && !tripId;
  fab.hidden = !shouldShow;
  fab.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  fab.style.display = shouldShow ? 'flex' : 'none';
  if (!shouldShow) {
    fab.style.top = '';
    fab.style.bottom = '';
    closeMemberDirectory();
    return;
  }
  requestAnimationFrame(positionMemberDirFab);
}

function positionMemberDirFab() {
  const fab = document.getElementById('member-dir-fab');
  if (!fab || fab.hidden || fab.style.display === 'none') return;
  const bottomNav = document.getElementById('bottom-nav');
  const syncBar = document.getElementById('sync-status-bar');
  const navTop = bottomNav?.getBoundingClientRect?.().top ?? window.innerHeight;
  const syncTop = syncBar?.getBoundingClientRect?.().top ?? window.innerHeight;
  const anchorTop = Math.min(navTop, syncTop);
  const fabHeight = fab.offsetHeight || 54;
  const top = Math.max(16, Math.round(anchorTop - fabHeight - 18));
  fab.style.top = `${top}px`;
  fab.style.bottom = 'auto';
}

window.addEventListener('resize', () => {
  requestAnimationFrame(positionMemberDirFab);
});

/**
 * @param {string} page
 * @param {string|null} [tripId]
 * @param {{ restoreScrollY?: number }} [opts] 重新整理還原時帶入先前捲動位置（一般導覽勿傳）
 */
export function navigate(page, tripId = null, opts = {}) {
  const { restoreScrollY } = opts;
  const prevPage = appState.currentPage;
  const prevTripId = appState.currentTripId;
  if (prevPage === 'home' && page !== 'home') {
    cancelHomeBalanceAnim();
    closeHomeCalendarModal();
  }
  if (prevPage === 'analysis' && page !== 'analysis') {
    cancelAnalysisCountAnim();
  }
  if (prevPage === 'tripDetail' && page !== 'tripDetail') {
    cancelTripSettlementAnim();
    appState.detailGamblingMode = false;
    appState.tripDetailHistoryWeekOffset = 0;
    appState.tripDetailHistoryFilterDate = null;
    // UX: do not keep amount draft when leaving trip detail.
    try { resetTripDetailAmountDraft(); } catch { /* ignore */ }
    const tripHistoryMeta = document.getElementById('trip-history-range-meta');
    if (tripHistoryMeta) {
      tripHistoryMeta.textContent = '';
      tripHistoryMeta.hidden = true;
    }
  }
  appState.currentPage = page;
  appState.currentTripId = tripId;
  if (page === 'tripDetail' && tripId !== prevTripId) {
    appState.detailGamblingMode = false;
    // 從首頁／列表進入時 prevTripId 常為 null，若一律 false 會洗掉「同行程再進」應記住的展開狀態
    appState.tripStatsPieExpanded = tripId
      ? (appState.tripStatsPieExpandedByTrip[tripId] ?? false)
      : false;
  }
  /** 每次進入「日常」（含已在日常再點一次底欄）都刷金額；還原捲動的 session 載入除外 */
  if (page === 'home' && typeof opts.restoreScrollY !== 'number') {
    appState.animateHomeBalanceNext = true;
  }
  if (page === 'home' && prevPage !== 'home' && typeof opts.restoreScrollY !== 'number') {
    appState.revealHomeRecordsNext = true;
  }
  if (page === 'tripDetail' && prevPage !== 'tripDetail') {
    appState.revealTripExpensesNext = true;
  }
  if (page === 'trips' && prevPage !== 'trips') {
    appState.revealTripsSectionNext = true;
  }
  if (page === 'tripDetail' && appState.detailMultiPay) {
    appState.detailMultiPay = false;
    const pg = document.getElementById('d-paidby-group');
    const ag = document.getElementById('d-amount-group');
    const mg = document.getElementById('d-multipay-group');
    if (pg) pg.style.display = '';
    if (ag) ag.style.display = '';
    if (mg) mg.style.display = 'none';
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const pageId =
    page === 'tripDetail' ? 'page-trip-detail' : page === 'trips' ? 'page-trips' : page === 'analysis' ? 'page-analysis' : 'page-home';
  document.getElementById(pageId).classList.add('active');
  const navId =
    page === 'trips' || page === 'tripDetail'
      ? 'nav-trips'
      : page === 'analysis'
        ? 'nav-analysis'
        : 'nav-home';
  document.getElementById(navId).classList.add('active');
  syncMemberDirFabVisibility(page, tripId);
  if (page !== 'tripDetail') {
    const ha = document.getElementById('trip-header-actions');
    if (ha) ha.innerHTML = '';
  }
  render();
  if (typeof restoreScrollY === 'number' && Number.isFinite(restoreScrollY)) {
    requestAnimationFrame(() => {
      syncMemberDirFabVisibility(page, tripId);
      window.scrollTo(0, Math.max(0, restoreScrollY));
      persistSessionSnapshot();
    });
  } else {
    requestAnimationFrame(() => syncMemberDirFabVisibility(page, tripId));
    window.scrollTo(0, 0);
    persistSessionSnapshot();
  }
}
