import { appState } from './state.js';
import { navigate } from './navigation.js';
import { animateSyncedNoteTarget, isMotionEnabled } from './motion.js';
import { createNoteUpdateDetector } from './note-update-detector.js';
import { LEDGER_ROWS_SYNCED_EVENT } from './sync-events.js';

const AUTO_HIDE_MS = 10_000;
let initialized = false;
let detector = null;
let hideTimer = 0;
let pendingNotes = new Map();

function bannerElements() {
  return {
    banner: document.getElementById('note-update-banner'),
    title: document.getElementById('note-update-title'),
    summary: document.getElementById('note-update-summary'),
    view: document.getElementById('note-update-view'),
    close: document.getElementById('note-update-close'),
  };
}

function latestPendingNote() {
  return [...pendingNotes.values()].sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
}

function finishHide(banner) {
  banner.hidden = true;
  banner.setAttribute('aria-hidden', 'true');
  pendingNotes = new Map();
}

function hideBanner({ immediate = false } = {}) {
  const { banner } = bannerElements();
  if (!banner || banner.hidden) return;
  clearTimeout(hideTimer);
  banner.classList.remove('is-visible');
  if (immediate || !isMotionEnabled()) {
    finishHide(banner);
    return;
  }
  const onEnd = (event) => {
    if (
      event.target === banner &&
      event.propertyName === 'transform' &&
      !banner.classList.contains('is-visible')
    ) {
      banner.removeEventListener('transitionend', onEnd);
      finishHide(banner);
    }
  };
  banner.addEventListener('transitionend', onEnd);
  window.setTimeout(() => {
    banner.removeEventListener('transitionend', onEnd);
    if (!banner.classList.contains('is-visible')) {
      finishHide(banner);
    }
  }, 740);
}

function showBanner(notes) {
  const { banner, title, summary } = bannerElements();
  if (!banner || !title || !summary) return;
  for (const note of notes) pendingNotes.set(note.id, note);
  const latest = latestPendingNote();
  if (!latest) return;

  title.textContent = latest.title || latest.body?.split('\n')[0] || '未命名記事';
  summary.textContent =
    pendingNotes.size > 1 ? `${pendingNotes.size} 則記事有更新` : '記事有新資料';
  clearTimeout(hideTimer);
  banner.hidden = false;
  banner.setAttribute('aria-hidden', 'false');
  banner.classList.remove('is-visible');
  requestAnimationFrame(() => banner.classList.add('is-visible'));
  hideTimer = window.setTimeout(() => hideBanner(), AUTO_HIDE_MS);
}

function scrollToLatestNote() {
  const target = latestPendingNote();
  if (!target) return hideBanner();
  const targetId = target.id;
  hideBanner({ immediate: true });
  appState.notesSearchQuery = '';
  appState.notesFilter = 'all';
  appState.expandedNoteId = targetId;
  navigate('notes');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const card = [...document.querySelectorAll('#notes-list .note-card[data-note-id]')].find(
        (element) => element.dataset.noteId === targetId,
      );
      if (!card) return;
      card.scrollIntoView({ behavior: isMotionEnabled() ? 'smooth' : 'auto', block: 'center' });
      animateSyncedNoteTarget(card);
      card.focus({ preventScroll: true });
    });
  });
}

function handleRowsSynced(event) {
  const previousRows = event.detail?.previousRows || [];
  const freshRows = event.detail?.freshRows || [];
  const updated = detector?.inspect(previousRows, freshRows) || [];
  if (updated.length) showBanner(updated);
}

export function initNoteUpdateNotifications(initialRows = []) {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  detector = createNoteUpdateDetector(initialRows);
  const { view, close } = bannerElements();
  view?.addEventListener('click', scrollToLatestNote);
  close?.addEventListener('click', () => hideBanner());
  window.addEventListener(LEDGER_ROWS_SYNCED_EVENT, handleRowsSynced);
}
