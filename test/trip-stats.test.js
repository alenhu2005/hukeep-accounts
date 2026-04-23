import { describe, it, expect, vi } from 'vitest';
import {
  buildTripClosureReportModel,
  buildTripSettlementSummaryText,
  renderTripStatsCard,
} from '../js/trip-stats.js';

describe('buildTripSettlementSummaryText', () => {
  it('含標題、成員、建議轉帳', () => {
    const trip = { id: 't1', name: '測試行', members: ['胡', '詹'], createdAt: '2024-01-15' };
    const expenses = [
      {
        type: 'tripExpense',
        amount: 100,
        paidBy: '胡',
        splitAmong: ['胡', '詹'],
        _voided: false,
        date: '2024-01-15',
      },
    ];
    const text = buildTripSettlementSummaryText(trip, expenses);
    expect(text).toContain('【測試行】');
    expect(text).toContain('胡');
    expect(text).toContain('詹');
    expect(text).toContain('最後誰該付誰');
  });
});

describe('buildTripClosureReportModel', () => {
  it('產出已結束行程報告所需的付費、分攤與剩餘轉帳資料', () => {
    const trip = { id: 't1', name: '測試行', members: ['胡', '詹'], createdAt: '2024-01-15' };
    const expenses = [
      {
        type: 'tripExpense',
        amount: 100,
        paidBy: '胡',
        splitAmong: ['胡', '詹'],
        _voided: false,
        date: '2024-01-15',
      },
    ];
    const model = buildTripClosureReportModel(trip, expenses, []);
    expect(model.total).toBe(100);
    expect(model.memberRows).toEqual([
      {
        name: '胡',
        paid: 100,
        share: 50,
        net: 50,
        outstanding: 50,
        outstandingLabel: '待收 NT$50',
      },
      {
        name: '詹',
        paid: 0,
        share: 50,
        net: -50,
        outstanding: -50,
        outstandingLabel: '待付 NT$50',
      },
    ]);
    expect(model.remainingSettlements).toEqual([{ from: '詹', to: '胡', amount: 50 }]);
  });

  it('已記錄還款會從最後誰該付誰中扣除', () => {
    const trip = { id: 't1', name: '測試行', members: ['胡', '詹'], createdAt: '2024-01-15' };
    const expenses = [
      {
        type: 'tripExpense',
        amount: 100,
        paidBy: '胡',
        splitAmong: ['胡', '詹'],
        _voided: false,
        date: '2024-01-15',
      },
    ];
    const allRows = [
      { type: 'tripSettlement', action: 'add', id: 'ts1', tripId: 't1', from: '詹', to: '胡', amount: 50 },
    ];
    const model = buildTripClosureReportModel(trip, expenses, allRows);
    expect(model.recordedSettlements).toEqual([{ from: '詹', to: '胡', amount: 50 }]);
    expect(model.remainingSettlements).toEqual([]);
    expect(model.memberRows[0].outstandingLabel).toBe('已結清');
    expect(model.memberRows[1].outstandingLabel).toBe('已結清');
  });
});

describe('renderTripStatsCard', () => {
  it('顯示新的摘要區與重點卡片', () => {
    vi.stubGlobal('document', {
      documentElement: {
        classList: {
          contains: () => false,
        },
      },
    });
    try {
      const html = renderTripStatsCard(
        ['胡', '詹', '森'],
        [
          {
            type: 'tripExpense',
            amount: 600,
            paidBy: '胡',
            splitAmong: ['胡', '詹', '森'],
            _voided: false,
            category: '餐飲',
            date: '2024-01-15',
          },
          {
            type: 'tripExpense',
            amount: 300,
            paidBy: '詹',
            splitAmong: ['詹', '森'],
            _voided: false,
            category: '交通',
            date: '2024-01-16',
          },
        ],
      );
      expect(html).toContain('出遊統計摘要');
      expect(html).toContain('出最多');
      expect(html).toContain('目前差額');
      expect(html).toContain('分類支出');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
