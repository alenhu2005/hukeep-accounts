import { describe, expect, it, afterEach } from 'vitest';
import { allRowsToHumanCSV } from '../js/backup.js';
import { appState } from '../js/state.js';

const originalRows = appState.allRows;

afterEach(() => {
  appState.allRows = originalRows;
});

describe('allRowsToHumanCSV', () => {
  it('exports readable structured columns for filtering in spreadsheets', () => {
    appState.allRows = [
      {
        type: 'trip',
        action: 'add',
        id: 't1',
        name: '台南',
        members: JSON.stringify(['胡', '詹']),
        date: '2026-04-01',
      },
      {
        type: 'tripExpense',
        action: 'add',
        id: 'e1',
        tripId: 't1',
        item: '早餐',
        amount: 120,
        amountCny: 80,
        fxFeeNtd: 5,
        payers: JSON.stringify([
          { name: '胡', amount: 70 },
          { name: '詹', amount: 50 },
        ]),
        splitAmong: JSON.stringify(['胡', '詹']),
        category: '餐飲',
        note: '早餐,熱豆漿',
        date: '2026-04-02',
      },
      {
        type: 'daily',
        action: 'add',
        id: 'd1',
        item: '飲料',
        amount: 80,
        paidBy: '胡',
        splitMode: '均分',
        category: '餐飲',
        voided: true,
        voidReason: '重複記帳',
        date: '2026-04-03',
      },
    ];

    const csv = allRowsToHumanCSV();
    const header = csv.split('\n')[0].replace(/^\uFEFF/, '');
    expect(header).toBe(
      '日期,帳本,行程,類型,動作,狀態,項目/事件,金額_NT,人民幣,匯差手續_NT,收付,分攤/成員,分類,備註,撤回原因,摘要,紀錄id',
    );
    expect(csv).toContain('2026-04-02,出遊,台南,出遊消費,新增,有效,早餐,120,80,5,胡 NT$70 ＋ 詹 NT$50,胡、詹,餐飲');
    expect(csv).toContain('"早餐,熱豆漿"');
    expect(csv).toContain('2026-04-03,日常,,日常消費,新增,已撤回,飲料,80,,,胡付款,各付一半,餐飲,,重複記帳');
  });
});
