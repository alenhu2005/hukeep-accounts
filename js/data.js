import { appState } from './state.js';
import { DAILY_TYPES, TRIP_TYPES } from './model.js';
import { normalizeDate } from './time.js';
import { parseArr } from './utils.js';

/**
 * 由事件列推導日常帳顯示用紀錄（不依賴 appState）。
 * @param {import('./model.js').LedgerRow[]} allRows
 */
export function getDailyRecordsFromRows(allRows) {
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
      ...(e.category !== undefined ? { category: e.category } : {}),
    };
  }
  return allRows
    .filter(r => DAILY_TYPES.has(r.type) && r.action === 'add' && !hardDelIds.has(r.id))
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

/**
 * @param {import('./model.js').LedgerRow} tripRow
 * @param {import('./model.js').LedgerRow[]} allRows
 */
export function buildTripFromRows(tripRow, allRows) {
  let members = parseArr(tripRow.members);
  const events = allRows.filter(r => r.type === 'tripMember' && r.tripId === tripRow.id);
  for (const ev of events) {
    if (ev.action === 'add' && !members.includes(ev.memberName)) {
      members = [...members, ev.memberName];
    } else if (ev.action === 'remove') {
      members = members.filter(m => m !== ev.memberName);
    }
  }
  const closeEvents = allRows.filter(
    r => r.type === 'trip' && (r.action === 'close' || r.action === 'reopen') && r.id === tripRow.id,
  );
  const lastCloseEvent = closeEvents[closeEvents.length - 1];
  const _closed = lastCloseEvent ? lastCloseEvent.action === 'close' : false;
  return { id: tripRow.id, name: tripRow.name, members, createdAt: tripRow.createdAt, _closed };
}

export function getTripsFromRows(allRows) {
  const delIds = new Set(allRows.filter(r => r.type === 'trip' && r.action === 'delete').map(r => r.id));
  return allRows
    .filter(r => r.type === 'trip' && r.action === 'add' && !delIds.has(r.id))
    .map(r => buildTripFromRows(r, allRows))
    .reverse();
}

export function getTrips() {
  return getTripsFromRows(appState.allRows);
}

export function buildTrip(tripRow) {
  return buildTripFromRows(tripRow, appState.allRows);
}

export function getTripById(id) {
  const row = appState.allRows.find(r => r.type === 'trip' && r.action === 'add' && r.id === id);
  if (!row) return null;
  const delIds = new Set(appState.allRows.filter(r => r.type === 'trip' && r.action === 'delete').map(r => r.id));
  return delIds.has(id) ? null : buildTrip(row);
}

/**
 * @param {string} tripId
 * @param {import('./model.js').LedgerRow[]} allRows
 */
export function getTripExpensesFromRows(tripId, allRows) {
  const hardDelIds = new Set(
    allRows.filter(r => r.type === 'tripExpense' && r.action === 'delete').map(r => r.id),
  );
  const voidIds = new Set(allRows.filter(r => r.type === 'tripExpense' && r.action === 'void').map(r => r.id));
  const editMap = {};
  for (const e of allRows.filter(r => r.type === 'tripExpense' && r.action === 'edit')) {
    editMap[e.id] = {
      date: normalizeDate(e.date),
      note: e.note ?? '',
      ...(e.photoUrl !== undefined ? { photoUrl: e.photoUrl } : {}),
      ...(e.photoFileId !== undefined ? { photoFileId: e.photoFileId } : {}),
      ...(e.category !== undefined ? { category: e.category } : {}),
    };
  }
  return allRows
    .filter(
      r => r.type === 'tripExpense' && r.action === 'add' && r.tripId === tripId && !hardDelIds.has(r.id),
    )
    .map(r => {
      let payers = r.payers;
      if (typeof payers === 'string') {
        try {
          payers = JSON.parse(payers);
        } catch {
          payers = null;
        }
      }
      if (!Array.isArray(payers)) payers = undefined;
      let rec = {
        ...r,
        amount: parseFloat(r.amount) || 0,
        splitAmong: parseArr(r.splitAmong),
        _voided: voidIds.has(r.id),
        ...(payers ? { payers } : {}),
      };
      if (!payers) delete rec.payers;
      if (editMap[r.id]) rec = { ...rec, ...editMap[r.id] };
      return rec;
    })
    .slice()
    .reverse();
}

export function getTripExpenses(tripId) {
  return getTripExpensesFromRows(tripId, appState.allRows);
}

export const MEMBER_COLORS = [
  { id: 'blue',    bg: '#eff6ff', fg: '#3b82f6', darkBg: '#1e3a5f', darkFg: '#60a5fa' },
  { id: 'emerald', bg: '#ecfdf5', fg: '#10b981', darkBg: '#064e3b', darkFg: '#34d399' },
  { id: 'amber',   bg: '#fffbeb', fg: '#f59e0b', darkBg: '#78350f', darkFg: '#fbbf24' },
  { id: 'rose',    bg: '#fff1f2', fg: '#f43f5e', darkBg: '#4c0519', darkFg: '#fb7185' },
  { id: 'violet',  bg: '#f5f3ff', fg: '#8b5cf6', darkBg: '#2e1065', darkFg: '#a78bfa' },
  { id: 'sky',     bg: '#f0f9ff', fg: '#0ea5e9', darkBg: '#0c4a6e', darkFg: '#38bdf8' },
  { id: 'slate',   bg: '#f1f5f9', fg: '#64748b', darkBg: '#1e293b', darkFg: '#94a3b8' },
];

export const TRIP_COLORS = MEMBER_COLORS;

/**
 * 全域成員頭像（每個成員最多以最後一次上傳為準）
 * @param {string} memberName
 * @returns {string|null}
 */
export function getAvatarUrlByMemberName(memberName) {
  const name = memberName ?? '';
  let last = null;
  for (const r of appState.allRows) {
    if (r && r.type === 'avatar' && r.memberName === name && r.avatarUrl) {
      last = r.avatarUrl;
    }
  }
  return last;
}

function isDark() {
  return document.documentElement.classList.contains('dark');
}

function resolveColor(c) {
  return isDark() ? { id: c.id, bg: c.darkBg, fg: c.darkFg } : { id: c.id, bg: c.bg, fg: c.fg };
}

/** @returns {{ id: string, bg: string, fg: string }} */
export function getMemberColor(memberName) {
  const name = memberName ?? '';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return resolveColor(MEMBER_COLORS[((hash % MEMBER_COLORS.length) + MEMBER_COLORS.length) % MEMBER_COLORS.length]);
}

/** @returns {{ id: string, bg: string, fg: string }} */
export function getTripColor(tripId) {
  const id = tripId ?? '';
  let colorId = null;
  for (const r of appState.allRows) {
    if (r && r.type === 'trip' && r.action === 'setColor' && r.id === id && r.colorId) {
      colorId = r.colorId;
    }
  }
  const found = colorId && TRIP_COLORS.find(c => c.id === colorId);
  if (found) return resolveColor(found);
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return resolveColor(TRIP_COLORS[((hash % TRIP_COLORS.length) + TRIP_COLORS.length) % TRIP_COLORS.length]);
}

/**
 * 出遊還款紀錄（抵銷誰要付給誰的建議轉帳）。
 * @param {string} tripId
 * @param {import('./model.js').LedgerRow[]} allRows
 * @returns {{ from: string; to: string; amount: number }[]}
 */
export function getTripSettlementAdjustmentsFromRows(tripId, allRows) {
  const voidIds = new Set(
    allRows.filter(r => r.type === 'tripSettlement' && r.action === 'void').map(r => r.id),
  );
  return allRows
    .filter(
      r =>
        r.type === 'tripSettlement' &&
        r.action === 'add' &&
        r.tripId === tripId &&
        !voidIds.has(r.id),
    )
    .map(r => ({
      from: r.from,
      to: r.to,
      amount: parseFloat(r.amount) || 0,
    }));
}

/**
 * 收集所有曾出現的成員名稱（行程成員、頭像、日常使用者等）
 */
export function getKnownMemberNames() {
  const names = new Set();
  const deleted = new Set();
  const renames = new Map();
  for (const r of appState.allRows) {
    if (r.type === 'trip' && r.action === 'add' && r.members) {
      for (const m of parseArr(r.members)) names.add(m);
    }
    if (r.type === 'tripMember' && r.action === 'add' && r.memberName) {
      names.add(r.memberName);
    }
    if (r.type === 'avatar' && r.memberName) {
      names.add(r.memberName);
    }
    if (r.type === 'memberProfile' && r.action === 'delete' && r.memberName) {
      deleted.add(r.memberName);
    }
    if (r.type === 'memberProfile' && r.action === 'restore' && r.memberName) {
      deleted.delete(r.memberName);
    }
    if (r.type === 'memberProfile' && r.action === 'rename' && r.memberName && r.newName) {
      renames.set(r.memberName, r.newName);
    }
  }
  const result = [];
  const seen = new Set();
  for (const n of names) {
    if (deleted.has(n)) continue;
    let display = n;
    let cur = n;
    const visited = new Set();
    while (renames.has(cur) && !visited.has(cur)) {
      visited.add(cur);
      cur = renames.get(cur);
      display = cur;
    }
    if (!seen.has(display)) { seen.add(display); result.push(display); }
  }
  return result;
}

export { TRIP_TYPES, DAILY_TYPES };
