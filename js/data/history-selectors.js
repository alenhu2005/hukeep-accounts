/**
 * 由事件列還原單筆出遊消費的新台幣總額變更順序（add 與各次 edit 含 amount 者，相鄰重複金額略過）。
 * @param {string} expenseId
 * @param {import('../model.js').LedgerRow[]} allRows
 * @returns {{ date: string; amount: number }[]}
 */
export function getTripExpenseAmountRevisionTrail(expenseId, allRows) {
  const id = String(expenseId || '').trim();
  if (!id || !Array.isArray(allRows)) return [];
  const current = allRows.find(r => r && r.type === 'tripExpense' && r.action === 'add' && String(r.id || '').trim() === id);
  if (current && !allRows.some(r => r && r.type === 'tripExpense' && r.action === 'edit')) {
    const amount = Math.round(Math.max(0, parseFloat(current.amount) || 0));
    return amount > 0 ? [{ date: current.date ? String(current.date).slice(0, 10) : '', amount }] : [];
  }
  const match = row => row && row.type === 'tripExpense' && String(row.id || '').trim() === id;

  const trail = [];
  const add = allRows.find(r => match(r) && r.action === 'add');
  if (add && add.amount != null && String(add.amount).trim() !== '') {
    const a = Math.round(Math.max(0, parseFloat(add.amount) || 0));
    trail.push({ date: add.date ? String(add.date).slice(0, 10) : '', amount: a });
  }

  for (const e of allRows) {
    if (!match(e) || e.action !== 'edit') continue;
    if (e.amount === undefined || e.amount === null || String(e.amount).trim() === '') continue;
    const a = Math.round(Math.max(0, parseFloat(e.amount) || 0));
    const prev = trail[trail.length - 1];
    if (prev && prev.amount === a) continue;
    trail.push({ date: e.date ? String(e.date).slice(0, 10) : '', amount: a });
  }

  return trail;
}
