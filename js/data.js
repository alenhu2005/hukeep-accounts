import { appState } from './state.js';
import { DAILY_TYPES, TRIP_TYPES } from './model.js';
import { normalizeDate } from './time.js';
import { parseArr } from './utils.js';
import { USER_A, USER_B } from './config.js';

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
  const renames = buildRenameMap();
  let members = parseArr(tripRow.members);
  const events = allRows.filter(r => r.type === 'tripMember' && r.tripId === tripRow.id);
  for (const ev of events) {
    if (ev.action === 'add' && !members.includes(ev.memberName)) {
      members = [...members, ev.memberName];
    } else if (ev.action === 'remove') {
      members = members.filter(m => m !== ev.memberName);
    }
  }
  members = members.map(m => resolveMemberName(m, renames)).filter(Boolean);
  members = [...new Set(members)];
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
  const renames = buildRenameMap();
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
        splitAmong: parseArr(r.splitAmong).map(n => resolveMemberName(n, renames)),
        _voided: voidIds.has(r.id),
        ...(payers ? { payers } : {}),
      };
      if (rec.paidBy) rec.paidBy = resolveMemberName(rec.paidBy, renames);
      if (Array.isArray(rec.payers)) {
        rec.payers = rec.payers.map(p => (p && p.name ? { ...p, name: resolveMemberName(p.name, renames) } : p));
      }
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
  { id: 'sky',     bg: '#f0f9ff', fg: '#0ea5e9', darkBg: '#0c4a6e', darkFg: '#38bdf8' },
  { id: 'cyan',    bg: '#ecfeff', fg: '#06b6d4', darkBg: '#164e63', darkFg: '#22d3ee' },
  { id: 'teal',    bg: '#f0fdfa', fg: '#14b8a6', darkBg: '#134e4a', darkFg: '#2dd4bf' },
  { id: 'emerald', bg: '#ecfdf5', fg: '#10b981', darkBg: '#064e3b', darkFg: '#34d399' },
  { id: 'green',   bg: '#f0fdf4', fg: '#22c55e', darkBg: '#14532d', darkFg: '#4ade80' },
  { id: 'lime',    bg: '#f7fee7', fg: '#84cc16', darkBg: '#365314', darkFg: '#a3e635' },
  { id: 'yellow',  bg: '#fefce8', fg: '#eab308', darkBg: '#713f12', darkFg: '#fde047' },
  { id: 'amber',   bg: '#fffbeb', fg: '#f59e0b', darkBg: '#78350f', darkFg: '#fbbf24' },
  { id: 'orange',  bg: '#fff7ed', fg: '#f97316', darkBg: '#7c2d12', darkFg: '#fb923c' },
  { id: 'red',     bg: '#fef2f2', fg: '#ef4444', darkBg: '#7f1d1d', darkFg: '#f87171' },
  { id: 'rose',    bg: '#fff1f2', fg: '#f43f5e', darkBg: '#4c0519', darkFg: '#fb7185' },
  { id: 'pink',    bg: '#fdf2f8', fg: '#ec4899', darkBg: '#831843', darkFg: '#f472b6' },
  { id: 'fuchsia', bg: '#fdf4ff', fg: '#d946ef', darkBg: '#701a75', darkFg: '#e879f9' },
  { id: 'violet',  bg: '#f5f3ff', fg: '#8b5cf6', darkBg: '#2e1065', darkFg: '#a78bfa' },
  { id: 'slate',   bg: '#f1f5f9', fg: '#64748b', darkBg: '#1e293b', darkFg: '#94a3b8' },
];

export const TRIP_COLORS = MEMBER_COLORS;

/**
 * 全域成員頭像（每個成員最多以最後一次上傳為準）
 * @param {string} memberName
 * @returns {string|null}
 */
function inferAvatarScope(memberName, scope) {
  if (scope === 'trip' || scope === 'daily') return scope;
  const n = memberName ?? '';
  return n === USER_A || n === USER_B ? 'daily' : 'trip';
}

export function getAvatarUrlByMemberName(memberName, scope = 'auto') {
  const name = memberName ?? '';
  let last = null;
  const want = inferAvatarScope(name, scope);
  for (const r of appState.allRows) {
    if (!r || r.type !== 'avatar' || r.memberName !== name || !r.avatarUrl) continue;
    const rowScope = inferAvatarScope(r.memberName, r.avatarScope || 'auto');
    if (rowScope !== want) continue;
      last = r.avatarUrl;
  }
  return last;
}

function buildRenameMap() {
  const renames = new Map();
  for (const r of appState.allRows) {
    if (r && r.type === 'memberProfile' && r.action === 'rename' && r.memberName && r.newName) {
      renames.set(String(r.memberName), String(r.newName));
    }
  }
  return renames;
}

function resolveMemberName(name, renames) {
  let cur = String(name ?? '');
  const visited = new Set();
  while (renames.has(cur) && !visited.has(cur)) {
    visited.add(cur);
    cur = renames.get(cur);
  }
  return cur;
}

function isDark() {
  return document.documentElement.classList.contains('dark');
}

function resolveColor(c) {
  return isDark() ? { id: c.id, bg: c.darkBg, fg: c.darkFg } : { id: c.id, bg: c.bg, fg: c.fg };
}

/** @returns {{ id: string, bg: string, fg: string }} */
export function getMemberColor(memberName) {
  const renames = buildRenameMap();
  const name = resolveMemberName(memberName ?? '', renames);

  let colorId = null;
  for (const r of appState.allRows) {
    if (r && r.type === 'memberProfile' && r.action === 'setColor' && r.memberName && r.colorId) {
      const who = resolveMemberName(r.memberName, renames);
      if (who === name) colorId = String(r.colorId);
    }
  }
  const picked = colorId && MEMBER_COLORS.find(c => c.id === colorId);
  if (picked) return resolveColor(picked);

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return resolveColor(MEMBER_COLORS[((hash % MEMBER_COLORS.length) + MEMBER_COLORS.length) % MEMBER_COLORS.length]);
}

export function getMemberColorId(memberName) {
  const c = getMemberColor(memberName);
  return c?.id || '';
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
  const renames = buildRenameMap();
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
      from: resolveMemberName(r.from, renames),
      to: resolveMemberName(r.to, renames),
      amount: parseFloat(r.amount) || 0,
    }));
}

/**
 * 收集所有曾出現的成員名稱（行程成員、頭像、日常使用者等）
 */
export function getKnownMemberNames() {
  const renames = buildRenameMap();
  const names = new Set();
  const deleted = new Set();
  for (const r of appState.allRows) {
    if (r.type === 'trip' && r.action === 'add' && r.members) {
      for (const m of parseArr(r.members)) names.add(m);
    }
    if (r.type === 'tripMember' && r.action === 'add' && r.memberName) {
      names.add(r.memberName);
    }
    if (r.type === 'avatar' && r.memberName && inferAvatarScope(r.memberName, r.avatarScope || 'auto') === 'trip') {
      names.add(r.memberName);
    }
    if (r.type === 'memberProfile' && r.action === 'delete' && r.memberName) {
      deleted.add(r.memberName);
    }
    if (r.type === 'memberProfile' && r.action === 'restore' && r.memberName) {
      deleted.delete(r.memberName);
    }
  }
  const result = [];
  const seen = new Set();
  for (const n of names) {
    if (deleted.has(n)) continue;
    const display = resolveMemberName(n, renames);
    if (!seen.has(display)) { seen.add(display); result.push(display); }
  }
  return result;
}

export { TRIP_TYPES, DAILY_TYPES };
