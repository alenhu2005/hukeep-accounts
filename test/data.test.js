import { describe, it, expect } from 'vitest';
import {
  getDailyRecordsFromRows,
  buildTripFromRows,
  getTripExpensesFromRows,
  getTripPaletteColorId,
  pickRandomTripColorId,
  getHiddenMemberStyleKey,
  HIDDEN_MEMBER_COLORS,
} from '../js/data.js';
import { gamblingSplitFromCatTotals, GAMBLING_CATEGORY } from '../js/category.js';

describe('getDailyRecordsFromRows', () => {
  it('彙整 add 並套用 void / edit', () => {
    const rows = [
      { type: 'daily', action: 'add', id: 'a1', date: '2024-06-01', amount: 10, paidBy: '胡', splitMode: '均分', item: '早' },
      { type: 'daily', action: 'void', id: 'a1' },
      { type: 'daily', action: 'add', id: 'a2', date: '2024-06-02', amount: 20, paidBy: '詹', splitMode: '均分', item: '午' },
      { type: 'daily', action: 'edit', id: 'a2', date: '2024-06-03', note: '改期' },
    ];
    const recs = getDailyRecordsFromRows(rows);
    expect(recs).toHaveLength(2);
    const voided = recs.find(r => r.id === 'a1');
    expect(voided._voided).toBe(true);
    const edited = recs.find(r => r.id === 'a2');
    expect(edited.date).toBe('2024-06-03');
    expect(edited.note).toBe('改期');
  });

  it('delete 排除該 id 的 add', () => {
    const rows = [
      { type: 'daily', action: 'add', id: 'x', date: '2024-01-01', amount: 1, paidBy: '胡', splitMode: '均分', item: 'a' },
      { type: 'daily', action: 'delete', id: 'x' },
    ];
    expect(getDailyRecordsFromRows(rows)).toHaveLength(0);
  });
});

describe('buildTripFromRows', () => {
  it('合併 tripMember add/remove', () => {
    const tripRow = {
      type: 'trip',
      id: 't1',
      action: 'add',
      name: '花蓮',
      members: '["胡","詹"]',
      createdAt: '2024-01-01',
    };
    const allRows = [
      tripRow,
      { type: 'tripMember', tripId: 't1', action: 'add', memberName: '阿明' },
      { type: 'tripMember', tripId: 't1', action: 'remove', memberName: '詹' },
    ];
    const t = buildTripFromRows(tripRow, allRows);
    expect(t.members).toEqual(['胡', '阿明']);
  });
});

describe('trip palette (5 colors)', () => {
  it('getTripPaletteColorId 使用行程 setColor', () => {
    const rows = [
      { type: 'trip', action: 'add', id: 't1', name: 'A', members: '[]', createdAt: '2024-01-01' },
      { type: 'trip', action: 'setColor', id: 't1', colorId: 'violet' },
    ];
    expect(getTripPaletteColorId('t1', rows)).toBe('violet');
  });

  it('pickRandomTripColorId 在還有空色時避開已用色', () => {
    const rows = [
      { type: 'trip', action: 'add', id: 't1', name: 'A', members: '[]', createdAt: '2024-01-01' },
      { type: 'trip', action: 'setColor', id: 't1', colorId: 'blue' },
      { type: 'trip', action: 'add', id: 't2', name: 'B', members: '[]', createdAt: '2024-01-01' },
      { type: 'trip', action: 'setColor', id: 't2', colorId: 'emerald' },
    ];
    const picked = pickRandomTripColorId(rows);
    expect(['amber', 'violet', 'rose']).toContain(picked);
  });
});

describe('hidden member styles', () => {
  it('has 10 hidden variants', () => {
    expect(HIDDEN_MEMBER_COLORS).toHaveLength(10);
  });

  it('getHiddenMemberStyleKey maps hidden id', () => {
    expect(getHiddenMemberStyleKey('hidden-neon')).toBe('neon');
    expect(getHiddenMemberStyleKey(' hidden-neon ')).toBe('neon');
    expect(getHiddenMemberStyleKey('not-a-hidden')).toBe('');
  });
});

describe('getTripExpensesFromRows', () => {
  it('tripExpense 與 void', () => {
    const rows = [
      {
        type: 'tripExpense',
        action: 'add',
        id: 'e1',
        tripId: 't1',
        amount: '100',
        paidBy: '胡',
        splitAmong: '["胡","詹"]',
        date: '2024-01-01',
      },
      { type: 'tripExpense', action: 'void', id: 'e1' },
    ];
    const ex = getTripExpensesFromRows('t1', rows);
    expect(ex).toHaveLength(1);
    expect(ex[0]._voided).toBe(true);
    expect(ex[0].amount).toBe(100);
  });

  it('同一 id 多筆 add 只顯示一筆（試算表重複寫入）', () => {
    const dup = {
      type: 'tripExpense',
      action: 'add',
      id: 'e-dup',
      tripId: 't1',
      amount: '50',
      paidBy: '甲',
      splitAmong: '["甲","乙"]',
      date: '2024-02-01',
      item: '麻將',
    };
    const rows = [dup, { ...dup }, { type: 'tripExpense', action: 'void', id: 'e-dup' }];
    const ex = getTripExpensesFromRows('t1', rows);
    expect(ex).toHaveLength(1);
    expect(ex[0]._voided).toBe(true);
  });

  it('tripExpense 可帶 amountCny（輔助人民幣），amount 仍為新台幣', () => {
    const rows = [
      {
        type: 'tripExpense',
        action: 'add',
        id: 'e-cny',
        tripId: 't1',
        amount: '300',
        amountCny: '88.5',
        paidBy: '胡',
        splitAmong: '["胡","詹"]',
        date: '2024-03-01',
        item: '午餐',
      },
    ];
    const ex = getTripExpensesFromRows('t1', rows);
    expect(ex).toHaveLength(1);
    expect(ex[0].amount).toBe(300);
    expect(ex[0].amountCny).toBe(88.5);
  });

  it('tripExpense edit 可覆寫 amount', () => {
    const rows = [
      {
        type: 'tripExpense',
        action: 'add',
        id: 'e-amt',
        tripId: 't1',
        amount: '200',
        paidBy: '甲',
        splitAmong: '["甲","乙"]',
        date: '2024-04-01',
        item: '外幣刷卡',
      },
      {
        type: 'tripExpense',
        action: 'edit',
        id: 'e-amt',
        date: '2024-04-02',
        amount: '250',
      },
    ];
    const ex = getTripExpensesFromRows('t1', rows);
    expect(ex[0].amount).toBe(250);
  });

  it('tripExpense edit 可補登／覆寫 fxFeeNtd，0 則清除', () => {
    const rows = [
      {
        type: 'tripExpense',
        action: 'add',
        id: 'e-fx',
        tripId: 't1',
        amount: '200',
        paidBy: '甲',
        splitAmong: '["甲","乙"]',
        date: '2024-04-01',
        item: '外幣刷卡',
      },
      {
        type: 'tripExpense',
        action: 'edit',
        id: 'e-fx',
        date: '2024-04-01',
        fxFeeNtd: '15',
      },
    ];
    const ex = getTripExpensesFromRows('t1', rows);
    expect(ex[0].fxFeeNtd).toBe(15);

    const cleared = getTripExpensesFromRows('t1', [
      rows[0],
      { type: 'tripExpense', action: 'edit', id: 'e-fx', date: '2024-04-01', fxFeeNtd: 0 },
    ]);
    expect(cleared[0].fxFeeNtd).toBeUndefined();
  });
});

describe('gamblingSplitFromCatTotals', () => {
  it('拆出賭博與一般、圓餅分母為非賭博合計', () => {
    const catTotals = { 餐飲: 100, [GAMBLING_CATEGORY]: 50, 未分類: 20 };
    const grand = 170;
    const { gambleTotal, nonGamblingTotal, nonGamblingSlices } = gamblingSplitFromCatTotals(catTotals, grand);
    expect(gambleTotal).toBe(50);
    expect(nonGamblingTotal).toBe(120);
    const sumRest = nonGamblingSlices.reduce((s, [, a]) => s + a, 0);
    expect(sumRest).toBe(120);
    expect(nonGamblingSlices.some(([c]) => c === GAMBLING_CATEGORY)).toBe(false);
  });
});

describe('getDailyRecordsFromRows duplicate add id', () => {
  it('同一 id 多筆 add 只保留一筆', () => {
    const a = {
      type: 'daily',
      action: 'add',
      id: 'd1',
      date: '2024-06-01',
      amount: 10,
      paidBy: '胡',
      splitMode: '均分',
      item: '早',
    };
    const rows = [a, { ...a, amount: 99 }];
    const recs = getDailyRecordsFromRows(rows);
    expect(recs).toHaveLength(1);
    expect(recs[0].amount).toBe(10);
  });
});
