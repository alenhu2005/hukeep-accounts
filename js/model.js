import { normalizeDate } from './time.js';

export const TRIP_TYPES = new Set(['trip', 'tripMember', 'tripExpense']);
export const DAILY_TYPES = new Set(['daily', 'settlement']);

export function isDailyRow(r) {
  return r && DAILY_TYPES.has(r.type);
}
export function isTripRow(r) {
  return r && TRIP_TYPES.has(r.type);
}

export function normalizeRow(r) {
  if (!r || !r.type) return r;
  if (r.type === 'daily') {
    r.item = r.item ?? '';
    r.paidBy = r.paidBy ?? '';
    r.splitMode = r.splitMode ?? '均分';
    r.date = normalizeDate(r.date);
    r.amount = r.amount ?? 0;
    r.note = r.note || '';
    r.category = typeof r.category === 'string' ? r.category.trim() : '';
  } else if (r.type === 'settlement') {
    r.item = '還款';
    r.paidBy = r.paidBy ?? '';
    r.date = normalizeDate(r.date);
    r.amount = r.amount ?? 0;
  } else if (r.type === 'trip') {
    r.name = r.name ?? (r.item || '');
    r.createdAt = r.createdAt ?? (r.date || '');
    r.members = r.members ?? (r.splitMode || '[]');
  } else if (r.type === 'tripMember') {
    r.tripId = r.tripId ?? (r.id || '');
    r.memberName = r.memberName ?? (r.date || '');
  } else if (r.type === 'tripExpense') {
    if (r.tripId == null || r.splitAmong == null) {
      const sm = r.splitMode || '';
      const sep = sm.indexOf('::');
      r.tripId = r.tripId ?? (sep >= 0 ? sm.slice(0, sep) : '');
      r.splitAmong = r.splitAmong ?? (sep >= 0 ? sm.slice(sep + 2) : '[]');
    }
    r.item = r.item ?? '';
    r.paidBy = r.paidBy ?? '';
    r.amount = r.amount ?? 0;
    r.date = normalizeDate(r.date);
    r.note = r.note || '';
    r.category = typeof r.category === 'string' ? r.category.trim() : '';
    if (typeof r.payers === 'string') {
      try {
        r.payers = JSON.parse(r.payers);
      } catch {
        r.payers = null;
      }
    }
  }
  return r;
}
