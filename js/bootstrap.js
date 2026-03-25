import { POLL_MS } from './config.js';
import { appState } from './state.js';
import { loadCache, loadData } from './api.js';
import { render } from './render-registry.js';
import { updateThemeIcon } from './theme.js';
import { updateSyncUI } from './sync-ui.js';
import { registerOverlayFocusTrap } from './dialog-a11y.js';
import { initAmountInputs } from './amount-input.js';
import * as actions from './actions.js';
import { cancelDialog } from './dialog.js';
import { isSyncPauseTarget, syncPausedForUserInput } from './sync-pause.js';
import { navigate } from './navigation.js';
import { getTripById } from './data.js';
import {
  persistSessionSnapshot,
  readSessionSnapshot,
  readLastRouteFromLocalStorage,
  applyAnalysisPeriodFromSnapshot,
} from './session-ui.js';

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

function renderWithScrollPreserved() {
  const y = window.scrollY;
  const id = document.activeElement && document.activeElement.id;
  render();
  requestAnimationFrame(() => {
    window.scrollTo(0, y);
    if (id) {
      const el = document.getElementById(id);
      if (el && typeof el.focus === 'function') {
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
      }
    }
  });
}

async function pollForChanges() {
  if (document.hidden) return schedulePoll();
  if (syncPausedForUserInput()) {
    schedulePoll();
    return;
  }
  let unchanged = true;
  try {
    unchanged = await loadData({ backgroundPoll: true });
  } catch {
    unchanged = true;
  }
  if (!unchanged) {
    renderWithScrollPreserved();
    showUpdateBadge();
  }
  schedulePoll();
}

function schedulePoll() {
  clearTimeout(appState._pollTimer);
  appState._pollTimer = setTimeout(pollForChanges, POLL_MS);
}

/**
 * 還原上次瀏覽畫面：優先同分頁 session（含捲動），否則用 localStorage 的上次頁面。
 * @returns {boolean} 是否已還原（已呼叫 navigate，不需再 render）
 */
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

/**
 * 手機觸控時以 touchstart 立即導覽，解決慣性滾動期間需點兩次的問題。
 * touchstart 比 pointerdown 更可靠地在 iOS 慣性捲動期間觸發。
 * preventDefault 阻止後續的 click 事件（避免重複導覽），滑鼠仍依 onclick。
 */
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
      },
      { passive: false },
    );
    el.addEventListener('touchend', clearPress);
    el.addEventListener('touchcancel', clearPress);
  }
}

export async function initApp() {
  updateThemeIcon();
  loadCache();
  updateSyncUI();
  render();

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
  if (!tryRestoreSessionFromStorage()) {
    if (!unchangedAfterFetch) render();
  }
  schedulePoll();

  window.addEventListener('pagehide', () => persistSessionSnapshot());

  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.addEventListener(
      'focusout',
      e => {
        if (!isSyncPauseTarget(e.target)) return;
        requestAnimationFrame(() => {
          if (syncPausedForUserInput()) return;
          clearTimeout(appState._pollTimer);
          pollForChanges();
        });
      },
      true,
    );
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      clearTimeout(appState._pollTimer);
      if (!syncPausedForUserInput()) {
        pollForChanges();
      } else {
        schedulePoll();
      }
    } else {
      clearTimeout(appState._pollTimer);
    }
  });

  initBottomNavTouchNavigate();
}
