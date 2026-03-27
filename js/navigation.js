import { appState } from './state.js';
import { render } from './render-registry.js';
import { persistSessionSnapshot } from './session-ui.js';
import { cancelHomeBalanceAnim } from './views-home.js';
import { cancelAnalysisCountAnim } from './views-analysis.js';
import { cancelTripSettlementAnim, resetTripDetailAmountDraft } from './views-trip-detail.js';

/**
 * @param {string} page
 * @param {string|null} [tripId]
 * @param {{ restoreScrollY?: number }} [opts] 重新整理還原時帶入先前捲動位置（一般導覽勿傳）
 */
export function navigate(page, tripId = null, opts = {}) {
  const { restoreScrollY } = opts;
  const prevPage = appState.currentPage;
  if (prevPage === 'home' && page !== 'home') {
    cancelHomeBalanceAnim();
  }
  if (prevPage === 'analysis' && page !== 'analysis') {
    cancelAnalysisCountAnim();
  }
  if (prevPage === 'tripDetail' && page !== 'tripDetail') {
    cancelTripSettlementAnim();
    // UX: do not keep amount draft when leaving trip detail.
    try { resetTripDetailAmountDraft(); } catch { /* ignore */ }
  }
  appState.currentPage = page;
  appState.currentTripId = tripId;
  /** 每次進入「日常」（含已在日常再點一次底欄）都刷金額；還原捲動的 session 載入除外 */
  if (page === 'home' && typeof opts.restoreScrollY !== 'number') {
    appState.animateHomeBalanceNext = true;
  }
  if (page === 'tripDetail' && appState.detailMultiPay) {
    appState.detailMultiPay = false;
    const tog = document.getElementById('d-multipay-toggle');
    if (tog) tog.textContent = '多人出款';
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
  if (page !== 'tripDetail') {
    const ha = document.getElementById('trip-header-actions');
    if (ha) ha.innerHTML = '';
  }
  render();
  if (typeof restoreScrollY === 'number' && Number.isFinite(restoreScrollY)) {
    requestAnimationFrame(() => {
      window.scrollTo(0, Math.max(0, restoreScrollY));
      persistSessionSnapshot();
    });
  } else {
    window.scrollTo(0, 0);
    persistSessionSnapshot();
  }
}
