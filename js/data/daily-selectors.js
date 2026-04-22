import { appState } from '../state.js';
import { DAILY_TYPES } from '../model.js';
import { normalizeDate } from '../time.js';
import { dedupeLedgerAddsById } from './shared.js';

function hasLegacyDailyEvents(allRows) {
  return allRows.some(
    r => r && DAILY_TYPES.has(r.type) && (r.action === 'edit' || r.action === 'void' || r.action === 'delete'),
  );
}

/**
 * 由事件列推導日常帳顯示用紀錄（不依賴 appState）。
 * @param {import('../model.js').LedgerRow[]} allRows
 */
export function getDailyRecordsFromRows(allRows) {
  if (!hasLegacyDailyEvents(allRows)) {
    return dedupeLedgerAddsById(allRows.filter(r => r && DAILY_TYPES.has(r.type)))
      .map(r => ({ ...r, _voided: !!r.voided }))
      .slice()
      .reverse();
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
  return adds
    .map(r => {
      let rec = voidIds.has(r.id) ? { ...r, _voided: true } : r;
      if (editMap[r.id]) rec = { ...rec, ...editMap[r.id] };
      return rec;
    })
    .slice()
    .reverse();
}

export function getDailyRecords() {
  return getDailyRecordsFromRows(appState.allRows);
}
