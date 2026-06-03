import { describe, expect, it } from 'vitest';
import { buildOperationTimeline, operationTimelineToText } from '../js/backup.js';
import { runLedgerHealthCheck } from '../js/ledger-health.js';

describe('runLedgerHealthCheck', () => {
  it('marks a closed trip with remaining settlement as warning', () => {
    const rows = [
      {
        type: 'trip',
        action: 'add',
        id: 't1',
        name: '測試行程',
        members: JSON.stringify(['胡', '詹']),
        closed: true,
        createdAt: '2026-04-01',
      },
      {
        type: 'tripExpense',
        action: 'add',
        id: 'e1',
        tripId: 't1',
        amount: 100,
        paidBy: '胡',
        splitAmong: JSON.stringify(['胡', '詹']),
        date: '2026-04-01',
      },
    ];

    const result = runLedgerHealthCheck(rows);
    expect(result.status).toBe('warning');
    expect(result.metrics.closedTripOutstandingCount).toBe(1);
    expect(result.issues.some(issue => issue.title === '已結束行程仍有未結清金額')).toBe(true);
    expect(result.tripChecks[0].remainingTotal).toBe(50);
  });

  it('treats recorded trip settlements as settled', () => {
    const rows = [
      {
        type: 'trip',
        action: 'add',
        id: 't1',
        name: '測試行程',
        members: JSON.stringify(['胡', '詹']),
        closed: true,
        createdAt: '2026-04-01',
      },
      {
        type: 'tripExpense',
        action: 'add',
        id: 'e1',
        tripId: 't1',
        amount: 100,
        paidBy: '胡',
        splitAmong: JSON.stringify(['胡', '詹']),
        date: '2026-04-01',
      },
      {
        type: 'tripSettlement',
        action: 'add',
        id: 's1',
        tripId: 't1',
        from: '詹',
        to: '胡',
        amount: 50,
        date: '2026-04-02',
      },
    ];

    const result = runLedgerHealthCheck(rows);
    expect(result.status).toBe('ok');
    expect(result.tripChecks[0].remainingTotal).toBe(0);
  });

  it('reports duplicate add ids as an error', () => {
    const rows = [
      { type: 'daily', action: 'add', id: 'd1', amount: 80, paidBy: '胡', splitMode: '均分', date: '2026-04-01' },
      { type: 'daily', action: 'add', id: 'd1', amount: 90, paidBy: '胡', splitMode: '均分', date: '2026-04-02' },
    ];

    const result = runLedgerHealthCheck(rows);
    expect(result.status).toBe('error');
    expect(result.issues[0].title).toBe('發現重複主鍵');
  });
});

describe('operation timeline', () => {
  it('builds readable recent operation summaries', () => {
    const rows = [
      { type: 'trip', action: 'add', id: 't1', name: '台南', members: ['胡', '詹'], date: '2026-04-01' },
      {
        type: 'tripExpense',
        action: 'add',
        id: 'e1',
        tripId: 't1',
        item: '早餐',
        amount: 120,
        paidBy: '胡',
        splitAmong: ['胡', '詹'],
        date: '2026-04-02',
      },
    ];

    const timeline = buildOperationTimeline(rows, 2);
    expect(timeline[0].typeLabel).toBe('出遊消費');
    expect(timeline[0].summary).toContain('台南');
    expect(timeline[0].summary).toContain('早餐');
    expect(operationTimelineToText(rows, 2)).toContain('最近操作紀錄');
  });
});
