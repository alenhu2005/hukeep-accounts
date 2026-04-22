import { appState } from '../state.js';
import { getDailyRecords } from '../data.js';
import { computeBalance } from '../finance.js';
import { applyCurrentStatePayload, cloneRowsSnapshot } from '../current-state.js';


export function undoOptimisticPush(row) {
  const idx = appState.allRows.lastIndexOf(row);
  if (idx !== -1) appState.allRows.splice(idx, 1);
}

export function snapshotRows() {
  return cloneRowsSnapshot(appState.allRows);
}

export function restoreRowsSnapshot(snapshot) {
  appState.allRows = cloneRowsSnapshot(snapshot || []);
}

export function applyOptimisticPayload(payload, { pending = true } = {}) {
  applyCurrentStatePayload(appState.allRows, payload, { pending });
}

export function parseMoneyLike(v) {
  if (v == null) return 0;
  const compact = String(v).replace(/[^\d.]/g, '');
  const n = parseFloat(compact);
  return Number.isFinite(n) ? n : 0;
}

export function snapshotPendingHomeBalanceFromAbs() {
  const b = computeBalance(getDailyRecords());
  appState.pendingHomeBalanceFromAbs = b === 0 ? 0 : Math.round(Math.abs(b));
}

export async function fileToJpegDataUrl(file, { maxDim = 1024, quality = 0.78 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image load failed'));
      img.src = url;
    });

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('bad image dimensions');

    const scale = Math.min(1, maxDim / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unsupported');
    ctx.drawImage(img, 0, 0, outW, outH);

    // Use JPEG to reduce localStorage size vs raw PNG.
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
