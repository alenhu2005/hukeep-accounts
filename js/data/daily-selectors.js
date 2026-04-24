import { appState } from '../state.js';
import { DAILY_TYPES } from '../model.js';
import { normalizeDate } from '../time.js';
import { dedupeLedgerAddsById } from './shared.js';

function hasLegacyDailyEvents(allRows) {
  return allRows.some(
    r => r && DAILY_TYPES.has(r.type) && (r.action === 'edit' || r.action === 'void' || r.action === 'delete'),
  );
}

function stableDailyHistorySortFromRows(allRows, records) {
  const indexById = new Map();
  let anonIndex = 0;
  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];
    if (!r || !DAILY_TYPES.has(r.type)) continue;
    const id = r.id != null ? String(r.id).trim() : '';
    if (!id) continue;
    if (!indexById.has(id)) indexById.set(id, i);
  }
  return records
    .map(r => {
      const id = r?.id != null ? String(r.id).trim() : '';
      const idx = id && indexById.has(id) ? indexById.get(id) : 1_000_000_000 + anonIndex++;
      return { r, idx };
    })
    .sort((a, b) => {
      const da = a.r?.date != null ? String(a.r.date) : '';
      const db = b.r?.date != null ? String(b.r.date) : '';
      if (da !== db) return da < db ? 1 : -1; // date desc
      const ta = a.r?._clientPostedAt != null ? String(a.r._clientPostedAt) : '';
      const tb = b.r?._clientPostedAt != null ? String(b.r._clientPostedAt) : '';
      if (ta !== tb) return ta < tb ? 1 : -1; // time desc (HH:MM:SS)
      return b.idx - a.idx; // same day: later rows first (best available without time-of-day)
    })
    .map(x => x.r);
}

/**
 * 由事件列推導日常帳顯示用紀錄（不依賴 appState）。
 * @param {import('../model.js').LedgerRow[]} allRows
 */
export function getDailyRecordsFromRows(allRows) {
  if (!hasLegacyDailyEvents(allRows)) {
    const out = dedupeLedgerAddsById(allRows.filter(r => r && DAILY_TYPES.has(r.type))).map(r => ({
      ...r,
      _voided: !!r.voided,
    }));
    return stableDailyHistorySortFromRows(allRows, out);
  }

  const hardDelIds = new Set(
    allRows.filter(r => DAILY_TYPES.has(r.type) && r.action === 'delete').map(r => r.id),
  );
  const voidIds = new Set(allRows.filter(r => DAILY_TYPES.has(r.type) && r.action === 'void').map(r => r.id));
  const editMap = {};
  for (const e of allRows.filter(r => DAILY_TYPES.has(r.type) && r.action === 'edit')) {
    editMap[e.id] = {
      date: normalizeDate(e.date),
      note: e.note ?? '',
      ...(e.photoUrl !== undefined ? { photoUrl: e.photoUrl } : {}),
      ...(e.photoFileId !== undefined ? { photoFileId: e.photoFileId } : {}),
      ...(String(e.category ?? '').trim() !== '' ? { category: String(e.category).trim() } : {}),
    };
  }
  const adds = dedupeLedgerAddsById(
    allRows.filter(r => DAILY_TYPES.has(r.type) && r.action === 'add' && !hardDelIds.has(r.id)),
  );
  const out = adds
    .map(r => {
      let rec = voidIds.has(r.id) ? { ...r, _voided: true } : r;
      if (editMap[r.id]) rec = { ...rec, ...editMap[r.id] };
      return rec;
    })
    .slice();
  return stableDailyHistorySortFromRows(allRows, out);
}

export function getDailyRecords() {
  return getDailyRecordsFromRows(appState.allRows);
}
