import { POST_OUTBOX_KEY } from '../config.js';
import { pendingEventIdentity } from './pending.js';

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
