import { POST_OUTBOX_KEY } from '../config.js';
import { pendingEventIdentity } from './pending.js';

function entityLifecycleKey(payload) {
  if (!payload || payload.id == null) return '';
  const type = String(payload.type || '');
  if (!['daily', 'settlement', 'tripExpense', 'tripSettlement'].includes(type)) return '';
  return `${type}|${String(payload.id)}`;
}

function isEntityAddAction(payload) {
  return String(payload?.action || 'add') === 'add';
}

function isEntityVoidAction(payload) {
  const action = String(payload?.action || '');
  return action === 'void' || action === 'delete';
}

export function compactPostOutbox(items) {
  const kept = [];
  const pendingAdds = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const key = entityLifecycleKey(item);
    if (!key) {
      kept.push(item);
      continue;
    }
    if (isEntityAddAction(item)) {
      kept.push(item);
      pendingAdds.add(key);
      continue;
    }
    if (pendingAdds.has(key) && isEntityVoidAction(item)) {
      for (let i = kept.length - 1; i >= 0; i--) {
        if (entityLifecycleKey(kept[i]) === key) kept.splice(i, 1);
      }
      pendingAdds.delete(key);
      continue;
    }
    kept.push(item);
  }
  return kept;
}

export function readPostOutbox() {
  try {
    const raw = localStorage.getItem(POST_OUTBOX_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    const compacted = compactPostOutbox(p);
    if (compacted.length !== p.length) {
      localStorage.setItem(POST_OUTBOX_KEY, JSON.stringify(compacted));
    }
    return compacted;
  } catch {
    return [];
  }
}

export function writePostOutbox(items) {
  localStorage.setItem(POST_OUTBOX_KEY, JSON.stringify(compactPostOutbox(items)));
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

export function removePostOutboxMatching(predicate) {
  const q = readPostOutbox();
  const next = q.filter((item, index) => !predicate(item, index));
  if (next.length !== q.length) writePostOutbox(next);
  return q.length - next.length;
}
