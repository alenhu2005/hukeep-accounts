import { describe, it, expect } from 'vitest';
import {
  computeBalance,
  computeSettlements,
  computePayerTotals,
  computeMemberShareTotals,
  computeTripDaySubtotals,
} from '../js/finance.js';

describe('computeBalance', () => {
  it('均分且胡付：詹應付的一半記入淨額', () => {
    const net = computeBalance([
      { type: 'daily', _voided: false, paidBy: '胡', splitMode: '均分', amount: 100 },
    ]);
    expect(net).toBeCloseTo(50);
  });

  it('兩人付：以 paidHu / paidZhan 差額一半', () => {
    const net = computeBalance([
      {
        type: 'daily',
        _voided: false,
        splitMode: '兩人付',
        paidHu: 60,
        paidZhan: 40,
        amount: 100,
      },
    ]);
    expect(net).toBeCloseTo(10);
  });

  it('略過已撤回', () => {
    const net = computeBalance([
      { type: 'daily', _voided: true, paidBy: '胡', splitMode: '均分', amount: 999 },
    ]);
    expect(net).toBeCloseTo(0);
  });
});

describe('computeSettlements', () => {
  it('單筆均分：少付者轉給先付者', () => {
    const out = computeSettlements(['胡', '詹'], [
      {
        amount: 100,
        paidBy: '胡',
        splitAmong: ['胡', '詹'],
        _voided: false,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].from).toBe('詹');
    expect(out[0].to).toBe('胡');
    expect(out[0].amount).toBeCloseTo(50);
  });

  it('已記錄還款 adjustment 抵銷後無待轉帳', () => {
    const out = computeSettlements(
      ['胡', '詹'],
      [
        {
          amount: 100,
          paidBy: '胡',
          splitAmong: ['胡', '詹'],
          _voided: false,
        },
      ],
      [{ from: '詹', to: '胡', amount: 50 }],
    );
    expect(out).toHaveLength(0);
  });

  it('多筆出款：依 payers 記先付，不把 paidBy「多人」當成成員', () => {
    const out = computeSettlements(['甲', '乙', '丙'], [
      {
        amount: 300,
        paidBy: '多人',
        payers: [
          { name: '甲', amount: 200 },
          { name: '乙', amount: 100 },
        ],
        splitAmong: ['甲', '乙', '丙'],
        _voided: false,
      },
    ]);
    expect(out.every(s => s.from !== '多人' && s.to !== '多人')).toBe(true);
    expect(out).toHaveLength(1);
    expect(out[0].from).toBe('丙');
    expect(out[0].to).toBe('甲');
    expect(out[0].amount).toBeCloseTo(100);
  });

  it('詳細分攤：依 splitDetails 計算而非平均分', () => {
    const out = computeSettlements(['甲', '乙', '丙'], [
      {
        amount: 360,
        paidBy: '甲',
        splitAmong: ['甲', '乙', '丙'],
        splitDetails: [
          { name: '甲', amount: 110 },
          { name: '乙', amount: 120 },
          { name: '丙', amount: 130 },
        ],
        _voided: false,
      },
    ]);
    expect(out).toHaveLength(2);
    const byFrom = Object.fromEntries(out.map(x => [x.from, x]));
    expect(byFrom['乙'].to).toBe('甲');
    expect(byFrom['乙'].amount).toBeCloseTo(120);
    expect(byFrom['丙'].to).toBe('甲');
    expect(byFrom['丙'].amount).toBeCloseTo(130);
  });
});

describe('computePayerTotals', () => {
  it('加總單一付款人', () => {
    const t = computePayerTotals([
      { _voided: false, paidBy: '甲', amount: 30, splitAmong: ['甲', '乙'] },
    ]);
    expect(t['甲']).toBeCloseTo(30);
  });
});

describe('computeMemberShareTotals', () => {
  it('每人應付分攤', () => {
    const s = computeMemberShareTotals(['胡', '詹'], [
      { _voided: false, amount: 100, splitAmong: ['胡', '詹'] },
    ]);
    expect(s['胡']).toBeCloseTo(50);
    expect(s['詹']).toBeCloseTo(50);
  });

  it('詳細分攤 totals 使用 splitDetails', () => {
    const s = computeMemberShareTotals(['甲', '乙', '丙'], [
      {
        _voided: false,
        amount: 360,
        splitAmong: ['甲', '乙', '丙'],
        splitDetails: [
          { name: '甲', amount: 110 },
          { name: '乙', amount: 120 },
          { name: '丙', amount: 130 },
        ],
      },
    ]);
    expect(s['甲']).toBeCloseTo(110);
    expect(s['乙']).toBeCloseTo(120);
    expect(s['丙']).toBeCloseTo(130);
  });
});

describe('computeTripDaySubtotals', () => {
  it('依日期加總', () => {
    const m = computeTripDaySubtotals([
      { _voided: false, date: '2024-01-01', amount: 10 },
      { _voided: false, date: '2024-01-01', amount: 5 },
      { _voided: false, date: '2024-01-02', amount: 3 },
    ]);
    expect(m['2024-01-01']).toBeCloseTo(15);
    expect(m['2024-01-02']).toBeCloseTo(3);
  });
});
