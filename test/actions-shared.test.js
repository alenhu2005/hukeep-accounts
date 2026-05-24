import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appState } from '../js/state.js';
import { discardUnsyncedLocalEntity, hasQueuedAddForEntity } from '../js/actions/shared.js';
import { readPostOutbox, writePostOutbox } from '../js/offline-queue.js';

describe('discardUnsyncedLocalEntity', () => {
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
    appState.allRows = [];
    writePostOutbox([]);
  });

  afterEach(() => {
    globalThis.localStorage = orig;
    appState.allRows = [];
  });

  it('drops unsynced settlement rows instead of leaving withdrawn ghosts', () => {
    appState.allRows = [
      { type: 'settlement', action: 'add', id: 's1', date: '2026-05-24', amount: 1, paidBy: '詹', _pendingSync: true },
    ];
    writePostOutbox([{ type: 'settlement', action: 'add', id: 's1', date: '2026-05-24', amount: 1, paidBy: '詹' }]);

    expect(hasQueuedAddForEntity('settlement', 's1')).toBe(true);
    expect(discardUnsyncedLocalEntity('settlement', 's1')).toBe(true);
    expect(appState.allRows).toEqual([]);
    expect(readPostOutbox()).toEqual([]);
  });

  it('keeps rows when only a server-backed withdraw is queued', () => {
    appState.allRows = [
      { type: 'settlement', action: 'add', id: 's2', date: '2026-05-24', amount: 1, paidBy: '詹' },
    ];
    writePostOutbox([{ type: 'settlement', action: 'void', id: 's2' }]);

    expect(hasQueuedAddForEntity('settlement', 's2')).toBe(false);
    expect(discardUnsyncedLocalEntity('settlement', 's2')).toBe(false);
    expect(appState.allRows).toHaveLength(1);
    expect(readPostOutbox()).toEqual([{ type: 'settlement', action: 'void', id: 's2' }]);
  });
});
