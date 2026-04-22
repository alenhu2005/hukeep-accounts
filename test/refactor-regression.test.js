import { describe, expect, it } from 'vitest';
import {
  buildTripFromRows,
  getDailyRecordsFromRows,
  getTripExpensesFromRows,
  getTripSettlementDisplayRowsFromRows,
} from '../js/data.js';
import { mergeFreshWithOutboxBackedPending } from '../js/offline-queue.js';
import { buildSettlementViewModel } from '../js/views-trip-detail/settlement.js';
import { tripHistoryDateRange } from '../js/views-trip-detail/history.js';
import { activeRowsForMerge, legacyLedgerRows, pendingPayloadsForMerge } from './fixtures/current-state-regression.js';

describe('refactor regression fixture', () => {
  it('keeps daily selector output stable for void + edit history', () => {
    const rows = getDailyRecordsFromRows(legacyLedgerRows);
    expect(rows.map(r => ({ id: r.id, type: r.type, date: r.date, note: r.note || '', voided: !!r._voided }))).toEqual([
      { id: 'sd1', type: 'settlement', date: '2026-04-03', note: '', voided: false },
      { id: 'd1', type: 'daily', date: '2026-04-02', note: '補記', voided: true },
    ]);
  });

  it('keeps trip closed state, rename propagation, and cny mode stable', () => {
    const tripRow = legacyLedgerRows.find(r => r.type === 'trip' && r.action === 'add' && r.id === 't1');
    const trip = buildTripFromRows(tripRow, legacyLedgerRows);
    expect(trip).toMatchObject({
      id: 't1',
      name: '台南有很多公園',
      members: ['胡', '詹', '阿哲'],
      _closed: true,
      cnyMode: true,
    });
  });

  it('keeps trip expense and settlement display rows stable', () => {
    const expenses = getTripExpensesFromRows('t1', legacyLedgerRows);
    expect(expenses.map(e => ({ id: e.id, paidBy: e.paidBy, amount: e.amount, voided: !!e._voided, note: e.note || '' }))).toEqual([
      { id: 'e2', paidBy: '詹', amount: 80, voided: true, note: '' },
      { id: 'e1', paidBy: '阿哲', amount: 360, voided: false, note: '加點' },
    ]);

    const settlements = getTripSettlementDisplayRowsFromRows('t1', legacyLedgerRows);
    expect(settlements).toEqual([
      {
        type: 'tripSettlement',
        id: 'ts1',
        tripId: 't1',
        date: '2026-04-05',
        from: '詹',
        to: '阿明',
        amount: 120,
        _voided: false,
      },
    ]);
  });

  it('keeps settlement and history date calculations stable', () => {
    const tripRow = legacyLedgerRows.find(r => r.type === 'trip' && r.action === 'add' && r.id === 't1');
    const trip = buildTripFromRows(tripRow, legacyLedgerRows);
    const expenses = getTripExpensesFromRows('t1', legacyLedgerRows);
    const settlements = getTripSettlementDisplayRowsFromRows('t1', legacyLedgerRows);

    expect(tripHistoryDateRange(trip, expenses, settlements)).toEqual({
      start: '2026-04-03',
      end: '2026-04-05',
    });

    const vm = buildSettlementViewModel(trip.members, expenses, trip, legacyLedgerRows);
    expect(vm.dueSettlements).toEqual([
      { from: '胡', to: '詹', amount: 120 },
      { from: '胡', to: '阿哲', amount: 60 },
    ]);
    expect(vm.total).toBe(360);
  });

  it('keeps current-state merge semantics stable across add/edit/void/close/reopen', () => {
    const merged = mergeFreshWithOutboxBackedPending(activeRowsForMerge, activeRowsForMerge, pendingPayloadsForMerge);
    expect(merged.find(r => r.type === 'trip' && r.id === 't-active')?.closed).toBe(false);
    expect(
      merged.find(r => r.type === 'tripExpense' && r.id === 'e-active'),
    ).toMatchObject({ amount: 240, note: '加點' });
    expect(
      merged.find(r => r.type === 'tripExpense' && r.id === 'e-pending'),
    ).toMatchObject({ voided: true, _pendingSync: true });
  });
});
