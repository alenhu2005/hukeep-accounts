import { POLL_MS } from './config.js';
import { appState } from './state.js';
import { loadCache, loadData, clearLedgerLocalStorage } from './api.js';
import { render } from './render-registry.js';
import { updateThemeIcon } from './theme.js';
import { updateSyncUI } from './sync-ui.js';
import { registerOverlayFocusTrap } from './dialog-a11y.js';
import { initAmountInputs } from './amount-input.js';
import * as actions from './actions.js';
import { cancelDialog } from './dialog.js';
import { syncPausedForUserInput } from './sync-pause.js';
import { navigate } from './navigation.js';
import { getTripById } from './data.js';
import {
  persistSessionSnapshot,
  readSessionSnapshot,
  readLastRouteFromLocalStorage,
  applyAnalysisPeriodFromSnapshot,
} from './session-ui.js';

const COOLDOWN_MS = 30_000;
let lastSyncFinished = 0;
let hiddenAt = 0;
let navSyncTimer = 0;

function showUpdateBadge() {
  const el = document.getElementById('update-badge');
  if (!el) return;
  el.style.display = 'flex';
  el.classList.remove('update-badge--pop');
  void el.offsetWidth;
  el.classList.add('update-badge--pop');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.style.display = 'none';
    el.classList.remove('update-badge--pop');
  }, 3200);
}

function renderCurrentPage() {
  const y = window.scrollY;
  const id = document.activeElement && document.activeElement.id;
  render();
  requestAnimationFrame(() => {
    window.scrollTo(0, y);
    if (id) {
      const el = document.getElementById(id);
      if (el && typeof el.focus === 'function') {
        try { el.focus({ preventScroll: true }); } catch { el.focus(); }
      }
    }
  });
}

function withinCooldown() {
  return Date.now() - lastSyncFinished < COOLDOWN_MS;
}

async function pollForChanges(opts = {}) {
  if (document.hidden) return schedulePoll();
  if (syncPausedForUserInput()) { schedulePoll(); return; }
  if (opts.respectCooldown && withinCooldown()) { schedulePoll(); return; }

  let unchanged = true;
  try {
    unchanged = await loadData({ backgroundPoll: true });
  } catch {
    unchanged = true;
  }
  lastSyncFinished = Date.now();
  if (!unchanged) {
    renderCurrentPage();
    if (!opts.quiet) showUpdateBadge();
  }
  schedulePoll();
}

function schedulePoll() {
  clearTimeout(appState._pollTimer);
  appState._pollTimer = setTimeout(pollForChanges, POLL_MS);
}

function tryRestoreSessionFromStorage() {
  const fromSession = readSessionSnapshot();
  const fromDisk = readLastRouteFromLocalStorage();
  const s = fromSession && fromSession.page ? fromSession : fromDisk && fromDisk.page ? fromDisk : null;
  if (!s || !s.page) return false;

  applyAnalysisPeriodFromSnapshot(s);
  const useScroll = Boolean(fromSession && fromSession.page);
  const scrollY =
    useScroll && typeof s.scrollY === 'number' && Number.isFinite(s.scrollY) ? Math.max(0, s.scrollY) : 0;

  if (s.page === 'tripDetail') {
    if (!s.tripId || !getTripById(s.tripId)) {
      navigate('trips', null);
      return true;
    }
    navigate('tripDetail', s.tripId, { restoreScrollY: scrollY });
    return true;
  }
  if (s.page === 'trips' || s.page === 'analysis' || s.page === 'home') {
    navigate(s.page, null, { restoreScrollY: scrollY });
    return true;
  }
  return false;
}

function syncOnNavigate() {
  clearTimeout(navSyncTimer);
  navSyncTimer = setTimeout(() => {
    clearTimeout(appState._pollTimer);
    pollForChanges({ quiet: true, respectCooldown: true });
  }, 350);
}

function initBottomNavTouchNavigate() {
  const pairs = [
    ['nav-home', 'home'],
    ['nav-trips', 'trips'],
    ['nav-analysis', 'analysis'],
  ];
  for (const [id, page] of pairs) {
    const el = document.getElementById(id);
    if (!el) continue;
    const clearPress = () => el.classList.remove('nav-btn--pressed');
    el.addEventListener(
      'touchstart',
      e => {
        e.preventDefault();
        el.classList.add('nav-btn--pressed');
        navigate(page);
        syncOnNavigate();
      },
      { passive: false },
    );
    el.addEventListener('touchend', clearPress);
    el.addEventListener('touchcancel', clearPress);
    el.addEventListener('click', () => syncOnNavigate());
  }
}

export async function initApp() {
  updateThemeIcon();
  loadCache();
  updateSyncUI();

  if (!tryRestoreSessionFromStorage()) {
    navigate('home');
  }

  registerOverlayFocusTrap('edit-overlay', {
    closeFn: () => actions.closeEditRecord(),
    panelSelector: '.edit-dialog',
  });
  registerOverlayFocusTrap('dialog-overlay', {
    closeFn: () => cancelDialog(),
    panelSelector: '.dialog',
  });
  registerOverlayFocusTrap('backup-overlay', {
    closeFn: () => actions.closeBackupMenu(),
    panelSelector: '.backup-dialog',
  });

  initAmountInputs();

  const unchangedAfterFetch = await loadData();
  lastSyncFinished = Date.now();
  if (!unchangedAfterFetch) renderCurrentPage();
  schedulePoll();

  window.addEventListener('pagehide', () => persistSessionSnapshot());

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      clearTimeout(appState._pollTimer);
      const away = Date.now() - hiddenAt;
      if (away > 30_000 && !syncPausedForUserInput()) {
        pollForChanges({ quiet: true });
      } else {
        schedulePoll();
      }
    } else {
      hiddenAt = Date.now();
      clearTimeout(appState._pollTimer);
    }
  });

  initBottomNavTouchNavigate();
}
