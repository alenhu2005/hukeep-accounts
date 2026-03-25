import {
  computeMemberShareTotals,
  computePayerTotals,
  computeSettlements,
  computeTripDaySubtotals,
} from './finance.js';
import { esc } from './utils.js';

export function renderTripStatsCard(members, expenses) {
  const active = expenses.filter(e => !e._voided);
  const voidCount = expenses.length - active.length;

  if (expenses.length === 0) {
    return `<div class="card-body trip-stats-body"><div class="payer-stats-empty">尚無消費紀錄</div></div>`;
  }
  if (active.length === 0) {
    return `<div class="card-body trip-stats-body"><div class="payer-stats-empty">有效消費為 0（${voidCount} 筆已撤回）</div></div>`;
  }

  const totalSpend = active.reduce((s, e) => s + e.amount, 0);
  const payers = computePayerTotals(expenses);
  const share = computeMemberShareTotals(members, expenses);
  const prepaidSumAll = Object.values(payers).reduce((s, v) => s + v, 0);

  const prepaidRows = members.slice().sort((a, b) => (payers[b] || 0) - (payers[a] || 0));
  const pct = amt => (prepaidSumAll > 0.01 ? Math.round((amt / prepaidSumAll) * 100) : 0);

  const net = {};
  members.forEach(m => {
    net[m] = Math.round((payers[m] || 0) - (share[m] || 0));
  });
  const netRows = members.slice().sort((a, b) => Math.abs(net[b]) - Math.abs(net[a]));

  const shareRows = members.slice().sort((a, b) => (share[b] || 0) - (share[a] || 0));

  const prepaidBlock = `
    <div class="trip-stats-section">
      <div class="trip-stats-label">先付排行（佔先付合計比例）</div>
      <div class="payer-stats-list">
        ${prepaidRows
          .map((name, i) => {
            const amt = payers[name] || 0;
            return `<div class="payer-stats-row">
            <span class="payer-stats-rank">${i + 1}</span>
            <span class="payer-stats-name">${esc(name)}</span>
            <span class="payer-stats-amt">NT$${Math.round(amt).toLocaleString()}<span class="payer-stats-pct">${pct(amt)}%</span></span>
          </div>`;
          })
          .join('')}
      </div>
      <div class="trip-stats-foot">先付加總 NT$${Math.round(prepaidSumAll).toLocaleString()} · 有效消費 NT$${Math.round(totalSpend).toLocaleString()}${Math.abs(prepaidSumAll - totalSpend) < 0.5 ? ' ✓' : ''}</div>
    </div>`;

  const shareBlock = `
    <div class="trip-stats-section">
      <div class="trip-stats-label">每人分攤負擔（應付）</div>
      <div class="payer-stats-list">
        ${shareRows
          .map(
            name => `<div class="payer-stats-row payer-stats-row-plain">
          <span class="payer-stats-name">${esc(name)}</span>
          <span class="payer-stats-amt">NT$${Math.round(share[name] || 0).toLocaleString()}</span>
        </div>`,
          )
          .join('')}
      </div>
    </div>`;

  const netBlock = `
    <div class="trip-stats-section">
      <div class="trip-stats-label">淨額（先付 − 應付，正為多墊、負為少付）</div>
      <div class="payer-stats-list">
        ${netRows
          .map(name => {
            const v = net[name];
            const cls = v > 0 ? 'net-pos' : v < 0 ? 'net-neg' : '';
            return `<div class="payer-stats-row payer-stats-row-plain">
            <span class="payer-stats-name">${esc(name)}</span>
            <span class="payer-stats-amt ${cls}">${v > 0 ? '+' : ''}${v.toLocaleString()}</span>
          </div>`;
          })
          .join('')}
      </div>
    </div>`;

  const note = voidCount > 0 ? `<div class="trip-stats-note">＊ 已排除 ${voidCount} 筆撤回紀錄</div>` : '';

  return `<div class="card-body trip-stats-body">${prepaidBlock}${shareBlock}${netBlock}${note}</div>`;
}

export function buildTripSettlementSummaryText(trip, expenses) {
  const nonVoid = expenses.filter(e => !e._voided);
  const voidCount = expenses.length - nonVoid.length;
  const total = nonVoid.reduce((s, e) => s + e.amount, 0);
  const payers = computePayerTotals(expenses);
  const share = computeMemberShareTotals(trip.members, expenses);
  const payerLines = trip.members.slice().sort((a, b) => (payers[b] || 0) - (payers[a] || 0));
  const prepaidSum = Object.values(payers).reduce((s, v) => s + v, 0);
  const settlements = computeSettlements(trip.members, nonVoid);
  const dayMap = computeTripDaySubtotals(expenses);
  const dayKeys = Object.keys(dayMap).sort().reverse();

  let t = `【${trip.name}】出遊結算懶人包\n`;
  t += `成員：${trip.members.join('、')}\n`;
  t += `有效消費：${nonVoid.length} 筆，總計 NT$${Math.round(total)}`;
  if (voidCount > 0) t += `（另 ${voidCount} 筆已撤回不計）`;
  t += `\n\n── 依日小計 ──\n`;
  if (dayKeys.length === 0) t += '（無）\n';
  else dayKeys.forEach(d => { t += `${d}  NT$${Math.round(dayMap[d])}\n`; });

  t += `\n── 先付排行 ──\n`;
  payerLines.forEach((name, i) => {
    const amt = payers[name] || 0;
    const pc = prepaidSum > 0.01 ? Math.round((amt / prepaidSum) * 100) : 0;
    t += `${i + 1}. ${name}  NT$${Math.round(amt)}（${pc}%）\n`;
  });
  t += `先付加總 NT$${Math.round(prepaidSum)}\n`;

  t += `\n── 每人應付（分攤）──\n`;
  trip.members.forEach(name => {
    t += `${name}  NT$${Math.round(share[name] || 0)}\n`;
  });

  t += `\n── 淨額（先付−應付）──\n`;
  trip.members.forEach(name => {
    const v = Math.round((payers[name] || 0) - (share[name] || 0));
    t += `${name}  ${v > 0 ? '+' : ''}${v}\n`;
  });

  t += `\n── 建議轉帳（最少次數）──\n`;
  if (settlements.length === 0) t += '帳已平衡，不需轉帳。\n';
  else settlements.forEach(s => { t += `${s.from} → ${s.to}  NT$${Math.round(s.amount)}\n`; });
  t += `\n（由記帳本自動產生）`;
  return t;
}
