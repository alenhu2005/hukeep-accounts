import { POST_OUTBOX_KEY } from './config.js';

/**
 * 事件列去重鍵（與 GAS 事件列語意一致；用於合併伺服端資料與本機待上傳列）。
 * @param {object} r
 */
export function pendingEventIdentity(r) {
  if (!r || !r.type) return '';
  const t = r.type;
  const a = r.action || '';
  const id = r.id != null ? String(r.id) : '';
  if (t === 'tripMember') {
    return `${t}|${a}|${String(r.tripId || '')}|${String(r.memberName || '')}`;
  }
  if (t === 'memberProfile') {
    return `${t}|${a}|${String(r.memberName || '')}|${String(r.newName || '')}`;
  }
  return `${t}|${a}|${id}`;
}

/**
 * 以 GAS 回傳為準；只保留「仍在 POST 佇列」且伺服端尚無同一事件的本機列（離線未送出）。
 * 無佇列背書的 _pendingSync 一律丟棄，避免本機與試算表不一致時還蓋過 GAS。
 *
 * @param {import('./model.js').LedgerRow[]} localSnapshot
 * @param {import('./model.js').LedgerRow[]} freshNormalized
 * @param {object[]} outboxPayloads `readPostOutbox()` 回傳的待 POST 物件陣列
 */
export function mergeFreshWithOutboxBackedPending(localSnapshot, freshNormalized, outboxPayloads) {
  const serverKeys = new Set(freshNormalized.map(pendingEventIdentity));
  const outboxKeys = new Set((outboxPayloads || []).map(pendingEventIdentity));
  const extras = [];
  for (const r of localSnapshot) {
    if (!r._pendingSync) continue;
    const key = pendingEventIdentity(r);
    if (!key || serverKeys.has(key)) continue;
    if (!outboxKeys.has(key)) continue;
    extras.push(r);
  }
  return [...freshNormalized, ...extras];
}

export function readPostOutbox() {
  try {
    const raw = localStorage.getItem(POST_OUTBOX_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function writePostOutbox(items) {
  localStorage.setItem(POST_OUTBOX_KEY, JSON.stringify(items));
}

export function postOutboxLength() {
  return readPostOutbox().length;
}

export function clonePayloadForOutbox(data) {
  const o = JSON.parse(JSON.stringify(data));
  delete o._pendingSync;
  delete o._voided;
  delete o._clientDevice;
  delete o._clientPostedAt;
  return o;
}

export function enqueuePostOutbox(payload) {
  const key = pendingEventIdentity(payload);
  const q = readPostOutbox();
  // Coalesce: if same event identity already queued, overwrite it.
  // This prevents frequent UI actions (e.g. cycling colors) from bloating the outbox/spreadsheet.
  if (key) {
    const idx = q.findIndex(p => pendingEventIdentity(p) === key);
    if (idx !== -1) {
      q[idx] = clonePayloadForOutbox(payload);
      writePostOutbox(q);
      return;
    }
  }
  q.push(clonePayloadForOutbox(payload));
  writePostOutbox(q);
}

export function dequeuePostOutboxHead() {
  const q = readPostOutbox();
  if (!q.length) return null;
  const [head, ...rest] = q;
  writePostOutbox(rest);
  return head;
}

export function peekPostOutboxHead() {
  const q = readPostOutbox();
  return q.length ? q[0] : null;
}

/** 成功送出佇列首筆後，清掉 allRows 內對應的待上傳標記 */
export function clearPendingSyncForPayload(allRows, payload) {
  const key = pendingEventIdentity(payload);
  if (!key) return;
  for (const r of allRows) {
    if (r._pendingSync && pendingEventIdentity(r) === key) {
      delete r._pendingSync;
      break;
    }
  }
}

/**
 * 載入快取時：沒有對應 POST 佇列項的 _pendingSync 視為殘留，與 GAS 為準策略一致，直接清掉以免又當成待上傳。
 * @param {import('./model.js').LedgerRow[]} allRows
 */
export function pruneStalePendingSyncFlags(allRows) {
  const outboxKeys = new Set(readPostOutbox().map(pendingEventIdentity));
  for (const r of allRows) {
    if (!r._pendingSync) continue;
    const key = pendingEventIdentity(r);
    if (!key || outboxKeys.has(key)) continue;
    delete r._pendingSync;
  }
}

