import { appState } from '../state.js';
import { normalizeDate } from '../time.js';
import { parseArr, randomUniformIndex } from '../utils.js';
import { MEMBER_COLORS } from './member-selectors.js';
import { buildRenameMapFromRows, dedupeLedgerAddsById, resolveMemberName } from './shared.js';

function parseJsonArrayField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

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

  const renames = buildRenameMapFromRows(allRows);
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
  const currentRows = allRows.filter(
    r => r && r.type === 'trip' && r.action === 'add' && ('closed' in r || 'colorId' in r || 'cnyMode' in r),
  );
  if (currentRows.length > 0 && !allRows.some(r => r && r.type === 'trip' && (r.action === 'delete' || r.action === 'close' || r.action === 'reopen'))) {
    return currentRows.map(r => buildTripFromRows(r, allRows)).reverse();
  }

  const delIds = new Set(allRows.filter(r => r.type === 'trip' && r.action === 'delete').map(r => r.id));
  const adds = dedupeLedgerAddsById(allRows.filter(r => r.type === 'trip' && r.action === 'add' && !delIds.has(r.id)));
  return adds.map(r => buildTripFromRows(r, allRows)).reverse();
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
        const payers = parseJsonArrayField(r.payers);
        const splitDetails = parseJsonArrayField(r.splitDetails);
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

  const renames = buildRenameMapFromRows(allRows);
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
      const payers = parseJsonArrayField(r.payers);
      const splitDetails = parseJsonArrayField(r.splitDetails);
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

export function getTripColorFromRows(tripId, allRows = appState.allRows) {
  const id = tripId ?? '';
  const currentTrip = allRows.find(r => r && r.type === 'trip' && r.action === 'add' && r.id === id);
  const resolveColor = c =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? { id: c.id, bg: c.darkBg, fg: c.darkFg }
      : { id: c.id, bg: c.bg, fg: c.fg };
  if (currentTrip && currentTrip.colorId) {
    const inPalette = TRIP_COLORS.find(c => c.id === currentTrip.colorId);
    if (inPalette) return resolveColor(inPalette);
    const legacy = MEMBER_COLORS.find(c => c.id === currentTrip.colorId);
    if (legacy) return resolveColor(legacy);
  }
  let colorId = null;
  for (const r of allRows) {
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

export function getTripColor(tripId) {
  return getTripColorFromRows(tripId, appState.allRows);
}

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

  const renames = buildRenameMapFromRows(allRows);
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

  const renames = buildRenameMapFromRows(allRows);
  const voidIds = new Set(
    allRows.filter(r => r.type === 'tripSettlement' && (r.action === 'void' || r.action === 'delete')).map(r => r.id),
  );
  return allRows
    .filter(r => r.type === 'tripSettlement' && r.action === 'add' && r.tripId === tripId)
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
