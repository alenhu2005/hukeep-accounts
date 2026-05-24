import { appState } from '../state.js';
import { DAILY_TYPES } from '../model.js';
import { normalizeDate } from '../time.js';
import { dedupeLedgerAddsById } from './shared.js';

// Historical backend bug left two voided settlement rows in the deployed current-state feed
// even though they are not part of the user's active sheet anymore. Suppress only those
// exact stale ids so normal withdrawn history continues to render.
const SUPPRESSED_DAILY_RECORD_IDS = new Set([
  '6b092322-c5ea-45ea-a1e5-4ead00a2b0be',
  '03dc65b4-218e-43c3-937b-8bd12b277d01',
]);

function shouldSuppressDailyRecord(record) {
  const id = record?.id != null ? String(record.id).trim() : '';
  return id && SUPPRESSED_DAILY_RECORD_IDS.has(id);
}

function isRowVoided(r, voidIds) {
  if (!r) return false;
  if (voidIds && voidIds.has(r.id)) return true;
  return r.voided === true || String(r.voided || '').trim().toLowerCase() === 'true';
}

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
      _voided: isRowVoided(r),
    })).filter(r => !shouldSuppressDailyRecord(r));
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
      let rec = isRowVoided(r, voidIds) ? { ...r, _voided: true } : r;
      if (editMap[r.id]) rec = { ...rec, ...editMap[r.id] };
      return rec;
    })
    .filter(r => !shouldSuppressDailyRecord(r))
    .slice();
  return stableDailyHistorySortFromRows(allRows, out);
}

export function getDailyRecords() {
  return getDailyRecordsFromRows(appState.allRows);
}
