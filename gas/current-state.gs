// === Sheet schema ===========================================================
var ACTIVE_SHEETS = {
  daily: '日常消費',
  settlement: '日常還款',
  trip: '行程',
  tripExpense: '出遊消費',
  tripSettlement: '出遊還款',
  memberProfile: '成員',
  avatar: '頭像',
};

var ARCHIVE_SHEETS = {
  daily: '封存_日常事件',
  trip: '封存_出遊事件',
  person: '封存_人物事件',
};

var LEGACY_SHEETS = ['日常', '出遊', '人物'];

var ACTIVE_HEADERS = {
  '日常消費': ['type', 'action', 'id', 'date', 'item', 'amount', 'paidBy', 'splitMode', 'note', 'paidHu', 'paidZhan', 'category', 'photoUrl', 'photoFileId', 'voided'],
  '日常還款': ['type', 'action', 'id', 'date', 'amount', 'paidBy', 'voided'],
  '行程': ['type', 'action', 'id', 'name', 'members', 'createdAt', 'closed', 'colorId', 'cnyMode'],
  '出遊消費': ['type', 'action', 'id', 'tripId', 'item', 'amount', 'paidBy', 'splitAmong', 'date', 'note', 'category', 'amountCny', 'fxFeeNtd', 'payers', 'splitDetails', 'photoUrl', 'photoFileId', 'voided'],
  '出遊還款': ['type', 'action', 'id', 'tripId', 'date', 'from', 'to', 'amount', 'voided'],
  '成員': ['type', 'memberName', 'deleted', 'colorId'],
  '頭像': ['type', 'id', 'memberName', 'avatarScope', 'avatarUrl', 'avatarFileId'],
  '封存_日常事件': ['type', 'action', 'id', 'date', 'item', 'amount', 'paidBy', 'splitMode', 'note', 'paidHu', 'paidZhan', 'category', 'photoUrl', 'photoFileId', '_archivedAt'],
  '封存_出遊事件': ['type', 'action', 'id', 'tripId', 'name', 'members', 'createdAt', 'memberName', 'newName', 'colorId', 'item', 'amount', 'paidBy', 'splitAmong', 'date', 'note', 'category', 'amountCny', 'fxFeeNtd', 'payers', 'splitDetails', 'from', 'to', 'photoUrl', 'photoFileId', 'closed', 'cnyMode', '_archivedAt'],
  '封存_人物事件': ['type', 'action', 'id', 'memberName', 'newName', 'colorId', 'deleted', 'avatarScope', 'avatarUrl', 'avatarFileId', '_archivedAt'],
};

// === Row / sheet utils ======================================================
function getSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function ensureHeaders_(sheetName, headers) {
  var sheet = getSheet_(sheetName);
  var wanted = headers || ACTIVE_HEADERS[sheetName] || [];
  if (sheet.getLastRow() === 0) {
    if (wanted.length) sheet.getRange(1, 1, 1, wanted.length).setValues([wanted]);
    return wanted.slice();
  }

  var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!existing.length && wanted.length) {
    sheet.getRange(1, 1, 1, wanted.length).setValues([wanted]);
    return wanted.slice();
  }

  wanted.forEach(function (key) {
    if (existing.indexOf(key) !== -1) return;
    sheet.getRange(1, existing.length + 1).setValue(key);
    existing.push(key);
  });
  return existing;
}

function sheetRowsToObjects_(sheetName) {
  var sheet = getSheet_(sheetName);
  if (sheet.getLastRow() <= 1) return [];
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) row[headers[j]] = values[i][j];
    out.push(row);
  }
  return out;
}

function writeObjectsToSheet_(sheetName, rows, headers) {
  var sheet = getSheet_(sheetName);
  var cols = ensureHeaders_(sheetName, headers);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(1, sheet.getLastColumn())).clearContent();
  }
  if (!rows || !rows.length) return;
  var values = rows.map(function (row) {
    return cols.map(function (key) {
      return row[key] !== undefined ? row[key] : '';
    });
  });
  sheet.getRange(2, 1, values.length, cols.length).setValues(values);
}

function appendRows_(sheetName, rows, headers) {
  if (!rows || !rows.length) return;
  var cols = ensureHeaders_(sheetName, headers);
  var sheet = getSheet_(sheetName);
  var values = rows.map(function (row) {
    return cols.map(function (key) {
      return row[key] !== undefined ? row[key] : '';
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, cols.length).setValues(values);
}

function trim_(value) {
  return value == null ? '' : String(value).trim();
}

function isTrue_(value) {
  if (value === true) return true;
  var s = trim_(value).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

function parseJsonArray_(value) {
  if (Array.isArray(value)) return value.slice();
  try {
    var parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function uniqueNames_(arr) {
  var out = [];
  var seen = {};
  (arr || []).forEach(function (raw) {
    var name = trim_(raw);
    if (!name || seen[name]) return;
    seen[name] = true;
    out.push(name);
  });
  return out;
}

function activeSheetNameForType_(type) {
  if (type === 'daily') return ACTIVE_SHEETS.daily;
  if (type === 'settlement') return ACTIVE_SHEETS.settlement;
  if (type === 'trip') return ACTIVE_SHEETS.trip;
  if (type === 'tripExpense') return ACTIVE_SHEETS.tripExpense;
  if (type === 'tripSettlement') return ACTIVE_SHEETS.tripSettlement;
  if (type === 'memberProfile') return ACTIVE_SHEETS.memberProfile;
  if (type === 'avatar') return ACTIVE_SHEETS.avatar;
  throw new Error('Unsupported type: ' + type);
}

function archiveSheetNameForType_(type) {
  if (type === 'daily' || type === 'settlement') return ARCHIVE_SHEETS.daily;
  if (type === 'trip' || type === 'tripExpense' || type === 'tripSettlement' || type === 'tripMember') return ARCHIVE_SHEETS.trip;
  if (type === 'memberProfile' || type === 'avatar') return ARCHIVE_SHEETS.person;
  throw new Error('Unsupported archive type: ' + type);
}

function appendArchiveEvent_(payload) {
  var sheetName = archiveSheetNameForType_(payload.type);
  var row = {};
  Object.keys(payload).forEach(function (key) {
    row[key] = payload[key];
  });
  row._archivedAt = new Date();
  appendRows_(sheetName, [row], ACTIVE_HEADERS[sheetName]);
}

function rowMatchesKey_(row, key, value) {
  if (typeof key === 'function') return key(row);
  return trim_(row[key]) === trim_(value);
}

// === Active current-state mutations ========================================
function upsertActiveRow_(sheetName, key, value, patch) {
  var rows = sheetRowsToObjects_(sheetName);
  var idx = -1;
  for (var i = 0; i < rows.length; i++) {
    if (rowMatchesKey_(rows[i], key, value)) {
      idx = i;
      break;
    }
  }
  if (idx === -1) {
    rows.push(patch);
  } else {
    Object.keys(patch).forEach(function (field) {
      rows[idx][field] = patch[field];
    });
  }
  writeObjectsToSheet_(sheetName, rows, ACTIVE_HEADERS[sheetName]);
}

function deleteActiveRow_(sheetName, key, value) {
  var rows = sheetRowsToObjects_(sheetName).filter(function (row) {
    return !rowMatchesKey_(row, key, value);
  });
  writeObjectsToSheet_(sheetName, rows, ACTIVE_HEADERS[sheetName]);
}

function markActiveRowVoided_(sheetName, key, value, voided) {
  var rows = sheetRowsToObjects_(sheetName);
  for (var i = 0; i < rows.length; i++) {
    if (!rowMatchesKey_(rows[i], key, value)) continue;
    rows[i].voided = !!voided;
    writeObjectsToSheet_(sheetName, rows, ACTIVE_HEADERS[sheetName]);
    return;
  }
}

function cascadeDeleteTrip_(tripId) {
  deleteActiveRow_(ACTIVE_SHEETS.trip, 'id', tripId);
  deleteActiveRow_(ACTIVE_SHEETS.tripExpense, function (row) {
    return trim_(row.tripId) === trim_(tripId);
  });
  deleteActiveRow_(ACTIVE_SHEETS.tripSettlement, function (row) {
    return trim_(row.tripId) === trim_(tripId);
  });
}

function renameMembersJson_(value, oldName, newName) {
  return JSON.stringify(
    uniqueNames_(
      parseJsonArray_(value).map(function (name) {
        return trim_(name) === trim_(oldName) ? trim_(newName) : trim_(name);
      }),
    ),
  );
}

function renamePayersJson_(value, oldName, newName) {
  try {
    return JSON.stringify(
      JSON.parse(value || '[]').map(function (entry) {
        if (!entry) return entry;
        if (trim_(entry.name) === trim_(oldName)) entry.name = trim_(newName);
        return entry;
      }),
    );
  } catch (e) {
    return value;
  }
}

function cascadeRenameMember_(oldName, newName) {
  var tripRows = sheetRowsToObjects_(ACTIVE_SHEETS.trip).map(function (row) {
    row.members = renameMembersJson_(row.members, oldName, newName);
    return row;
  });
  writeObjectsToSheet_(ACTIVE_SHEETS.trip, tripRows, ACTIVE_HEADERS[ACTIVE_SHEETS.trip]);

  var expenseRows = sheetRowsToObjects_(ACTIVE_SHEETS.tripExpense).map(function (row) {
    if (trim_(row.paidBy) === trim_(oldName)) row.paidBy = trim_(newName);
    row.splitAmong = renameMembersJson_(row.splitAmong, oldName, newName);
    if (trim_(row.payers)) row.payers = renamePayersJson_(row.payers, oldName, newName);
    if (trim_(row.splitDetails)) row.splitDetails = renamePayersJson_(row.splitDetails, oldName, newName);
    return row;
  });
  writeObjectsToSheet_(ACTIVE_SHEETS.tripExpense, expenseRows, ACTIVE_HEADERS[ACTIVE_SHEETS.tripExpense]);

  var settlementRows = sheetRowsToObjects_(ACTIVE_SHEETS.tripSettlement).map(function (row) {
    if (trim_(row.from) === trim_(oldName)) row.from = trim_(newName);
    if (trim_(row.to) === trim_(oldName)) row.to = trim_(newName);
    return row;
  });
  writeObjectsToSheet_(ACTIVE_SHEETS.tripSettlement, settlementRows, ACTIVE_HEADERS[ACTIVE_SHEETS.tripSettlement]);

  var avatarRows = sheetRowsToObjects_(ACTIVE_SHEETS.avatar).map(function (row) {
    if (trim_(row.memberName) === trim_(oldName)) row.memberName = trim_(newName);
    return row;
  });
  writeObjectsToSheet_(ACTIVE_SHEETS.avatar, avatarRows, ACTIVE_HEADERS[ACTIVE_SHEETS.avatar]);

  var memberRows = sheetRowsToObjects_(ACTIVE_SHEETS.memberProfile);
  var oldRow = null;
  var newRow = null;
  memberRows = memberRows.filter(function (row) {
    var name = trim_(row.memberName);
    if (name === trim_(oldName)) {
      oldRow = row;
      return false;
    }
    if (name === trim_(newName)) newRow = row;
    return true;
  });
  if (oldRow) {
    oldRow.memberName = trim_(newName);
    oldRow.deleted = false;
    if (newRow) {
      if (!trim_(newRow.colorId) && trim_(oldRow.colorId)) newRow.colorId = trim_(oldRow.colorId);
      newRow.deleted = isTrue_(newRow.deleted) && isTrue_(oldRow.deleted);
    } else {
      memberRows.push(oldRow);
    }
  }
  writeObjectsToSheet_(ACTIVE_SHEETS.memberProfile, memberRows, ACTIVE_HEADERS[ACTIVE_SHEETS.memberProfile]);
}

function payloadToActiveRow_(data) {
  if (data.type === 'daily') {
    return {
      type: 'daily',
      action: 'add',
      id: data.id,
      date: data.date,
      item: data.item,
      amount: data.amount,
      paidBy: data.paidBy,
      splitMode: data.splitMode,
      note: data.note || '',
      paidHu: data.paidHu || '',
      paidZhan: data.paidZhan || '',
      category: data.category || '',
      photoUrl: data.photoUrl || '',
      photoFileId: data.photoFileId || '',
      voided: false,
    };
  }
  if (data.type === 'settlement') {
    return {
      type: 'settlement',
      action: 'add',
      id: data.id,
      date: data.date,
      amount: data.amount,
      paidBy: data.paidBy,
      voided: false,
    };
  }
  if (data.type === 'trip') {
    return {
      type: 'trip',
      action: 'add',
      id: data.id,
      name: data.name || '',
      members: data.members || '[]',
      createdAt: data.createdAt || data.date || '',
      closed: isTrue_(data.closed),
      colorId: data.colorId || '',
      cnyMode: isTrue_(data.cnyMode),
    };
  }
  if (data.type === 'tripExpense') {
    return {
      type: 'tripExpense',
      action: 'add',
      id: data.id,
      tripId: data.tripId,
      item: data.item || '',
      amount: data.amount,
      paidBy: data.paidBy || '',
      splitAmong: data.splitAmong || '[]',
      date: data.date,
      note: data.note || '',
      category: data.category || '',
      amountCny: data.amountCny || '',
      fxFeeNtd: data.fxFeeNtd || '',
      payers: Array.isArray(data.payers) ? JSON.stringify(data.payers) : data.payers || '',
      splitDetails: Array.isArray(data.splitDetails) ? JSON.stringify(data.splitDetails) : data.splitDetails || '',
      photoUrl: data.photoUrl || '',
      photoFileId: data.photoFileId || '',
      voided: false,
    };
  }
  if (data.type === 'tripSettlement') {
    return {
      type: 'tripSettlement',
      action: 'add',
      id: data.id,
      tripId: data.tripId,
      date: data.date,
      from: data.from,
      to: data.to,
      amount: data.amount,
      voided: false,
    };
  }
  if (data.type === 'memberProfile') {
    return {
      type: 'memberProfile',
      memberName: data.memberName || '',
      deleted: isTrue_(data.deleted),
      colorId: data.colorId || '',
    };
  }
  if (data.type === 'avatar') {
    return {
      type: 'avatar',
      id: data.id || '',
      memberName: data.memberName || '',
      avatarScope: data.avatarScope || 'auto',
      avatarUrl: data.avatarUrl || '',
      avatarFileId: data.avatarFileId || '',
    };
  }
  throw new Error('Unsupported type: ' + data.type);
}

function ensureTripMemberMutation_(data) {
  var rows = sheetRowsToObjects_(ACTIVE_SHEETS.trip);
  var idx = -1;
  for (var i = 0; i < rows.length; i++) {
    if (trim_(rows[i].id) === trim_(data.tripId)) {
      idx = i;
      break;
    }
  }
  if (idx === -1) throw new Error('Trip not found: ' + data.tripId);
  var members = uniqueNames_(parseJsonArray_(rows[idx].members));
  if (data.action === 'add') {
    members.push(trim_(data.memberName));
  } else {
    members = members.filter(function (name) {
      return trim_(name) !== trim_(data.memberName);
    });
  }
  rows[idx].members = JSON.stringify(uniqueNames_(members));
  writeObjectsToSheet_(ACTIVE_SHEETS.trip, rows, ACTIVE_HEADERS[ACTIVE_SHEETS.trip]);
}

function applyCurrentStateMutation_(data) {
  if (data.type === 'daily') {
    if (data.action === 'add') {
      upsertActiveRow_(ACTIVE_SHEETS.daily, 'id', data.id, payloadToActiveRow_(data));
    } else if (data.action === 'edit') {
      upsertActiveRow_(ACTIVE_SHEETS.daily, 'id', data.id, {
        date: data.date,
        note: data.note || '',
        category: data.category || '',
        photoUrl: data.photoUrl !== undefined ? data.photoUrl : '',
        photoFileId: data.photoFileId !== undefined ? data.photoFileId : '',
      });
    } else if (data.action === 'void' || data.action === 'delete') {
      markActiveRowVoided_(ACTIVE_SHEETS.daily, 'id', data.id, true);
      markActiveRowVoided_(ACTIVE_SHEETS.settlement, 'id', data.id, true);
    }
    return;
  }

  if (data.type === 'settlement') {
    if (data.action === 'add') upsertActiveRow_(ACTIVE_SHEETS.settlement, 'id', data.id, payloadToActiveRow_(data));
    else if (data.action === 'void' || data.action === 'delete') markActiveRowVoided_(ACTIVE_SHEETS.settlement, 'id', data.id, true);
    return;
  }

  if (data.type === 'trip') {
    if (data.action === 'add') {
      upsertActiveRow_(ACTIVE_SHEETS.trip, 'id', data.id, payloadToActiveRow_(data));
    } else if (data.action === 'delete') {
      cascadeDeleteTrip_(data.id);
    } else if (data.action === 'close') {
      upsertActiveRow_(ACTIVE_SHEETS.trip, 'id', data.id, { closed: true });
    } else if (data.action === 'reopen') {
      upsertActiveRow_(ACTIVE_SHEETS.trip, 'id', data.id, { closed: false });
    } else if (data.action === 'setColor') {
      upsertActiveRow_(ACTIVE_SHEETS.trip, 'id', data.id, { colorId: data.colorId || '' });
    } else if (data.action === 'enableCnyMode') {
      upsertActiveRow_(ACTIVE_SHEETS.trip, 'id', data.id, { cnyMode: true });
    }
    return;
  }

  if (data.type === 'tripMember') {
    ensureTripMemberMutation_(data);
    return;
  }

  if (data.type === 'tripExpense') {
    if (data.action === 'add') {
      upsertActiveRow_(ACTIVE_SHEETS.tripExpense, 'id', data.id, payloadToActiveRow_(data));
    } else if (data.action === 'edit') {
      var patch = {
        date: data.date,
        note: data.note || '',
        category: data.category || '',
        photoUrl: data.photoUrl !== undefined ? data.photoUrl : '',
        photoFileId: data.photoFileId !== undefined ? data.photoFileId : '',
      };
      if (data.amount !== undefined) patch.amount = data.amount;
      if (data.fxFeeNtd !== undefined) patch.fxFeeNtd = data.fxFeeNtd;
      if (data.amountCny !== undefined) patch.amountCny = data.amountCny;
      upsertActiveRow_(ACTIVE_SHEETS.tripExpense, 'id', data.id, patch);
    } else if (data.action === 'void' || data.action === 'delete') {
      markActiveRowVoided_(ACTIVE_SHEETS.tripExpense, 'id', data.id, true);
    }
    return;
  }

  if (data.type === 'tripSettlement') {
    if (data.action === 'add') {
      upsertActiveRow_(ACTIVE_SHEETS.tripSettlement, 'id', data.id, payloadToActiveRow_(data));
    } else if (data.action === 'void' || data.action === 'delete') {
      markActiveRowVoided_(ACTIVE_SHEETS.tripSettlement, 'id', data.id, true);
    }
    return;
  }

  if (data.type === 'memberProfile') {
    if (data.action === 'setColor') {
      upsertActiveRow_(ACTIVE_SHEETS.memberProfile, 'memberName', data.memberName, {
        type: 'memberProfile',
        memberName: data.memberName,
        deleted: false,
        colorId: data.colorId || '',
      });
    } else if (data.action === 'rename') {
      cascadeRenameMember_(data.memberName, data.newName);
    } else if (data.action === 'delete') {
      upsertActiveRow_(ACTIVE_SHEETS.memberProfile, 'memberName', data.memberName, {
        type: 'memberProfile',
        memberName: data.memberName,
        deleted: true,
      });
    } else if (data.action === 'restore') {
      upsertActiveRow_(ACTIVE_SHEETS.memberProfile, 'memberName', data.memberName, {
        type: 'memberProfile',
        memberName: data.memberName,
        deleted: false,
      });
    }
    return;
  }

  if (data.type === 'avatar') {
    var scope = data.avatarScope || 'auto';
    upsertActiveRow_(
      ACTIVE_SHEETS.avatar,
      function (row) {
        return trim_(row.memberName) === trim_(data.memberName) && trim_(row.avatarScope || 'auto') === trim_(scope);
      },
      '',
      {
        type: 'avatar',
        id: data.id || '',
        memberName: data.memberName,
        avatarScope: scope,
        avatarUrl: data.avatarUrl || '',
        avatarFileId: data.avatarFileId || '',
      },
    );
    return;
  }
}

function currentStateRows_() {
  var rows = [];
  Object.keys(ACTIVE_SHEETS).forEach(function (key) {
    rows = rows.concat(sheetRowsToObjects_(ACTIVE_SHEETS[key]));
  });
  return rows;
}

function historyRows_(type, id) {
  var rows = [];
  Object.keys(ARCHIVE_SHEETS).forEach(function (key) {
    rows = rows.concat(sheetRowsToObjects_(ARCHIVE_SHEETS[key]));
  });
  var useId = id != null && trim_(id) !== '';
  return rows.filter(function (row) {
    if (trim_(row.type) !== trim_(type)) return false;
    if (useId && trim_(row.id) !== trim_(id)) return false;
    return true;
  });
}

// === Migration from legacy append-only events ===============================
function copyLegacyRowsToArchive_() {
  if (sheetRowsToObjects_(ARCHIVE_SHEETS.daily).length > 0) return;
  LEGACY_SHEETS.forEach(function (legacyName) {
    var rows = sheetRowsToObjects_(legacyName);
    if (!rows.length) return;
    var target;
    if (legacyName === '日常') target = ARCHIVE_SHEETS.daily;
    else if (legacyName === '出遊') target = ARCHIVE_SHEETS.trip;
    else target = ARCHIVE_SHEETS.person;
    var enriched = rows.map(function (row) {
      row._archivedAt = new Date();
      return row;
    });
    appendRows_(target, enriched, ACTIVE_HEADERS[target]);
  });
}

function firstAddById_(rows, type) {
  var map = {};
  rows.forEach(function (row) {
    if (row.type !== type || row.action !== 'add') return;
    var id = trim_(row.id);
    if (!id || map[id]) return;
    map[id] = row;
  });
  return map;
}

function migrateLegacyEventsToCurrentState() {
  copyLegacyRowsToArchive_();

  var legacy = [];
  LEGACY_SHEETS.forEach(function (name) {
    legacy = legacy.concat(sheetRowsToObjects_(name));
  });
  if (!legacy.length) return;

  var dailyVoided = {};
  legacy.forEach(function (row) {
    if ((row.type === 'daily' || row.type === 'settlement') && (row.action === 'void' || row.action === 'delete')) {
      dailyVoided[trim_(row.id)] = true;
    }
  });
  var dailyEdit = {};
  legacy.forEach(function (row) {
    if (row.type !== 'daily' || row.action !== 'edit') return;
    dailyEdit[trim_(row.id)] = row;
  });

  var dailyRows = [];
  Object.keys(firstAddById_(legacy, 'daily')).forEach(function (id) {
    var base = payloadToActiveRow_(firstAddById_(legacy, 'daily')[id]);
    base.voided = !!dailyVoided[id];
    var edit = dailyEdit[id];
    if (edit) {
      base.date = edit.date || base.date;
      base.note = edit.note || '';
      if (edit.category !== undefined) base.category = edit.category || '';
      if (edit.photoUrl !== undefined) base.photoUrl = edit.photoUrl || '';
      if (edit.photoFileId !== undefined) base.photoFileId = edit.photoFileId || '';
    }
    dailyRows.push(base);
  });

  var settlementRows = [];
  Object.keys(firstAddById_(legacy, 'settlement')).forEach(function (id) {
    var base = payloadToActiveRow_(firstAddById_(legacy, 'settlement')[id]);
    base.voided = !!dailyVoided[id];
    settlementRows.push(base);
  });

  var tripAdds = firstAddById_(legacy, 'trip');
  var deletedTripIds = {};
  var tripRows = [];
  Object.keys(tripAdds).forEach(function (id) {
    var deleted = legacy.some(function (row) {
      return row.type === 'trip' && row.action === 'delete' && trim_(row.id) === id;
    });
    if (deleted) {
      deletedTripIds[id] = true;
      return;
    }
    var base = payloadToActiveRow_(tripAdds[id]);
    base.closed = false;
    base.cnyMode = false;
    base.colorId = '';
    legacy.forEach(function (row) {
      if (row.type !== 'trip' || trim_(row.id) !== id) return;
      if (row.action === 'close') base.closed = true;
      if (row.action === 'reopen') base.closed = false;
      if (row.action === 'setColor') base.colorId = row.colorId || '';
      if (row.action === 'enableCnyMode') base.cnyMode = true;
    });
    var members = uniqueNames_(parseJsonArray_(base.members));
    legacy.forEach(function (row) {
      if (row.type !== 'tripMember' || trim_(row.tripId) !== id) return;
      if (row.action === 'add') members.push(trim_(row.memberName));
      if (row.action === 'remove') {
        members = members.filter(function (name) {
          return trim_(name) !== trim_(row.memberName);
        });
      }
    });
    base.members = JSON.stringify(uniqueNames_(members));
    tripRows.push(base);
  });

  var expenseVoided = {};
  legacy.forEach(function (row) {
    if (row.type === 'tripExpense' && (row.action === 'void' || row.action === 'delete')) expenseVoided[trim_(row.id)] = true;
  });
  var expenseEdit = {};
  legacy.forEach(function (row) {
    if (row.type === 'tripExpense' && row.action === 'edit') expenseEdit[trim_(row.id)] = row;
  });
  var expenseRows = [];
  Object.keys(firstAddById_(legacy, 'tripExpense')).forEach(function (id) {
    var base = payloadToActiveRow_(firstAddById_(legacy, 'tripExpense')[id]);
    if (deletedTripIds[trim_(base.tripId)]) return;
    base.voided = !!expenseVoided[id];
    var edit = expenseEdit[id];
    if (edit) {
      base.date = edit.date || base.date;
      base.note = edit.note || '';
      if (edit.category !== undefined) base.category = edit.category || '';
      if (edit.amount !== undefined && trim_(edit.amount) !== '') base.amount = edit.amount;
      if (edit.fxFeeNtd !== undefined) base.fxFeeNtd = edit.fxFeeNtd;
      if (edit.amountCny !== undefined) base.amountCny = edit.amountCny;
      if (edit.photoUrl !== undefined) base.photoUrl = edit.photoUrl || '';
      if (edit.photoFileId !== undefined) base.photoFileId = edit.photoFileId || '';
    }
    expenseRows.push(base);
  });

  var tripSettlementVoided = {};
  legacy.forEach(function (row) {
    if (row.type === 'tripSettlement' && (row.action === 'void' || row.action === 'delete')) tripSettlementVoided[trim_(row.id)] = true;
  });
  var tripSettlementRows = [];
  Object.keys(firstAddById_(legacy, 'tripSettlement')).forEach(function (id) {
    var base = payloadToActiveRow_(firstAddById_(legacy, 'tripSettlement')[id]);
    if (deletedTripIds[trim_(base.tripId)]) return;
    base.voided = !!tripSettlementVoided[id];
    tripSettlementRows.push(base);
  });

  var memberMap = {};
  legacy.forEach(function (row) {
    if (row.type === 'memberProfile' && trim_(row.memberName)) {
      if (!memberMap[trim_(row.memberName)]) memberMap[trim_(row.memberName)] = { type: 'memberProfile', memberName: trim_(row.memberName), deleted: false, colorId: '' };
      if (row.action === 'setColor' && trim_(row.colorId)) memberMap[trim_(row.memberName)].colorId = trim_(row.colorId);
      if (row.action === 'delete') memberMap[trim_(row.memberName)].deleted = true;
      if (row.action === 'restore') memberMap[trim_(row.memberName)].deleted = false;
    }
  });

  var avatarMap = {};
  legacy.forEach(function (row) {
    if (row.type !== 'avatar' || !trim_(row.memberName) || !trim_(row.avatarUrl)) return;
    var key = trim_(row.memberName) + '|' + trim_(row.avatarScope || 'auto');
    avatarMap[key] = payloadToActiveRow_(row);
  });

  legacy.forEach(function (row) {
    if (row.type === 'memberProfile' && row.action === 'rename' && trim_(row.memberName) && trim_(row.newName)) {
      cascadeRenameOnData_(
        {
          tripRows: tripRows,
          expenseRows: expenseRows,
          tripSettlementRows: tripSettlementRows,
          memberMap: memberMap,
          avatarMap: avatarMap,
        },
        trim_(row.memberName),
        trim_(row.newName),
      );
    }
  });

  writeObjectsToSheet_(ACTIVE_SHEETS.daily, dailyRows, ACTIVE_HEADERS[ACTIVE_SHEETS.daily]);
  writeObjectsToSheet_(ACTIVE_SHEETS.settlement, settlementRows, ACTIVE_HEADERS[ACTIVE_SHEETS.settlement]);
  writeObjectsToSheet_(ACTIVE_SHEETS.trip, tripRows, ACTIVE_HEADERS[ACTIVE_SHEETS.trip]);
  writeObjectsToSheet_(ACTIVE_SHEETS.tripExpense, expenseRows, ACTIVE_HEADERS[ACTIVE_SHEETS.tripExpense]);
  writeObjectsToSheet_(ACTIVE_SHEETS.tripSettlement, tripSettlementRows, ACTIVE_HEADERS[ACTIVE_SHEETS.tripSettlement]);
  writeObjectsToSheet_(ACTIVE_SHEETS.memberProfile, Object.keys(memberMap).map(function (key) { return memberMap[key]; }), ACTIVE_HEADERS[ACTIVE_SHEETS.memberProfile]);
  writeObjectsToSheet_(ACTIVE_SHEETS.avatar, Object.keys(avatarMap).map(function (key) { return avatarMap[key]; }), ACTIVE_HEADERS[ACTIVE_SHEETS.avatar]);
}

function cascadeRenameOnData_(state, oldName, newName) {
  state.tripRows.forEach(function (row) {
    row.members = renameMembersJson_(row.members, oldName, newName);
  });
  state.expenseRows.forEach(function (row) {
    if (trim_(row.paidBy) === trim_(oldName)) row.paidBy = trim_(newName);
    row.splitAmong = renameMembersJson_(row.splitAmong, oldName, newName);
    if (trim_(row.payers)) row.payers = renamePayersJson_(row.payers, oldName, newName);
    if (trim_(row.splitDetails)) row.splitDetails = renamePayersJson_(row.splitDetails, oldName, newName);
  });
  state.tripSettlementRows.forEach(function (row) {
    if (trim_(row.from) === trim_(oldName)) row.from = trim_(newName);
    if (trim_(row.to) === trim_(oldName)) row.to = trim_(newName);
  });
  var nextMemberMap = {};
  Object.keys(state.memberMap).forEach(function (key) {
    var row = state.memberMap[key];
    if (trim_(row.memberName) === trim_(oldName)) row.memberName = trim_(newName);
    nextMemberMap[trim_(row.memberName)] = row;
  });
  state.memberMap = nextMemberMap;
  var nextAvatarMap = {};
  Object.keys(state.avatarMap).forEach(function (key) {
    var row = state.avatarMap[key];
    if (trim_(row.memberName) === trim_(oldName)) row.memberName = trim_(newName);
    nextAvatarMap[trim_(row.memberName) + '|' + trim_(row.avatarScope || 'auto')] = row;
  });
  state.avatarMap = nextAvatarMap;
}

function getGeminiCategory(item) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey || !item) return '';
  var url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' +
    apiKey;
  var payload = {
    contents: [
      {
        parts: [
          {
            text:
              '消費項目「' +
              item +
              '」屬於哪個類別？只能從以下選一個，直接回答詞語：餐飲、交通、住宿、購物、娛樂、生活、賭博、其他。',
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 200, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
  };
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      deadline: 10,
    });
    var body = JSON.parse(res.getContentText());
    var parts = body.candidates[0].content.parts;
    var text = parts[parts.length - 1].text.trim();
    var cats = ['餐飲', '交通', '住宿', '購物', '娛樂', '生活', '賭博', '其他'];
    var found = cats.find(function (c) {
      return text.indexOf(c) >= 0;
    });
    return found || '';
  } catch (e) {
    return '';
  }
}

// === Media upload ===========================================================
var LEDGER_PHOTO_FOLDER_NAME = 'ledger-app-uploads';
var LEDGER_PHOTO_SUBFOLDERS_BY_KEY = {
  photo: 'photos',
  tripPhoto: 'trip-photos',
  avatar: 'avatars',
};
var MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function ensureRootFolder_() {
  var folderId = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {}
  }
  var folders = DriveApp.getRootFolder().getFoldersByName(LEDGER_PHOTO_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.getRootFolder().createFolder(LEDGER_PHOTO_FOLDER_NAME);
}

function ensureSubFolder_(subName) {
  var root = ensureRootFolder_();
  if (!subName) return root;
  var folders = root.getFoldersByName(subName);
  if (folders.hasNext()) return folders.next();
  return root.createFolder(subName);
}

function uploadImageDataUrlToDrive_(dataUrl, filePrefix, subFolderName) {
  if (!dataUrl) return null;
  var m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid image DataUrl');
  var mime = m[1];
  var b64 = m[2];
  var bytes = Utilities.base64Decode(b64);
  if (!bytes || bytes.length <= 0) throw new Error('Empty image bytes');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Image too large');
  var folder = ensureSubFolder_(subFolderName);
  var ext = mime.split('/')[1] || 'jpg';
  var fileName = (filePrefix || 'img') + '_' + Utilities.getUuid() + '.' + ext;
  var blob = Utilities.newBlob(bytes, mime, fileName);
  var file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}
  return { url: 'https://lh3.googleusercontent.com/d/' + file.getId(), fileId: file.getId() };
}

function processAllImageDataUrls_(data) {
  Object.keys(data).forEach(function (key) {
    if (!key || key.slice(-7) !== 'DataUrl') return;
    var base = key.slice(0, -7);
    var dataUrl = data[key];
    var subFolderName = LEDGER_PHOTO_SUBFOLDERS_BY_KEY[base] || '';
    if (!dataUrl) {
      data[base + 'Url'] = '';
      data[base + 'FileId'] = '';
      delete data[key];
      return;
    }
    var uploaded = uploadImageDataUrlToDrive_(dataUrl, base, subFolderName);
    if (uploaded) {
      data[base + 'Url'] = uploaded.url;
      data[base + 'FileId'] = uploaded.fileId;
      delete data[key];
    }
  });
}

// === HTTP handlers ==========================================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    processAllImageDataUrls_(data);
    if (data.action === 'add' && (data.type === 'daily' || data.type === 'tripExpense') && data.item) {
      var catIn = data.category != null ? String(data.category).trim() : '';
      if (!catIn) data.category = getGeminiCategory(data.item);
    }
    applyCurrentStateMutation_(data);
    appendArchiveEvent_(data);
    return ContentService.createTextOutput(JSON.stringify({ result: 'success' })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ result: 'error', message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  if (params.mode === 'history') {
    var hasId = Object.prototype.hasOwnProperty.call(params, 'id');
    var rows = historyRows_(params.type, hasId ? params.id : null);
    return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify(currentStateRows_())).setMimeType(ContentService.MimeType.JSON);
}
