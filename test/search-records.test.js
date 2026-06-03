import { describe, expect, it } from 'vitest';
import {
  filterDailyRecords,
  filterTripRecords,
  matchesDailyRecord,
  matchesTripRecord,
} from '../js/search-records.js';

describe('record search', () => {
  it('matches daily records by item, category, note, amount, and payer', () => {
    const records = [
      {
        id: 'd1',
        type: 'daily',
        item: '早餐',
        category: '餐飲',
        note: '巷口豆漿',
        paidBy: '胡',
        splitMode: '均分',
        amount: 80,
        date: '2026-04-01',
      },
      {
        id: 'd2',
        type: 'settlement',
        paidBy: '詹',
        amount: 500,
        date: '2026-04-02',
      },
    ];

    expect(matchesDailyRecord(records[0], '豆漿')).toBe(true);
    expect(matchesDailyRecord(records[0], '餐飲 80')).toBe(true);
    expect(matchesDailyRecord(records[1], '還款 詹')).toBe(true);
    expect(filterDailyRecords(records, '早餐')).toEqual([records[0]]);
  });

  it('matches trip expenses and settlements by members, category, notes, and amounts', () => {
    const items = [
      {
        kind: 'expense',
        data: {
          id: 'e1',
          type: 'tripExpense',
          item: '民宿',
          category: '住宿',
          note: '台南',
          paidBy: '吳秉融',
          splitAmong: ['吳秉融', '胡明皓'],
          amount: 3200,
          date: '2026-04-01',
        },
      },
      {
        kind: 'settlement',
        data: {
          id: 's1',
          type: 'tripSettlement',
          from: '胡明皓',
          to: '吳秉融',
          amount: 1600,
          date: '2026-04-02',
        },
      },
    ];

    expect(matchesTripRecord(items[0], '住宿 台南')).toBe(true);
    expect(matchesTripRecord(items[1], '胡明皓 1600')).toBe(true);
    expect(filterTripRecords(items, '吳秉融')).toEqual(items);
    expect(filterTripRecords(items, '不存在')).toEqual([]);
  });
});
