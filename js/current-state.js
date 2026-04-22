import { DAILY_TYPES, normalizeRow } from './model.js';
import { parseArr } from './utils.js';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function trimString(value) {
  return value == null ? '' : String(value).trim();
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  const s = trimString(value).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

function ensureArray(value) {
  if (Array.isArray(value)) return value.slice();
  return parseArr(value);
}

function uniqueNames(names) {
  const out = [];
  const seen = new Set();
  for (const raw of names || []) {
    const name = trimString(raw);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function writeJsonArray(value) {
  return JSON.stringify(uniqueNames(ensureArray(value)));
}

function rowIndexByPredicate(rows, predicate) {
  for (let i = 0; i < rows.length; i++) {
    if (predicate(rows[i])) return i;
  }
  return -1;
}

function normalizeActiveRow(row, { pending = false } = {}) {
  const next = deepClone(row || {});

  if (next.type === 'trip' && !('action' in next)) next.action = 'add';
  if (next.type === 'daily' && !('action' in next)) next.action = 'add';
  if (next.type === 'settlement' && !('action' in next)) next.action = 'add';
  if (next.type === 'tripExpense' && !('action' in next)) next.action = 'add';
  if (next.type === 'tripSettlement' && !('action' in next)) next.action = 'add';

  if (next.type === 'daily' || next.type === 'settlement' || next.type === 'tripExpense' || next.type === 'tripSettlement') {
    next.voided = toBool(next.voided);
  }

  if (next.type === 'trip') {
    next.members = writeJsonArray(next.members);
    next.closed = toBool(next.closed);
    next.cnyMode = toBool(next.cnyMode);
    next.colorId = trimString(next.colorId);
  } else if (next.type === 'memberProfile') {
    next.memberName = trimString(next.memberName);
    next.colorId = trimString(next.colorId);
    next.deleted = toBool(next.deleted);
    delete next.action;
    delete next.newName;
  } else if (next.type === 'avatar') {
    next.memberName = trimString(next.memberName);
    next.avatarScope = trimString(next.avatarScope || 'auto') || 'auto';
    if (next.avatarDataUrl !== undefined && next.avatarUrl === undefined) {
      next.avatarUrl = next.avatarDataUrl;
    }
    delete next.avatarDataUrl;
    delete next.avatarFileId;
    next.avatarUrl = next.avatarUrl == null ? '' : String(next.avatarUrl);
    delete next.action;
  } else {
    if (next.photoDataUrl !== undefined && next.photoUrl === undefined) {
      next.photoUrl = next.photoDataUrl;
    }
    delete next.photoDataUrl;
  }

  if (pending) next._pendingSync = true;
  else delete next._pendingSync;

  return normalizeRow(next);
}

function findDailyLikeIndex(rows, id) {
  const key = trimString(id);
  return rowIndexByPredicate(rows, r => r && DAILY_TYPES.has(r.type) && trimString(r.id) === key);
}

function findIdIndex(rows, type, id) {
  const wantType = trimString(type);
  const key = trimString(id);
  return rowIndexByPredicate(rows, r => r && r.type === wantType && trimString(r.id) === key);
}

function findTripIndex(rows, tripId) {
  return findIdIndex(rows, 'trip', tripId);
}

function findMemberIndex(rows, memberName) {
  const key = trimString(memberName);
  return rowIndexByPredicate(rows, r => r && r.type === 'memberProfile' && trimString(r.memberName) === key);
}

function findAvatarIndex(rows, memberName, avatarScope) {
  const name = trimString(memberName);
  const scope = trimString(avatarScope || 'auto') || 'auto';
  return rowIndexByPredicate(
    rows,
    r => r && r.type === 'avatar' && trimString(r.memberName) === name && trimString(r.avatarScope || 'auto') === scope,
  );
}

function patchRow(row, patch, { pending = false } = {}) {
  const next = normalizeActiveRow({ ...row, ...patch }, { pending });
  Object.keys(row).forEach(key => delete row[key]);
  Object.assign(row, next);
}

function removeAt(rows, index) {
  if (index < 0 || index >= rows.length) return null;
  const [removed] = rows.splice(index, 1);
  return removed || null;
}

function removeById(rows, type, id) {
  const idx = findIdIndex(rows, type, id);
  return removeAt(rows, idx);
}

function setDailyLikeVoided(rows, id, voided, { pending = false } = {}) {
  const idx = findDailyLikeIndex(rows, id);
  if (idx === -1) return;
  patchRow(rows[idx], { voided: !!voided }, { pending });
}

function setVoidedById(rows, type, id, voided, { pending = false } = {}) {
  const idx = findIdIndex(rows, type, id);
  if (idx === -1) return;
  patchRow(rows[idx], { voided: !!voided }, { pending });
}

function removeTripCascade(rows, tripId) {
  const key = trimString(tripId);
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row) continue;
    if (row.type === 'trip' && trimString(row.id) === key) {
      rows.splice(i, 1);
      continue;
    }
    if ((row.type === 'tripExpense' || row.type === 'tripSettlement') && trimString(row.tripId) === key) {
      rows.splice(i, 1);
    }
  }
}

function renameInTripRow(row, oldName, newName) {
  const members = uniqueNames(
    ensureArray(row.members).map(name => (trimString(name) === oldName ? newName : trimString(name))),
  );
  row.members = JSON.stringify(members);
}

function renameInTripExpenseRow(row, oldName, newName) {
  if (trimString(row.paidBy) === oldName) row.paidBy = newName;
  row.splitAmong = JSON.stringify(
    uniqueNames(ensureArray(row.splitAmong).map(name => (trimString(name) === oldName ? newName : trimString(name)))),
  );

  if (Array.isArray(row.payers)) {
    row.payers = row.payers.map(p =>
      p && trimString(p.name) === oldName ? { ...p, name: newName } : p,
    );
  } else if (typeof row.payers === 'string' && trimString(row.payers)) {
    try {
      row.payers = JSON.parse(row.payers).map(p =>
        p && trimString(p.name) === oldName ? { ...p, name: newName } : p,
      );
    } catch {
      /* keep invalid payload as-is */
    }
  }

  if (Array.isArray(row.splitDetails)) {
    row.splitDetails = row.splitDetails.map(s =>
      s && trimString(s.name) === oldName ? { ...s, name: newName } : s,
    );
  } else if (typeof row.splitDetails === 'string' && trimString(row.splitDetails)) {
    try {
      row.splitDetails = JSON.parse(row.splitDetails).map(s =>
        s && trimString(s.name) === oldName ? { ...s, name: newName } : s,
      );
    } catch {
      /* keep invalid payload as-is */
    }
  }
}

function renameInTripSettlementRow(row, oldName, newName) {
  if (trimString(row.from) === oldName) row.from = newName;
  if (trimString(row.to) === oldName) row.to = newName;
}

function renameInRows(rows, oldName, newName, { pending = false } = {}) {
  for (const row of rows) {
    if (!row) continue;
    if (row.type === 'trip') renameInTripRow(row, oldName, newName);
    else if (row.type === 'tripExpense') renameInTripExpenseRow(row, oldName, newName);
    else if (row.type === 'tripSettlement') renameInTripSettlementRow(row, oldName, newName);
    else if (row.type === 'avatar' && trimString(row.memberName) === oldName) row.memberName = newName;
    else if (row.type === 'memberProfile' && trimString(row.memberName) === oldName) row.memberName = newName;
    patchRow(row, row, { pending: pending || !!row._pendingSync });
  }
}

function ensureMemberRow(rows, memberName, { pending = false } = {}) {
  const name = trimString(memberName);
  if (!name) return null;
  const idx = findMemberIndex(rows, name);
  if (idx !== -1) return rows[idx];
  const row = normalizeActiveRow({ type: 'memberProfile', memberName: name, deleted: false }, { pending });
  rows.push(row);
  return row;
}

function upsertMemberColor(rows, payload, { pending = false } = {}) {
  const name = trimString(payload.memberName);
  if (!name) return;
  const row = ensureMemberRow(rows, name, { pending });
  patchRow(row, { colorId: payload.colorId, deleted: false }, { pending });
}

function renameMember(rows, payload, { pending = false } = {}) {
  const oldName = trimString(payload.memberName);
  const newName = trimString(payload.newName);
  if (!oldName || !newName || oldName === newName) return;

  const oldIdx = findMemberIndex(rows, oldName);
  const newIdx = findMemberIndex(rows, newName);

  renameInRows(rows, oldName, newName, { pending });

  if (oldIdx !== -1) {
    const oldRow = rows[oldIdx];
    patchRow(oldRow, { memberName: newName, deleted: false }, { pending });
    if (newIdx !== -1 && newIdx !== oldIdx) {
      const oldColor = trimString(oldRow.colorId);
      const newRow = rows[newIdx];
      patchRow(
        newRow,
        {
          colorId: trimString(newRow.colorId) || oldColor,
          deleted: toBool(newRow.deleted) && toBool(oldRow.deleted),
        },
        { pending },
      );
      rows.splice(oldIdx, 1);
    }
    return;
  }

  const row = ensureMemberRow(rows, newName, { pending });
  if (row) patchRow(row, { deleted: false }, { pending });
}

function deleteMember(rows, payload, { pending = false } = {}) {
  const row = ensureMemberRow(rows, payload.memberName, { pending });
  if (row) patchRow(row, { deleted: true }, { pending });
}

function updateTripMembers(rows, tripId, updater, { pending = false } = {}) {
  const idx = findTripIndex(rows, tripId);
  if (idx === -1) return;
  const row = rows[idx];
  const members = uniqueNames(ensureArray(row.members));
  const nextMembers = uniqueNames(updater(members.slice()));
  patchRow(row, { members: JSON.stringify(nextMembers) }, { pending });
}

function addActiveRow(rows, payload, { pending = false } = {}) {
  rows.push(normalizeActiveRow(payload, { pending }));
}

function editDaily(rows, payload, { pending = false } = {}) {
  const idx = findDailyLikeIndex(rows, payload.id);
  if (idx === -1) return;
  const patch = {
    ...(payload.date !== undefined ? { date: payload.date } : {}),
    ...(payload.note !== undefined ? { note: payload.note } : {}),
    ...(payload.category !== undefined ? { category: payload.category } : {}),
    ...(payload.photoUrl !== undefined ? { photoUrl: payload.photoUrl } : {}),
    ...(payload.photoDataUrl !== undefined ? { photoUrl: payload.photoDataUrl } : {}),
    ...(payload.photoFileId !== undefined ? { photoFileId: payload.photoFileId } : {}),
  };
  patchRow(rows[idx], patch, { pending });
}

function editTripExpense(rows, payload, { pending = false } = {}) {
  const idx = findIdIndex(rows, 'tripExpense', payload.id);
  if (idx === -1) return;
  const patch = {
    ...(payload.date !== undefined ? { date: payload.date } : {}),
    ...(payload.note !== undefined ? { note: payload.note } : {}),
    ...(payload.category !== undefined ? { category: payload.category } : {}),
    ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
    ...(payload.photoUrl !== undefined ? { photoUrl: payload.photoUrl } : {}),
    ...(payload.photoDataUrl !== undefined ? { photoUrl: payload.photoDataUrl } : {}),
    ...(payload.photoFileId !== undefined ? { photoFileId: payload.photoFileId } : {}),
  };

  if (payload.fxFeeNtd !== undefined) {
    const fx = parseFloat(payload.fxFeeNtd);
    if (Number.isFinite(fx) && fx > 0) patch.fxFeeNtd = fx;
    else patch.fxFeeNtd = '';
  }

  if (payload.amountCny !== undefined) {
    const cny = parseFloat(payload.amountCny);
    if (Number.isFinite(cny) && cny > 0) patch.amountCny = cny;
    else patch.amountCny = '';
  }

  patchRow(rows[idx], patch, { pending });
}

export function cloneRowsSnapshot(rows) {
  return deepClone(rows || []);
}

export function applyCurrentStatePayload(rows, payload, { pending = false } = {}) {
  if (!Array.isArray(rows) || !payload || !payload.type) return rows;

  const type = trimString(payload.type);
  const action = trimString(payload.action || 'add');

  if (type === 'daily') {
    if (action === 'add') addActiveRow(rows, payload, { pending });
    else if (action === 'edit') editDaily(rows, payload, { pending });
    else if (action === 'void' || action === 'delete') setDailyLikeVoided(rows, payload.id, true, { pending });
    return rows;
  }

  if (type === 'settlement') {
    if (action === 'add') addActiveRow(rows, payload, { pending });
    else if (action === 'void' || action === 'delete') setDailyLikeVoided(rows, payload.id, true, { pending });
    return rows;
  }

  if (type === 'tripExpense') {
    if (action === 'add') addActiveRow(rows, payload, { pending });
    else if (action === 'edit') editTripExpense(rows, payload, { pending });
    else if (action === 'void' || action === 'delete') setVoidedById(rows, 'tripExpense', payload.id, true, { pending });
    return rows;
  }

  if (type === 'tripSettlement') {
    if (action === 'add') addActiveRow(rows, payload, { pending });
    else if (action === 'void' || action === 'delete') setVoidedById(rows, 'tripSettlement', payload.id, true, { pending });
    return rows;
  }

  if (type === 'trip') {
    if (action === 'add') {
      addActiveRow(
        rows,
        {
          ...payload,
          closed: payload.closed ?? false,
          cnyMode: payload.cnyMode ?? false,
          colorId: payload.colorId ?? '',
        },
        { pending },
      );
    } else if (action === 'delete') {
      removeTripCascade(rows, payload.id);
    } else if (action === 'close') {
      const idx = findTripIndex(rows, payload.id);
      if (idx !== -1) patchRow(rows[idx], { closed: true }, { pending });
    } else if (action === 'reopen') {
      const idx = findTripIndex(rows, payload.id);
      if (idx !== -1) patchRow(rows[idx], { closed: false }, { pending });
    } else if (action === 'setColor') {
      const idx = findTripIndex(rows, payload.id);
      if (idx !== -1) patchRow(rows[idx], { colorId: payload.colorId }, { pending });
    } else if (action === 'enableCnyMode') {
      const idx = findTripIndex(rows, payload.id);
      if (idx !== -1) patchRow(rows[idx], { cnyMode: true }, { pending });
    }
    return rows;
  }

  if (type === 'tripMember') {
    if (action === 'add') {
      updateTripMembers(rows, payload.tripId, members => [...members, payload.memberName], { pending });
    } else if (action === 'remove') {
      updateTripMembers(
        rows,
        payload.tripId,
        members => members.filter(name => trimString(name) !== trimString(payload.memberName)),
        { pending },
      );
    }
    return rows;
  }

  if (type === 'memberProfile') {
    if (action === 'setColor') upsertMemberColor(rows, payload, { pending });
    else if (action === 'rename') renameMember(rows, payload, { pending });
    else if (action === 'delete') deleteMember(rows, payload, { pending });
    else if (action === 'restore') {
      const row = ensureMemberRow(rows, payload.memberName, { pending });
      if (row) patchRow(row, { deleted: false }, { pending });
    }
    return rows;
  }

  if (type === 'avatar') {
    const scope = trimString(payload.avatarScope || 'auto') || 'auto';
    const idx = findAvatarIndex(rows, payload.memberName, scope);
    const patch = {
      type: 'avatar',
      memberName: payload.memberName,
      avatarScope: scope,
      avatarUrl:
        payload.avatarUrl !== undefined
          ? payload.avatarUrl
          : payload.avatarDataUrl !== undefined
            ? payload.avatarDataUrl
            : '',
    };
    if (idx === -1) addActiveRow(rows, patch, { pending });
    else patchRow(rows[idx], patch, { pending });
    return rows;
  }

  return rows;
}

export function applyQueuedPayloadsToCurrentState(serverRows, outboxPayloads) {
  const merged = cloneRowsSnapshot(serverRows);
  for (const payload of outboxPayloads || []) {
    applyCurrentStatePayload(merged, payload, { pending: true });
  }
  return merged.map(row => normalizeActiveRow(row, { pending: !!row._pendingSync }));
}
