import { describe, expect, it } from 'vitest';
import { buildMonthlyReportModel } from '../js/views-analysis.js';

describe('buildMonthlyReportModel', () => {
  it('summarizes monthly daily expenses, payer ranking, categories, and settlements', () => {
    const model = buildMonthlyReportModel(
      [
        { type: 'daily', date: '2026-04-01', amount: 100, paidBy: '胡', splitMode: '均分', category: '餐飲' },
        { type: 'daily', date: '2026-04-02', amount: 80, paidHu: 30, paidZhan: 50, splitMode: '兩人付', category: '交通' },
        { type: 'daily', date: '2026-04-03', amount: 999, paidBy: '詹', splitMode: '均分', category: '餐飲', voided: true },
        { type: 'settlement', date: '2026-04-04', amount: 60, paidBy: '詹' },
        { type: 'daily', date: '2026-05-01', amount: 500, paidBy: '胡', splitMode: '均分', category: '娛樂' },
      ],
      '2026-04-01',
      '2026-04-30',
    );

    expect(model.total).toBe(180);
    expect(model.expenseCount).toBe(2);
    expect(model.payerRows).toEqual([
      { name: '胡', amount: 130 },
      { name: '詹', amount: 50 },
    ]);
    expect(model.categoryRows).toEqual([
      { name: '餐飲', amount: 100, pct: 56 },
      { name: '交通', amount: 80, pct: 44 },
    ]);
    expect(model.settlementRows).toEqual([{ date: '2026-04-04', paidBy: '詹', amount: 60 }]);
  });
});
