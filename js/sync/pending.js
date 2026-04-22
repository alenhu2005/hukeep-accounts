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

/** 成功送出佇列首筆後，清掉 allRows 內對應的待上傳標記 */
export function clearPendingSyncForPayload(allRows, payload) {
  if (!Array.isArray(allRows) || !payload) return;
  const key = pendingEventIdentity(payload);
  for (const r of allRows) {
    if (!r || !r._pendingSync) continue;
    if (key && pendingEventIdentity(r) === key) {
      delete r._pendingSync;
      break;
    }
    if (payload.id != null && r.id != null && String(payload.id) === String(r.id) && String(payload.type) === String(r.type)) {
      delete r._pendingSync;
      break;
    }
    if (
      payload.id != null &&
      r.id != null &&
      String(payload.id) === String(r.id) &&
      ((payload.type === 'daily' && (r.type === 'daily' || r.type === 'settlement')) ||
        (payload.type === 'settlement' && (r.type === 'daily' || r.type === 'settlement')))
    ) {
      delete r._pendingSync;
      break;
    }
    if (
      payload.type === 'memberProfile' &&
      r.type === 'memberProfile' &&
      String(r.memberName || '') === String(payload.memberName || '')
    ) {
      delete r._pendingSync;
      break;
    }
    if (
      payload.type === 'avatar' &&
      r.type === 'avatar' &&
      String(r.memberName || '') === String(payload.memberName || '') &&
      String(r.avatarScope || 'auto') === String(payload.avatarScope || 'auto')
    ) {
      delete r._pendingSync;
      break;
    }
  }
}

/**
 * 載入快取時：沒有對應 POST 佇列項的 _pendingSync 視為殘留，與 GAS 為準策略一致，直接清掉以免又當成待上傳。
 * @param {import('../model.js').LedgerRow[]} allRows
 * @param {object[]} outboxPayloads
 */
export function pruneStalePendingSyncFlags(allRows, outboxPayloads = []) {
  const outboxKeys = new Set(outboxPayloads.map(pendingEventIdentity));
  for (const r of allRows) {
    if (!r._pendingSync) continue;
    const key = pendingEventIdentity(r);
    if (!key || outboxKeys.has(key)) continue;
    delete r._pendingSync;
  }
}
