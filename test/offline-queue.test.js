import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mergeFreshWithOutboxBackedPending,
  pendingEventIdentity,
  pruneStalePendingSyncFlags,
  writePostOutbox,
} from '../js/offline-queue.js';

describe('pendingEventIdentity', () => {
  it('keys tripMember by trip and name', () => {
    expect(
      pendingEventIdentity({ type: 'tripMember', action: 'add', tripId: 't1', memberName: '甲' }),
    ).toBe('tripMember|add|t1|甲');
  });

  it('keys memberProfile rename', () => {
    expect(
      pendingEventIdentity({
        type: 'memberProfile',
        action: 'rename',
        memberName: '甲',
        newName: '乙',
      }),
    ).toBe('memberProfile|rename|甲|乙');
  });
});

describe('mergeFreshWithOutboxBackedPending', () => {
  it('appends pending local row only when same event is still in outbox', () => {
    const server = [{ type: 'daily', action: 'add', id: 'a1', item: 'x', amount: 1 }];
    const pendingRow = { type: 'daily', action: 'add', id: 'local1', item: 'y', amount: 2, _pendingSync: true };
    const local = [...server, pendingRow];
    const outbox = [{ type: 'daily', action: 'add', id: 'local1', item: 'y', amount: 2 }];
    const merged = mergeFreshWithOutboxBackedPending(local, server, outbox);
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.id === 'local1')).toBeTruthy();
  });

  it('drops pending local row if not in outbox (GAS wins)', () => {
    const server = [{ type: 'daily', action: 'add', id: 'a1', item: 'x', amount: 1 }];
    const ghost = { type: 'daily', action: 'add', id: 'ghost', item: 'z', amount: 9, _pendingSync: true };
    const local = [...server, ghost];
    const merged = mergeFreshWithOutboxBackedPending(local, server, []);
    expect(merged).toHaveLength(1);
    expect(merged.find(r => r.id === 'ghost')).toBeUndefined();
  });

  it('drops pending duplicate when server already has same event identity', () => {
    const pendingVoid = { type: 'daily', action: 'void', id: 'a1', _pendingSync: true };
    const server = [pendingVoid];
    const local = [pendingVoid];
    const merged = mergeFreshWithOutboxBackedPending(local, server, [{ type: 'daily', action: 'void', id: 'a1' }]);
    expect(merged.filter(r => r.action === 'void')).toHaveLength(1);
  });
});

describe('pruneStalePendingSyncFlags', () => {
  const orig = globalThis.localStorage;

  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        store.set(k, v);
      },
      removeItem: k => {
        store.delete(k);
      },
    };
  });

  afterEach(() => {
    globalThis.localStorage = orig;
  });

  it('removes _pendingSync when event is not in POST outbox', () => {
    writePostOutbox([]);
    const rows = [{ type: 'daily', action: 'add', id: 'x', _pendingSync: true }];
    pruneStalePendingSyncFlags(rows);
    expect(rows[0]._pendingSync).toBeUndefined();
  });

  it('keeps _pendingSync when matching payload is queued', () => {
    writePostOutbox([{ type: 'daily', action: 'add', id: 'x' }]);
    const rows = [{ type: 'daily', action: 'add', id: 'x', _pendingSync: true }];
    pruneStalePendingSyncFlags(rows);
    expect(rows[0]._pendingSync).toBe(true);
  });
});
