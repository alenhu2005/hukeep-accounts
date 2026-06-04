import {
  API_URL,
  API_URL_SOURCE,
  APP_BUILD_ID,
  CLIENT_DATA_SCHEMA_KEY,
  CLIENT_DATA_SCHEMA_VERSION,
  POLL_MS,
  SYNC_LAST_AT_KEY,
} from './config.js';
import { appState } from './state.js';
import { postOutboxLength } from './offline-queue.js';
import { esc, toast } from './utils.js';

function formatTime(ms) {
  if (!ms || !Number.isFinite(ms)) return '無';
  return new Date(ms).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
}

function redactUrl(url) {
  try {
    const u = new URL(url);
    const id = u.pathname.split('/').filter(Boolean).at(-2) || '';
    const tail = id ? `${id.slice(0, 6)}…${id.slice(-4)}` : '';
    return `${u.origin}/macros/s/${tail}/exec`;
  } catch {
    return String(url || '');
  }
}

async function readVersionInfo() {
  try {
    const res = await fetch(new URL('version.json', document.baseURI), { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function readCacheNames() {
  try {
    if (!window.caches?.keys) return [];
    return await caches.keys();
  } catch {
    return [];
  }
}

function readStorageValue(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function buildDiagnosticsReport() {
  const version = await readVersionInfo();
  const cacheNames = await readCacheNames();
  const schema = readStorageValue(CLIENT_DATA_SCHEMA_KEY);
  const lastSync = appState.lastSyncAt || Number(readStorageValue(SYNC_LAST_AT_KEY) || 0);
  const controller = navigator.serviceWorker?.controller?.scriptURL || '無';
  return {
    appBuildId: APP_BUILD_ID,
    distCacheName: version?.cacheName || 'dev/unavailable',
    distBuiltAt: version?.builtAt || 'dev/unavailable',
    apiSource: API_URL_SOURCE,
    apiUrl: redactUrl(API_URL),
    syncStatus: appState.syncStatus || 'idle',
    lastSyncAt: formatTime(lastSync),
    outboxCount: postOutboxLength(),
    rowCount: appState.allRows.length,
    schemaWarningCount: appState.schemaWarnings?.length || 0,
    clientSchema: `${schema || '未設定'} / target ${CLIENT_DATA_SCHEMA_VERSION}`,
    pollMs: POLL_MS,
    serviceWorker: controller,
    cacheNames,
  };
}

function reportLines(report) {
  return [
    `Build: ${report.appBuildId}`,
    `Dist cache: ${report.distCacheName}`,
    `Built at: ${report.distBuiltAt}`,
    `API: ${report.apiSource} · ${report.apiUrl}`,
    `Sync: ${report.syncStatus} · ${report.lastSyncAt}`,
    `Rows: ${report.rowCount}`,
    `Schema warnings: ${report.schemaWarningCount}`,
    `Outbox: ${report.outboxCount}`,
    `Schema: ${report.clientSchema}`,
    `Poll: ${report.pollMs}ms`,
    `Service worker: ${report.serviceWorker}`,
    `Caches: ${report.cacheNames.join(', ') || '無'}`,
  ];
}

export async function renderDiagnosticsPanel() {
  const el = document.getElementById('diagnostics-panel');
  if (!el) return;
  const report = await buildDiagnosticsReport();
  el.innerHTML = `
    <div class="backup-panel-kicker">診斷</div>
    <div class="diagnostics-grid">
      <div><span>版本</span><b>${esc(report.appBuildId)}</b></div>
      <div><span>快取</span><b>${esc(report.distCacheName)}</b></div>
      <div><span>API</span><b>${esc(report.apiSource)}</b></div>
      <div><span>待同步</span><b>${report.outboxCount}</b></div>
      <div><span>資料列</span><b>${report.rowCount}</b></div>
      <div><span>schema 警告</span><b>${report.schemaWarningCount}</b></div>
      <div><span>schema</span><b>${esc(report.clientSchema)}</b></div>
    </div>
  `;
}

export async function copyDiagnosticsReport() {
  const report = await buildDiagnosticsReport();
  const text = ['記帳本診斷報告', ...reportLines(report)].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('已複製診斷報告');
  } catch {
    toast('無法複製診斷報告');
  }
}
