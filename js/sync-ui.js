import { TIMEZONE } from './config.js';
import { appState } from './state.js';
import { postOutboxLength } from './offline-queue.js';

function formatTwTime(ms) {
  if (ms == null || Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleString('zh-TW', {
    timeZone: TIMEZONE,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 更新底部同步狀態列（依 appState.syncStatus / lastSyncAt） */
export function updateSyncUI() {
  const root = document.getElementById('sync-status-bar');
  if (!root) return;

  if (appState.syncStatus === 'idle') {
    root.style.display = 'none';
    return;
  }
  root.style.display = 'flex';

  const badge = root.querySelector('.sync-status-badge');
  const text = root.querySelector('.sync-status-text');
  if (!badge || !text) return;

  const last = appState.lastSyncAt;
  const lastStr = formatTwTime(last);

  const { syncStatus } = appState;
  if (syncStatus === 'syncing') {
    badge.textContent = '同步中';
    badge.className = 'sync-status-badge sync-status-badge--syncing';
    text.textContent = '與伺服端同步資料中…';
    return;
  }
  if (syncStatus === 'synced') {
    badge.textContent = '已同步';
    badge.className = 'sync-status-badge sync-status-badge--ok';
    text.textContent = lastStr ? `與試算表一致 · ${lastStr}` : '與試算表一致';
    return;
  }
  if (syncStatus === 'cache_only') {
    const n = postOutboxLength();
    const pendingBit = n > 0 ? ` · 待上傳 ${n} 筆` : '';
    badge.textContent = '僅快取';
    badge.className = 'sync-status-badge sync-status-badge--warn';
    text.textContent = lastStr
      ? `離線或連線失敗，顯示本機資料 · 上次成功同步 ${lastStr}${pendingBit}`
      : `離線或連線失敗，顯示本機資料（尚未成功同步過）${pendingBit}`;
    return;
  }
  if (syncStatus === 'error') {
    badge.textContent = '無法載入';
    badge.className = 'sync-status-badge sync-status-badge--err';
    text.textContent = '無法取得資料且無本機快取，請檢查網路與 GAS 網址';
    return;
  }
  badge.textContent = '';
  badge.className = 'sync-status-badge';
  text.textContent = '';
}
