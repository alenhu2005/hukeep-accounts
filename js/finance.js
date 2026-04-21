import { USER_A, USER_B } from './config.js';
import { GAMBLING_CATEGORY } from './category.js';

/** 出遊消費：匯差／手續費（新台幣），>0 才視為有效 */
export function tripExpenseFxFeeNtd(e) {
  const fx = parseFloat(e?.fxFeeNtd);
  return Number.isFinite(fx) && fx > 0 ? fx : 0;
}

export function tripExpenseBillNtd(e) {
  return (parseFloat(e?.amount) || 0) + tripExpenseFxFeeNtd(e);
}

/**
 * 每人分攤金額（新台幣）；詳細分攤時依原比例放大至「消費＋匯差手續費」。
 * @param {{ amount?: number|string; fxFeeNtd?: number|string; splitAmong?: string[]; splitDetails?: { name?: string; amount?: number|string }[] }} expense
 */
export function computeExpenseShares(expense) {
  const baseAmt = parseFloat(expense.amount) || 0;
  const fee = tripExpenseFxFeeNtd(expense);
  const bill = baseAmt + fee;
  const details = Array.isArray(expense.splitDetails)
    ? expense.splitDetails
        .map(d => ({
          name: String(d?.name || '').trim(),
          amount: parseFloat(d?.amount) || 0,
        }))
        .filter(d => d.name && d.amount > 0.0001)
    : [];
  if (details.length > 0) {
    const baseSum = details.reduce((s, d) => s + d.amount, 0);
    if (baseSum > 0.0001) {
      return details.map(d => ({
        name: d.name,
        amount: (d.amount * bill) / baseSum,
      }));
    }
  }
  const splitAmong = Array.isArray(expense.splitAmong) ? expense.splitAmong : [];
  const n = splitAmong.length || 1;
  const share = bill / n;
  return splitAmong.map(name => ({ name, amount: share }));
}

/** Daily ledger balance: positive = USER_B owes USER_A, negative = USER_A owes USER_B. */
export function computeBalance(records) {
  let net = 0;
  for (const r of records) {
    if (r._voided) continue;
    const a = parseFloat(r.amount) || 0;
    if (r.type === 'settlement') {
      if (r.paidBy === USER_A) net += a;
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
    if (r.paidBy === USER_A) net += shareZhan;
    else net -= shareHu;
  }
  return net;
}

/**
 * @param {string[]} members
 * @param {object[]} expenses
 * @param {{ from: string; to: string; amount: number }[]} [adjustments] 已記錄的出遊還款（from 付給 to）
 */
export function computeSettlements(members, expenses, adjustments = []) {
  const bal = {};
  members.forEach(m => {
    bal[m] = 0;
  });
  for (const e of expenses.filter(x => !x._voided)) {
    const shares = computeExpenseShares(e);
    const fee = tripExpenseFxFeeNtd(e);
    const baseAmt = parseFloat(e.amount) || 0;
    const payerRows =
      e.payers && Array.isArray(e.payers)
        ? e.payers.filter(
            p => p && String(p.name || '').trim() && (parseFloat(p.amount) || 0) > 0.0001,
          )
        : [];
    if (payerRows.length > 0) {
      const paidTotal = payerRows.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      if (paidTotal > 0.0001) {
        for (const p of payerRows) {
          const n = String(p.name).trim();
          const pa = parseFloat(p.amount) || 0;
          bal[n] = (bal[n] || 0) + pa + fee * (pa / paidTotal);
        }
      } else {
        const names = payerRows.map(p => String(p.name || '').trim()).filter(Boolean);
        const k = names.length || 1;
        const add = fee / k;
        for (const n of names) bal[n] = (bal[n] || 0) + add;
      }
    } else if (e.paidBy && e.paidBy !== '多人') {
      bal[e.paidBy] = (bal[e.paidBy] || 0) + baseAmt + fee;
    }
    for (const s of shares) {
      bal[s.name] = (bal[s.name] || 0) - s.amount;
    }
  }
  for (const adj of adjustments) {
    const x = parseFloat(adj.amount) || 0;
    if (x < 0.01) continue;
    if (bal[adj.from] !== undefined) bal[adj.from] += x;
    if (bal[adj.to] !== undefined) bal[adj.to] -= x;
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
    const fee = tripExpenseFxFeeNtd(e);
    const baseAmt = parseFloat(e.amount) || 0;
    if (e.payers && Array.isArray(e.payers)) {
      const payerRows = e.payers.filter(
        p => p && String(p.name || '').trim() && (parseFloat(p.amount) || 0) > 0.0001,
      );
      const paidTotal = payerRows.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      if (payerRows.length > 0 && paidTotal > 0.0001) {
        for (const p of payerRows) {
          const n = String(p.name).trim();
          const pa = parseFloat(p.amount) || 0;
          totals[n] = (totals[n] || 0) + pa + fee * (pa / paidTotal);
        }
      } else if (payerRows.length > 0) {
        const names = payerRows.map(p => String(p.name || '').trim()).filter(Boolean);
        const k = names.length || 1;
        const add = fee / k;
        for (const n of names) totals[n] = (totals[n] || 0) + add;
      }
    } else if (e.paidBy && e.paidBy !== '多人') {
      const n = e.paidBy;
      totals[n] = (totals[n] || 0) + baseAmt + fee;
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
    const shares = computeExpenseShares(e);
    for (const s of shares) {
      if (Object.prototype.hasOwnProperty.call(out, s.name)) out[s.name] += s.amount;
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
    byDay[d] += (parseFloat(e.amount) || 0) + tripExpenseFxFeeNtd(e);
  }
  return byDay;
}

/**
 * 單筆日常支出對結算餘額的增量（與 {@link computeBalance} 內日常邏輯一致；正＝詹欠胡）。
 * 不含 settlement。
 */
export function dailyExpenseBalanceDeltaForUserA(r) {
  if (!r || r._voided || r.type !== 'daily') return 0;
  const a = parseFloat(r.amount) || 0;
  if (r.splitMode === '兩人付') {
    const hu = parseFloat(r.paidHu) || 0;
    const zhan = parseFloat(r.paidZhan) || 0;
    return (hu - zhan) / 2;
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
  if (r.paidBy === USER_A) return shareZhan;
  return -shareHu;
}

/**
 * 日常帳：僅分類為賭博之紀錄，依結算邏輯加總每人贏／輸／淨（胡、詹）。
 */
export function accumulateDailyGamblingWinLose(records) {
  let winA = 0;
  let loseA = 0;
  let winB = 0;
  let loseB = 0;
  for (const r of records) {
    if (r._voided || r.type !== 'daily') continue;
    const cat = typeof r.category === 'string' ? r.category.trim() : '';
    if (cat !== GAMBLING_CATEGORY) continue;
    const dA = dailyExpenseBalanceDeltaForUserA(r);
    if (dA > 0.01) {
      winA += dA;
      loseB += dA;
    } else if (dA < -0.01) {
      loseA += -dA;
      winB += -dA;
    }
  }
  return {
    [USER_A]: { win: winA, lose: loseA, net: winA - loseA },
    [USER_B]: { win: winB, lose: loseB, net: winB - loseB },
  };
}

/**
 * 出遊消費：僅 category 為賭博者。每人淨額＝（作為贏家先拿／代收）−（分攤負擔）。
 */
export function computeTripGamblingWinLoseByMember(expenses) {
  const win = {};
  const lose = {};
  for (const e of expenses) {
    if (e._voided) continue;
    if (e.category !== GAMBLING_CATEGORY) continue;
    const shares = computeExpenseShares(e);
    const shareMap = {};
    for (const s of shares) {
      shareMap[s.name] = (shareMap[s.name] || 0) + s.amount;
    }
    const fee = tripExpenseFxFeeNtd(e);
    const baseAmt = parseFloat(e.amount) || 0;
    const payerMap = {};
    if (e.payers && Array.isArray(e.payers)) {
      const payerRows = e.payers.filter(
        p => p && String(p.name || '').trim() && (parseFloat(p.amount) || 0) > 0.0001,
      );
      const paidTotal = payerRows.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      if (payerRows.length > 0 && paidTotal > 0.0001) {
        for (const p of payerRows) {
          const n = String(p.name).trim();
          const pa = parseFloat(p.amount) || 0;
          payerMap[n] = (payerMap[n] || 0) + pa + fee * (pa / paidTotal);
        }
      } else {
        const names = payerRows.map(p => String(p.name || '').trim()).filter(Boolean);
        const k = names.length || 1;
        const add = fee / k;
        for (const n of names) payerMap[n] = (payerMap[n] || 0) + add;
      }
    } else if (e.paidBy && e.paidBy !== '多人') {
      payerMap[e.paidBy] = (payerMap[e.paidBy] || 0) + baseAmt + fee;
    }
    const names = new Set([...Object.keys(payerMap), ...Object.keys(shareMap)]);
    for (const n of names) {
      const paid = payerMap[n] || 0;
      const sh = shareMap[n] || 0;
      const net = paid - sh;
      if (net > 0.01) {
        win[n] = (win[n] || 0) + net;
      } else if (net < -0.01) {
        lose[n] = (lose[n] || 0) + -net;
      }
    }
  }
  const allNames = new Set([...Object.keys(win), ...Object.keys(lose)]);
  const out = {};
  for (const n of allNames) {
    const w = win[n] || 0;
    const l = lose[n] || 0;
    out[n] = { win: w, lose: l, net: w - l };
  }
  return out;
}
