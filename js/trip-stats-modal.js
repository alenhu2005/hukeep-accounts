import { appState } from './state.js';
import { getTripById, getTripExpenses } from './data.js';
import { bindScrollReveal } from './utils.js';
import { renderTripStatsCard } from './trip-stats.js';
import { toggleCollapsible } from './ui-collapsible.js';

const TRIP_STATS_MODAL_CLOSE_MS = 380;

/** 出遊統計圓餅圖收合；寫入 appState 供重繪時沿用使用者選擇。 */
function toggleTripStatsPieCollapseWithSuffix(idSuffix) {
  toggleCollapsible(
    `trip-stats-pie-panel${idSuffix}`,
    `trip-stats-pie-toggle-icon${idSuffix}`,
    `trip-stats-pie-fold-btn${idSuffix}`,
  );
  const el = document.getElementById(`trip-stats-pie-panel${idSuffix}`);
  if (el) {
    const open = el.classList.contains('is-open');
    appState.tripStatsPieExpanded = open;
    const tid = appState.currentTripId;
    if (tid) appState.tripStatsPieExpandedByTrip[tid] = open;
  }
}

export function toggleTripStatsPieCollapse() {
  toggleTripStatsPieCollapseWithSuffix('');
}

/** 彈窗內圓餅區（id 帶 `-modal` 後綴）。 */
export function toggleTripStatsPieCollapseModal() {
  toggleTripStatsPieCollapseWithSuffix('-modal');
}

function finishTripStatsModalClose(overlay, body) {
  if (overlay) {
    overlay.classList.remove('open');
    overlay.classList.remove('closing');
    if (overlay._closingT) {
      clearTimeout(overlay._closingT);
      overlay._closingT = null;
    }
  }
  if (body?._scrollRevealCleanup) body._scrollRevealCleanup();
  if (body) body.innerHTML = '';
}

/** 頂欄「統計」：開啟出遊統計彈窗。 */
export function openTripStatsModal() {
  if (appState.currentPage !== 'tripDetail' || !appState.currentTripId) return;
  const trip = getTripById(appState.currentTripId);
  if (!trip) return;
  const expenses = getTripExpenses(appState.currentTripId);
  const body = document.getElementById('trip-stats-modal-body');
  const overlay = document.getElementById('trip-stats-modal-overlay');
  if (!body || !overlay) return;
  if (overlay._closingT) {
    clearTimeout(overlay._closingT);
    overlay._closingT = null;
  }
  overlay.classList.remove('closing');
  if (body._scrollRevealCleanup) body._scrollRevealCleanup();
  body.innerHTML = renderTripStatsCard(trip.members, expenses, { idSuffix: '-modal' });
  bindScrollReveal(body, '.trip-stats-section, .trip-stats-summary-card, .trip-stats-net-card, .payer-stats-row', {
    enabled: true,
  });
  overlay.classList.add('open');
}

export function closeTripStatsModal() {
  const overlay = document.getElementById('trip-stats-modal-overlay');
  const body = document.getElementById('trip-stats-modal-body');
  if (!overlay || !overlay.classList.contains('open') || overlay.classList.contains('closing')) return;
  if (overlay._closingT) clearTimeout(overlay._closingT);
  overlay.classList.add('closing');
  overlay._closingT = setTimeout(() => {
    finishTripStatsModalClose(overlay, body);
  }, TRIP_STATS_MODAL_CLOSE_MS);
}
