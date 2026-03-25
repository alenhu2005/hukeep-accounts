import { appState } from './state.js';
import { DAILY_TYPES, TRIP_TYPES } from './model.js';
import { normalizeDate } from './time.js';
import { parseArr } from './utils.js';

export function getDailyRecords() {
  const { allRows } = appState;
  const hardDelIds = new Set(
    allRows.filter(r => DAILY_TYPES.has(r.type) && r.action === 'delete').map(r => r.id),
  );
  const voidIds = new Set(allRows.filter(r => DAILY_TYPES.has(r.type) && r.action === 'void').map(r => r.id));
  const editMap = {};
  for (const e of allRows.filter(r => DAILY_TYPES.has(r.type) && r.action === 'edit')) {
    editMap[e.id] = {
      date: normalizeDate(e.date),
      note: e.note ?? '',
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

export function getTrips() {
  const delIds = new Set(appState.allRows.filter(r => r.type === 'trip' && r.action === 'delete').map(r => r.id));
  return appState.allRows
    .filter(r => r.type === 'trip' && r.action === 'add' && !delIds.has(r.id))
    .map(r => buildTrip(r))
    .reverse();
}

export function buildTrip(tripRow) {
  let members = parseArr(tripRow.members);
  const events = appState.allRows.filter(r => r.type === 'tripMember' && r.tripId === tripRow.id);
  for (const ev of events) {
    if (ev.action === 'add' && !members.includes(ev.memberName)) {
      members = [...members, ev.memberName];
    } else if (ev.action === 'remove') {
      members = members.filter(m => m !== ev.memberName);
    }
  }
  const closeEvents = appState.allRows.filter(
    r => r.type === 'trip' && (r.action === 'close' || r.action === 'reopen') && r.id === tripRow.id,
  );
  const lastCloseEvent = closeEvents[closeEvents.length - 1];
  const _closed = lastCloseEvent ? lastCloseEvent.action === 'close' : false;
  return { id: tripRow.id, name: tripRow.name, members, createdAt: tripRow.createdAt, _closed };
}

export function getTripById(id) {
  const row = appState.allRows.find(r => r.type === 'trip' && r.action === 'add' && r.id === id);
  if (!row) return null;
  const delIds = new Set(appState.allRows.filter(r => r.type === 'trip' && r.action === 'delete').map(r => r.id));
  return delIds.has(id) ? null : buildTrip(row);
}

export function getTripExpenses(tripId) {
  const { allRows } = appState;
  const hardDelIds = new Set(
    allRows.filter(r => r.type === 'tripExpense' && r.action === 'delete').map(r => r.id),
  );
  const voidIds = new Set(allRows.filter(r => r.type === 'tripExpense' && r.action === 'void').map(r => r.id));
  const editMap = {};
  for (const e of allRows.filter(r => r.type === 'tripExpense' && r.action === 'edit')) {
    editMap[e.id] = {
      date: normalizeDate(e.date),
      note: e.note ?? '',
      ...(e.category !== undefined ? { category: e.category } : {}),
    };
  }
  return allRows
    .filter(
      r => r.type === 'tripExpense' && r.action === 'add' && r.tripId === tripId && !hardDelIds.has(r.id),
    )
    .map(r => {
      let rec = {
        ...r,
        amount: parseFloat(r.amount) || 0,
        splitAmong: parseArr(r.splitAmong),
        _voided: voidIds.has(r.id),
      };
      if (editMap[r.id]) rec = { ...rec, ...editMap[r.id] };
      return rec;
    })
    .slice()
    .reverse();
}

export { TRIP_TYPES, DAILY_TYPES };
