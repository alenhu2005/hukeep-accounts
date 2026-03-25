import { POLL_MS } from './config.js';
import { appState } from './state.js';
import { loadCache, loadData } from './api.js';
import { render } from './render-registry.js';
import { updateThemeIcon } from './theme.js';

function rowSignature() {
  return appState.allRows.length + '|' + (appState.allRows[appState.allRows.length - 1]?.id ?? '');
}

function showUpdateBadge() {
  const el = document.getElementById('update-badge');
  if (!el) return;
  el.style.display = 'flex';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.style.display = 'none';
  }, 3000);
}

async function pollForChanges() {
  if (document.hidden) return schedulePoll();
  const before = rowSignature();
  try {
    await loadData();
  } catch {
    /* ignore */
  }
  if (rowSignature() !== before) {
    render();
    showUpdateBadge();
  }
  schedulePoll();
}

function schedulePoll() {
  clearTimeout(appState._pollTimer);
  appState._pollTimer = setTimeout(pollForChanges, POLL_MS);
}

function setSyncing(on) {
  let el = document.getElementById('sync-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sync-indicator';
    el.style.cssText =
      'position:fixed;top:10px;right:10px;z-index:500;' +
      'background:rgba(0,0,0,.65);color:#fff;border-radius:8px;' +
      'padding:4px 10px;font-size:11px;display:flex;align-items:center;gap:6px;';
    el.innerHTML =
      '<span class="spinner" style="width:12px;height:12px;border-width:2px"></span>同步中…';
    document.body.appendChild(el);
  }
  el.style.display = on ? 'flex' : 'none';
}

export async function initApp() {
  updateThemeIcon();
  loadCache();
  render();
  setSyncing(true);
  await loadData();
  setSyncing(false);
  render();
  schedulePoll();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      clearTimeout(appState._pollTimer);
      pollForChanges();
    } else {
      clearTimeout(appState._pollTimer);
    }
  });
}
