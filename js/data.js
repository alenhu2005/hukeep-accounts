import { appState } from './state.js';
import { DAILY_TYPES, TRIP_TYPES } from './model.js';
import { normalizeDate } from './time.js';
import { parseArr, randomUniformIndex } from './utils.js';
import { USER_A, USER_B } from './config.js';

/**
 * 試算表／重試 POST 可能造成同一 id 多筆 add；顯示與結算只保留第一筆。
 * @param {import('./model.js').LedgerRow[]} addRows
 */
function dedupeLedgerAddsById(addRows) {
  const seen = new Set();
  const out = [];
  for (const r of addRows) {
    const id = r?.id != null ? String(r.id).trim() : '';
    if (!id) {
      out.push(r);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

function hasLegacyDailyEvents(allRows) {
  return allRows.some(
    r => r && DAILY_TYPES.has(r.type) && (r.action === 'edit' || r.action === 'void' || r.action === 'delete'),
  );
}

function hasLegacyTripEvents(allRows) {
  return allRows.some(
    r =>
      r &&
      (r.type === 'tripExpense' || r.type === 'trip' || r.type === 'tripSettlement' || r.type === 'tripMember') &&
      (r.action === 'edit' ||
        r.action === 'void' ||
        r.action === 'delete' ||
        r.action === 'close' ||
        r.action === 'reopen' ||
        r.action === 'setColor' ||
        r.action === 'enableCnyMode' ||
        r.action === 'add' ||
        r.action === 'remove'),
  );
}

/**
 * 由事件列推導日常帳顯示用紀錄（不依賴 appState）。
 * @param {import('./model.js').LedgerRow[]} allRows
 */
export function getDailyRecordsFromRows(allRows) {
  if (!hasLegacyDailyEvents(allRows)) {
    return dedupeLedgerAddsById(
      allRows.filter(r => r && DAILY_TYPES.has(r.type)),
    )
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

/**
 * @param {import('./model.js').LedgerRow} tripRow
 * @param {import('./model.js').LedgerRow[]} allRows
 */
/** 試算表事件列是否曾寫入「開啟人民幣模式」（與舊版 localStorage 併用見 trip-cny-rate） */
export function tripCnyModeEnabledInRows(tripId, allRows) {
  const id = String(tripId || '').trim();
  if (!id || !Array.isArray(allRows)) return false;
  const current = allRows.find(r => r && r.type === 'trip' && String(r.id || '').trim() === id && 'cnyMode' in r);
  if (current) return !!current.cnyMode;
  return allRows.some(
    r =>
      r &&
      r.type === 'trip' &&
      r.action === 'enableCnyMode' &&
      String(r.id || '').trim() === id,
  );
}

export function buildTripFromRows(tripRow, allRows) {
  if ('closed' in tripRow || 'cnyMode' in tripRow || 'colorId' in tripRow) {
    return {
      id: tripRow.id,
      name: tripRow.name,
      members: [...new Set(parseArr(tripRow.members).filter(Boolean))],
      createdAt: tripRow.createdAt,
      _closed: !!tripRow.closed,
      cnyMode: !!tripRow.cnyMode,
      colorId: tripRow.colorId || '',
    };
  }

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
  const cnyMode = tripCnyModeEnabledInRows(tripRow.id, allRows);
  return { id: tripRow.id, name: tripRow.name, members, createdAt: tripRow.createdAt, _closed, cnyMode };
}

export function getTripsFromRows(allRows) {
  const currentRows = allRows.filter(r => r && r.type === 'trip' && r.action === 'add' && ('closed' in r || 'colorId' in r || 'cnyMode' in r));
  if (currentRows.length > 0 && !allRows.some(r => r && r.type === 'trip' && (r.action === 'delete' || r.action === 'close' || r.action === 'reopen'))) {
    return currentRows.map(r => buildTripFromRows(r, allRows)).reverse();
  }

  const delIds = new Set(allRows.filter(r => r.type === 'trip' && r.action === 'delete').map(r => r.id));
  const adds = dedupeLedgerAddsById(
    allRows.filter(r => r.type === 'trip' && r.action === 'add' && !delIds.has(r.id)),
  );
  return adds
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
  const row = appState.allRows.find(r => r && r.type === 'trip' && r.action === 'add' && r.id === id);
  return row ? buildTrip(row) : null;
}

/**
 * @param {string} tripId
 * @param {import('./model.js').LedgerRow[]} allRows
 */
export function getTripExpensesFromRows(tripId, allRows) {
  const currentRows = allRows.filter(
    r =>
      r &&
      r.type === 'tripExpense' &&
      r.action === 'add' &&
      r.tripId === tripId &&
      !allRows.some(x => x && x.type === 'tripExpense' && x.action === 'edit'),
  );
  if (currentRows.length > 0 && !allRows.some(r => r && r.type === 'tripExpense' && (r.action === 'void' || r.action === 'delete'))) {
    return dedupeLedgerAddsById(currentRows)
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
        let splitDetails = r.splitDetails;
        if (typeof splitDetails === 'string') {
          try {
            splitDetails = JSON.parse(splitDetails);
          } catch {
            splitDetails = null;
          }
        }
        if (!Array.isArray(splitDetails)) splitDetails = undefined;

        const rec = {
          ...r,
          amount: parseFloat(r.amount) || 0,
          splitAmong: parseArr(r.splitAmong),
          _voided: !!r.voided,
          ...(payers ? { payers } : {}),
          ...(splitDetails ? { splitDetails } : {}),
        };
        const cny = parseFloat(rec.amountCny);
        if (Number.isFinite(cny) && cny > 0) rec.amountCny = cny;
        else delete rec.amountCny;
        const fx = parseFloat(rec.fxFeeNtd);
        if (Number.isFinite(fx) && fx > 0) rec.fxFeeNtd = fx;
        else delete rec.fxFeeNtd;
        return rec;
      })
      .slice()
      .reverse();
  }

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
      ...(String(e.category ?? '').trim() !== '' ? { category: String(e.category).trim() } : {}),
      ...(e.amount !== undefined && e.amount !== null && e.amount !== ''
        ? { amount: Math.max(0, parseFloat(e.amount) || 0) }
        : {}),
      ...(e.fxFeeNtd !== undefined && e.fxFeeNtd !== null && e.fxFeeNtd !== ''
        ? { fxFeeNtd: Math.max(0, parseFloat(e.fxFeeNtd) || 0) }
        : {}),
      ...(e.amountCny !== undefined && e.amountCny !== null && String(e.amountCny).trim() !== ''
        ? (() => {
            const c = parseFloat(e.amountCny);
            return Number.isFinite(c) && c > 0 ? { amountCny: c } : {};
          })()
        : {}),
    };
  }
  const adds = dedupeLedgerAddsById(
    allRows.filter(
      r => r.type === 'tripExpense' && r.action === 'add' && r.tripId === tripId && !hardDelIds.has(r.id),
    ),
  );
  return adds
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
      let splitDetails = r.splitDetails;
      if (typeof splitDetails === 'string') {
        try {
          splitDetails = JSON.parse(splitDetails);
        } catch {
          splitDetails = null;
        }
      }
      if (!Array.isArray(splitDetails)) splitDetails = undefined;
      let rec = {
        ...r,
        amount: parseFloat(r.amount) || 0,
        splitAmong: parseArr(r.splitAmong).map(n => resolveMemberName(n, renames)),
        _voided: voidIds.has(r.id),
        ...(payers ? { payers } : {}),
        ...(splitDetails ? { splitDetails } : {}),
      };
      if (rec.paidBy) rec.paidBy = resolveMemberName(rec.paidBy, renames);
      if (Array.isArray(rec.payers)) {
        rec.payers = rec.payers.map(p => (p && p.name ? { ...p, name: resolveMemberName(p.name, renames) } : p));
      }
      if (Array.isArray(rec.splitDetails)) {
        rec.splitDetails = rec.splitDetails
          .map(s => ({
            name: resolveMemberName(String(s?.name || ''), renames),
            amount: parseFloat(s?.amount) || 0,
          }))
          .filter(s => s.name && s.amount > 0);
      }
      if (!payers) delete rec.payers;
      if (!splitDetails) delete rec.splitDetails;
      const cny = parseFloat(rec.amountCny);
      if (Number.isFinite(cny) && cny > 0) rec.amountCny = cny;
      else delete rec.amountCny;
      if (editMap[r.id]) rec = { ...rec, ...editMap[r.id] };
      rec.amount = parseFloat(rec.amount) || 0;
      const fxPost = parseFloat(rec.fxFeeNtd);
      if (Number.isFinite(fxPost) && fxPost > 0) rec.fxFeeNtd = fxPost;
      else delete rec.fxFeeNtd;
      return rec;
    })
    .slice()
    .reverse();
}

export function getTripExpenses(tripId) {
  return getTripExpensesFromRows(tripId, appState.allRows);
}

/**
 * 由事件列還原單筆出遊消費的新台幣總額變更順序（add 與各次 edit 含 amount 者，相鄰重複金額略過）。
 * @param {string} expenseId
 * @param {import('./model.js').LedgerRow[]} allRows
 * @returns {{ date: string; amount: number }[]}
 */
export function getTripExpenseAmountRevisionTrail(expenseId, allRows) {
  const id = String(expenseId || '').trim();
  if (!id || !Array.isArray(allRows)) return [];
  const current = allRows.find(r => r && r.type === 'tripExpense' && r.action === 'add' && String(r.id || '').trim() === id);
  if (current && !allRows.some(r => r && r.type === 'tripExpense' && r.action === 'edit')) {
    const amount = Math.round(Math.max(0, parseFloat(current.amount) || 0));
    return amount > 0 ? [{ date: current.date ? String(current.date).slice(0, 10) : '', amount }] : [];
  }
  const match = row =>
    row && row.type === 'tripExpense' && String(row.id || '').trim() === id;

  const trail = [];
  const add = allRows.find(r => match(r) && r.action === 'add');
  if (add && add.amount != null && String(add.amount).trim() !== '') {
    const a = Math.round(Math.max(0, parseFloat(add.amount) || 0));
    trail.push({ date: add.date ? String(add.date).slice(0, 10) : '', amount: a });
  }

  for (const e of allRows) {
    if (!match(e) || e.action !== 'edit') continue;
    if (e.amount === undefined || e.amount === null || String(e.amount).trim() === '') continue;
    const a = Math.round(Math.max(0, parseFloat(e.amount) || 0));
    const prev = trail[trail.length - 1];
    if (prev && prev.amount === a) continue;
    trail.push({ date: e.date ? String(e.date).slice(0, 10) : '', amount: a });
  }

  return trail;
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

// Easter eggs: hidden colors (not in the 16-color cycle)
export const HIDDEN_MEMBER_COLORS = [
  { id: 'hidden-neon', label: '霓虹青', styleKey: 'neon', bg: '#ecfeff', fg: '#22d3ee', darkBg: '#042f2e', darkFg: '#67e8f9' },
  { id: 'hidden-gold', label: '流金', styleKey: 'gold', bg: '#fff4b0', fg: '#b45309', darkBg: '#2b1600', darkFg: '#fcd34d' },
  { id: 'hidden-cosmic', label: '星際紫', styleKey: 'cosmic', bg: '#f5f3ff', fg: '#7c3aed', darkBg: '#12002b', darkFg: '#c4b5fd' },
  { id: 'hidden-lava', label: '熔岩橙', styleKey: 'lava', bg: '#fff7ed', fg: '#ea580c', darkBg: '#2a0a00', darkFg: '#fb923c' },
  { id: 'hidden-mint', label: '薄荷綠', styleKey: 'mint', bg: '#d1fae5', fg: '#047857', darkBg: '#052e24', darkFg: '#10b981' },
  { id: 'hidden-aurora', label: '極光', styleKey: 'aurora', bg: '#eef2ff', fg: '#6366f1', darkBg: '#0b102a', darkFg: '#a5b4fc' },
  { id: 'hidden-sakura', label: '櫻霧', styleKey: 'sakura', bg: '#fff1f2', fg: '#fb7185', darkBg: '#2a0a14', darkFg: '#fda4af' },
  { id: 'hidden-ice', label: '冰晶', styleKey: 'ice', bg: '#f0f9ff', fg: '#38bdf8', darkBg: '#062235', darkFg: '#7dd3fc' },
  { id: 'hidden-ink', label: '墨影', styleKey: 'ink', bg: '#f1f5f9', fg: '#0f172a', darkBg: '#020617', darkFg: '#e2e8f0' },
  { id: 'hidden-prism', label: '稜鏡', styleKey: 'prism', bg: '#fdf4ff', fg: '#e879f9', darkBg: '#1a0622', darkFg: '#f5d0fe' },
];

/** 隱藏色的視覺風格 key（用於套不同邊框/光暈） */
export function getHiddenMemberStyleKey(id) {
  const v = typeof id === 'string' ? id.trim() : '';
  if (!v) return '';
  const h = HIDDEN_MEMBER_COLORS.find(x => x.id === v);
  return h?.styleKey || '';
}

/** 行程地標／卡片色（5 色）；與成員 16 色分開 */
export const TRIP_COLORS = [
  MEMBER_COLORS.find(c => c.id === 'blue'),
  MEMBER_COLORS.find(c => c.id === 'emerald'),
  MEMBER_COLORS.find(c => c.id === 'amber'),
  MEMBER_COLORS.find(c => c.id === 'violet'),
  MEMBER_COLORS.find(c => c.id === 'rose'),
].filter(Boolean);

function tripIdHashDefaultColorIndex(tripId) {
  const id = tripId ?? '';
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return ((hash % TRIP_COLORS.length) + TRIP_COLORS.length) % TRIP_COLORS.length;
}

/**
 * 用於色盤：若舊資料 setColor 不在 TRIP_COLORS，則用 id 雜湊對應 5 色之一（與 getTripColor 預設一致）。
 * @param {string} tripId
 * @param {import('./model.js').LedgerRow[]} [allRows]
 */
export function getTripPaletteColorId(tripId, allRows = appState.allRows) {
  const id = tripId ?? '';
  const currentTrip = allRows.find(r => r && r.type === 'trip' && r.action === 'add' && r.id === id && r.colorId);
  if (currentTrip && TRIP_COLORS.some(c => c.id === currentTrip.colorId)) return currentTrip.colorId;
  let colorId = null;
  for (const r of allRows) {
    if (r && r.type === 'trip' && r.action === 'setColor' && r.id === id && r.colorId) {
      colorId = r.colorId;
    }
  }
  if (colorId && TRIP_COLORS.some(c => c.id === colorId)) return colorId;
  return TRIP_COLORS[tripIdHashDefaultColorIndex(id)].id;
}

/**
 * 現有行程在 5 色盤上佔用的 colorId（含無 setColor 時的雜湊預設），供新行程隨機選色時避開。
 * @param {import('./model.js').LedgerRow[]} allRows
 */
export function pickRandomTripColorId(allRows) {
  const tripAdds = allRows.filter(r => r && r.type === 'trip' && r.action === 'add');
  const used = new Set();
  for (const tr of tripAdds) {
    used.add(getTripPaletteColorId(tr.id, allRows));
  }
  const free = TRIP_COLORS.filter(c => !used.has(c.id));
  const pool = free.length ? free : TRIP_COLORS;
  return pool[randomUniformIndex(pool.length)].id;
}

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

  const pendingId = appState.pendingMemberColors?.[name];
  if (pendingId) {
    const pickedPending = [...MEMBER_COLORS, ...HIDDEN_MEMBER_COLORS].find(c => c.id === String(pendingId).trim());
    if (pickedPending) return resolveColor(pickedPending);
  }

  let colorId = null;
  for (const r of appState.allRows) {
    if (r && r.type === 'memberProfile' && r.memberName && r.colorId) {
      const who = resolveMemberName(r.memberName, renames);
      if (who === name) colorId = String(r.colorId).trim();
    }
  }
  const picked = colorId && [...MEMBER_COLORS, ...HIDDEN_MEMBER_COLORS].find(c => c.id === colorId);
  if (picked) return resolveColor(picked);

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return resolveColor(MEMBER_COLORS[((hash % MEMBER_COLORS.length) + MEMBER_COLORS.length) % MEMBER_COLORS.length]);
}

export function getMemberColorId(memberName) {
  const c = getMemberColor(memberName);
  return c?.id || '';
}

/** 是否為彩蛋隱藏色（用於 UI 加強樣式） */
export function isHiddenMemberColorId(id) {
  const v = typeof id === 'string' ? id.trim() : '';
  return !!v && HIDDEN_MEMBER_COLORS.some(h => h.id === v);
}

/** @returns {{ id: string, bg: string, fg: string }} */
export function getTripColor(tripId) {
  const id = tripId ?? '';
  const currentTrip = appState.allRows.find(r => r && r.type === 'trip' && r.action === 'add' && r.id === id);
  if (currentTrip && currentTrip.colorId) {
    const inPalette = TRIP_COLORS.find(c => c.id === currentTrip.colorId);
    if (inPalette) return resolveColor(inPalette);
    const legacy = MEMBER_COLORS.find(c => c.id === currentTrip.colorId);
    if (legacy) return resolveColor(legacy);
  }
  let colorId = null;
  for (const r of appState.allRows) {
    if (r && r.type === 'trip' && r.action === 'setColor' && r.id === id && r.colorId) {
      colorId = r.colorId;
    }
  }
  const inPalette = colorId && TRIP_COLORS.find(c => c.id === colorId);
  if (inPalette) return resolveColor(inPalette);
  const legacy = colorId && MEMBER_COLORS.find(c => c.id === colorId);
  if (legacy) return resolveColor(legacy);
  return resolveColor(TRIP_COLORS[tripIdHashDefaultColorIndex(id)]);
}

/**
 * 出遊還款紀錄（抵銷誰要付給誰的建議轉帳）。
 * @param {string} tripId
 * @param {import('./model.js').LedgerRow[]} allRows
 * @returns {{ from: string; to: string; amount: number }[]}
 */
export function getTripSettlementAdjustmentsFromRows(tripId, allRows) {
  if (!allRows.some(r => r && r.type === 'tripSettlement' && (r.action === 'void' || r.action === 'delete'))) {
    return allRows
      .filter(r => r && r.type === 'tripSettlement' && r.action === 'add' && r.tripId === tripId && !r.voided)
      .map(r => ({
        from: r.from,
        to: r.to,
        amount: parseFloat(r.amount) || 0,
      }));
  }

  const renames = buildRenameMap();
  const voidIds = new Set(
    allRows.filter(r => r.type === 'tripSettlement' && (r.action === 'void' || r.action === 'delete')).map(r => r.id),
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
 * 出遊還款紀錄列表（供歷史紀錄與編輯／撤回）。
 * @param {string} tripId
 * @param {import('./model.js').LedgerRow[]} allRows
 */
export function getTripSettlementDisplayRowsFromRows(tripId, allRows) {
  if (!allRows.some(r => r && r.type === 'tripSettlement' && (r.action === 'void' || r.action === 'delete'))) {
    return allRows
      .filter(r => r && r.type === 'tripSettlement' && r.action === 'add' && r.tripId === tripId)
      .map(r => ({
        type: 'tripSettlement',
        id: r.id,
        tripId: r.tripId,
        date: normalizeDate(r.date),
        from: r.from,
        to: r.to,
        amount: parseFloat(r.amount) || 0,
        _voided: !!r.voided,
      }))
      .slice()
      .reverse();
  }

  const renames = buildRenameMap();
  const voidIds = new Set(
    allRows.filter(r => r.type === 'tripSettlement' && (r.action === 'void' || r.action === 'delete')).map(r => r.id),
  );
  return allRows
    .filter(
      r =>
        r.type === 'tripSettlement' &&
        r.action === 'add' &&
        r.tripId === tripId,
    )
    .map(r => ({
      type: 'tripSettlement',
      id: r.id,
      tripId: r.tripId,
      date: normalizeDate(r.date),
      from: resolveMemberName(r.from, renames),
      to: resolveMemberName(r.to, renames),
      amount: parseFloat(r.amount) || 0,
      _voided: voidIds.has(r.id),
    }))
    .slice()
    .reverse();
}

/**
 * 收集所有曾出現的成員名稱（行程成員、頭像、日常使用者等）
 */
export function getKnownMemberNames() {
  const names = new Set();
  const deleted = new Set();
  for (const r of appState.allRows) {
    if (r.type === 'trip' && r.action === 'add' && r.members) {
      for (const m of parseArr(r.members)) names.add(m);
    }
    if (r.type === 'avatar' && r.memberName && inferAvatarScope(r.memberName, r.avatarScope || 'auto') === 'trip') {
      names.add(r.memberName);
    }
    if (r.type === 'memberProfile' && r.memberName) {
      names.add(r.memberName);
      if (r.deleted || r.action === 'delete') deleted.add(r.memberName);
      if (r.action === 'restore') deleted.delete(r.memberName);
    }
  }
  return [...names].filter(name => !deleted.has(name));
}

export { TRIP_TYPES, DAILY_TYPES };
