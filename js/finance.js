/** Daily ledger balance (胡 / 詹 semantics unchanged). */
export function computeBalance(records) {
  let net = 0;
  for (const r of records) {
    if (r._voided) continue;
    const a = parseFloat(r.amount) || 0;
    if (r.type === 'settlement') {
      if (r.paidBy === '胡') net += a;
      else net -= a;
      continue;
    }
    if (r.splitMode === '兩人付') {
      const hu = parseFloat(r.paidHu) || 0;
      const zhan = parseFloat(r.paidZhan) || 0;
      net += (hu - zhan) / 2;
      continue;
    }
    let shareHu = 0;
    let shareZhan = 0;
    if (r.splitMode === '均分') {
      shareHu = a / 2;
      shareZhan = a / 2;
    } else if (r.splitMode === '只有胡') {
      shareHu = a;
    } else {
      shareZhan = a;
    }
    if (r.paidBy === '胡') net += shareZhan;
    else net -= shareHu;
  }
  return net;
}

export function computeSettlements(members, expenses) {
  const bal = {};
  members.forEach(m => {
    bal[m] = 0;
  });
  for (const e of expenses.filter(x => !x._voided)) {
    const share = e.amount / (e.splitAmong.length || 1);
    if (e.payers && Array.isArray(e.payers)) {
      for (const p of e.payers) bal[p.name] = (bal[p.name] || 0) + (parseFloat(p.amount) || 0);
    } else {
      bal[e.paidBy] = (bal[e.paidBy] || 0) + e.amount;
    }
    for (const m of e.splitAmong) bal[m] = (bal[m] || 0) - share;
  }
  const pos = Object.entries(bal)
    .filter(([, v]) => v > 0.01)
    .map(([n, a]) => ({ n, a }));
  const neg = Object.entries(bal)
    .filter(([, v]) => v < -0.01)
    .map(([n, a]) => ({ n, a: -a }));
  const out = [];
  let i = 0;
  let j = 0;
  while (i < neg.length && j < pos.length) {
    const pay = Math.min(neg[i].a, pos[j].a);
    if (pay > 0.01) out.push({ from: neg[i].n, to: pos[j].n, amount: pay });
    neg[i].a -= pay;
    pos[j].a -= pay;
    if (neg[i].a < 0.01) i++;
    if (pos[j].a < 0.01) j++;
  }
  return out;
}

export function computePayerTotals(expenses) {
  const totals = {};
  for (const e of expenses) {
    if (e._voided) continue;
    if (e.payers && Array.isArray(e.payers)) {
      for (const p of e.payers) {
        const n = p.name;
        if (!n) continue;
        totals[n] = (totals[n] || 0) + (parseFloat(p.amount) || 0);
      }
    } else if (e.paidBy && e.paidBy !== '多人') {
      const n = e.paidBy;
      totals[n] = (totals[n] || 0) + (parseFloat(e.amount) || 0);
    }
  }
  return totals;
}

export function computeMemberShareTotals(members, expenses) {
  const out = {};
  members.forEach(m => {
    out[m] = 0;
  });
  for (const e of expenses) {
    if (e._voided) continue;
    const part = e.amount / (e.splitAmong.length || 1);
    for (const m of e.splitAmong) {
      if (Object.prototype.hasOwnProperty.call(out, m)) out[m] += part;
    }
  }
  return out;
}

export function computeTripDaySubtotals(expenses) {
  const byDay = {};
  for (const e of expenses) {
    if (e._voided) continue;
    const d = e.date || '（無日期）';
    if (!byDay[d]) byDay[d] = 0;
    byDay[d] += e.amount;
  }
  return byDay;
}
