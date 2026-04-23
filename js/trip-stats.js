import {
  computeMemberShareTotals,
  computePayerTotals,
  computeSettlements,
  tripExpenseBillNtd,
  tripExpenseFxFeeNtd,
  computeTripDaySubtotals,
  computeTripGamblingWinLoseByMember,
} from './finance.js';
import { esc } from './utils.js';
import { makePieChartSVG, CAT_PIE_COLORS } from './pie-chart.js';
import { appState } from './state.js';
import { getTripSettlementAdjustmentsFromRows } from './data.js';
import { gamblingSplitFromCatTotals, GAMBLING_CATEGORY } from './category.js';

/** 有效消費中若有「賭博」分類，先付／應付僅用一般消費；否則兩者皆為全部有效消費。 */
function tripStatsExpenseSplit(expenses) {
  const active = expenses.filter(e => !e._voided);
  const hasGambling = active.some(e => e.category === GAMBLING_CATEGORY);
  const generalOnly = hasGambling ? active.filter(e => e.category !== GAMBLING_CATEGORY) : active;
  return { active, generalOnly, hasGambling };
}

function formatNetSigned(v) {
  const n = Math.round(v);
  return (n > 0 ? '+' : '') + n.toLocaleString();
}

function formatCurrency(value) {
  return `NT$${Math.round(value || 0).toLocaleString()}`;
}

function tripDateRangeLabel(trip, expenses, settlements = []) {
  const dates = [];
  for (const e of expenses || []) {
    const d = String(e?.date || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dates.push(d);
  }
  for (const s of settlements || []) {
    const d = String(s?.date || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dates.push(d);
  }
  const created = String(trip?.createdAt || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(created)) dates.push(created);
  if (dates.length === 0) return '';
  const sorted = dates.slice().sort();
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  return start === end ? start : `${start} ～ ${end}`;
}

function computeOutstandingByMember(members, settlements) {
  const out = Object.fromEntries((members || []).map(name => [name, 0]));
  for (const row of settlements || []) {
    const amount = Math.round(parseFloat(row?.amount) || 0);
    if (!(amount > 0)) continue;
    if (row.to in out) out[row.to] += amount;
    if (row.from in out) out[row.from] -= amount;
  }
  return out;
}

function formatOutstandingLabel(value) {
  const n = Math.round(value || 0);
  if (n > 0) return `待收 NT$${n.toLocaleString()}`;
  if (n < 0) return `待付 NT$${Math.abs(n).toLocaleString()}`;
  return '已結清';
}

/**
 * 未含賭博的應付分攤 − 賭博表「淨」（與上方同欄；淨＝賭博線上先付−分攤）。
 */
function walletEffectiveBurden(name, shareExclGambleMap, gamblePlMap) {
  const sh = shareExclGambleMap[name] || 0;
  const net = gamblePlMap[name]?.net || 0;
  return Math.round(sh - net);
}

/**
 * @param {string[]} members
 * @param {object[]} expenses
 * @param {{ idSuffix?: string }} [opts] 若設 `idSuffix: '-modal'`，圓餅區 id 與 onclick 與頁內區隔，避免重複 id。
 */
export function renderTripStatsCard(members, expenses, opts = {}) {
  const idSuffix = opts.idSuffix ?? '';
  const pieToggleClick = idSuffix ? 'toggleTripStatsPieCollapseModal()' : 'toggleTripStatsPieCollapse()';
  const voidCount = expenses.filter(e => e._voided).length;
  const { active, generalOnly, hasGambling } = tripStatsExpenseSplit(expenses);

  if (expenses.length === 0) {
    return `<div class="card-body trip-stats-body"><div class="payer-stats-empty">尚無消費紀錄</div></div>`;
  }
  if (active.length === 0) {
    return `<div class="card-body trip-stats-body"><div class="payer-stats-empty">有效消費為 0（${voidCount} 筆已撤回）</div></div>`;
  }

  const totalSpend = active.reduce((s, e) => s + tripExpenseBillNtd(e), 0);
  const generalSpend = generalOnly.reduce((s, e) => s + tripExpenseBillNtd(e), 0);
  const gambleSpendSum = Math.round(
    active
      .filter(e => e.category === GAMBLING_CATEGORY)
      .reduce((s, e) => s + (parseFloat(e.amount) || 0) + tripExpenseFxFeeNtd(e), 0),
  );

  const payers = computePayerTotals(generalOnly);
  const share = computeMemberShareTotals(members, generalOnly);
  const prepaidSumAll = Object.values(payers).reduce((s, v) => s + v, 0);

  const payersAll = hasGambling ? computePayerTotals(active) : payers;
  const shareAll = hasGambling ? computeMemberShareTotals(members, active) : share;

  const netExcl = {};
  const netIncl = {};
  members.forEach(m => {
    netExcl[m] = Math.round((payers[m] || 0) - (share[m] || 0));
    netIncl[m] = Math.round((payersAll[m] || 0) - (shareAll[m] || 0));
  });
  const netRows = members.slice().sort((a, b) => Math.abs(netIncl[b]) - Math.abs(netIncl[a]));

  const prepaidRows = members.slice().sort((a, b) => (payers[b] || 0) - (payers[a] || 0));
  const pct = amt => (prepaidSumAll > 0.01 ? Math.round((amt / prepaidSumAll) * 100) : 0);

  const shareRows = members.slice().sort((a, b) => (share[b] || 0) - (share[a] || 0));

  const catTotals = {};
  for (const e of active) {
    const a = tripExpenseBillNtd(e);
    const cat = e.category || '未分類';
    catTotals[cat] = (catTotals[cat] || 0) + a;
  }
  const pieGrandTotal = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const { gambleTotal, nonGamblingTotal, nonGamblingSlices } = gamblingSplitFromCatTotals(
    catTotals,
    pieGrandTotal,
  );
  const pieDenom = nonGamblingTotal;
  const gambleR = Math.round(gambleTotal);
  const nonGamR = Math.round(nonGamblingTotal);
  const pieSlices = nonGamblingSlices.map(([cat, amt]) => ({
    cat,
    amount: amt,
    color: CAT_PIE_COLORS[cat] || '#94a3b8',
  }));
  const pieLabelOpts = { cat: true, pct: true, amt: false };

  const tripGamblePl = computeTripGamblingWinLoseByMember(active);
  const tripGambleNames = Object.keys(tripGamblePl).sort(
    (a, b) => Math.abs(tripGamblePl[b].net) - Math.abs(tripGamblePl[a].net),
  );
  const tripGamblePlHead = `<div class="analysis-gamble-pl-row analysis-gamble-pl-row--head">
      <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--name"></span>
      <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--num">贏</span>
      <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--num">輸</span>
      <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--num">淨</span>
    </div>`;
  const tripGamblePlHTML =
    gambleR > 0 && tripGambleNames.length > 0
      ? `<div class="analysis-gamble-pl trip-gamble-pl">
      <div class="analysis-gamble-pl-title">賭博輸贏</div>
      <div class="analysis-gamble-pl-grid" role="table" aria-label="賭博輸贏">
      ${tripGamblePlHead}
      ${tripGambleNames
        .map(name => {
          const x = tripGamblePl[name];
          const wR = Math.round(x.win);
          const lR = Math.round(x.lose);
          const nR = Math.round(x.net);
          const netCls =
            nR > 0 ? 'analysis-gamble-pl-net--win' : nR < 0 ? 'analysis-gamble-pl-net--lose' : '';
          return `<div class="analysis-gamble-pl-row">
        <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--name">${esc(name)}</span>
        <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--num">NT$${wR.toLocaleString()}</span>
        <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--num">NT$${lR.toLocaleString()}</span>
        <span class="analysis-gamble-pl-cell analysis-gamble-pl-cell--num analysis-gamble-pl-cell--net ${netCls}">NT$${nR.toLocaleString()}</span>
      </div>`;
        })
        .join('')}
      </div>
      <div class="analysis-gamble-pl-footnote">加總 NT$${gambleR.toLocaleString()}</div>
    </div>`
      : gambleR > 0
        ? `<div class="analysis-gamble-pl trip-gamble-pl">
      <div class="analysis-gamble-pl-title">賭博輸贏</div>
      <p class="analysis-gamble-pl-msg">無法顯示成員輸贏</p>
    </div>`
        : '';

  const pieInner =
    pieSlices.length === 0 && gambleR > 0
      ? `<div class="analysis-pie-empty" style="margin-bottom:0">無一般分類可畫圓餅（賭博見上方輸贏）</div>`
      : `<div class="trip-pie-wrap analysis-pie-wrap">
        ${makePieChartSVG(pieSlices, pieDenom > 0 ? pieDenom : 1, pieLabelOpts)}
      </div>`;

  const pieExpanded = appState.tripStatsPieExpanded === true;
  const tripPieToggleIconPath = pieExpanded
    ? 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z'
    : 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z';

  const walletOutByMember = members
    .slice()
    .sort(
      (a, b) => walletEffectiveBurden(b, share, tripGamblePl) - walletEffectiveBurden(a, share, tripGamblePl),
    );
  const totalMembers = members.length;
  const averagePerMember = totalMembers > 0 ? Math.round(generalSpend / totalMembers) : 0;
  const topPayerName = prepaidRows[0] || '';
  const topShareName = walletOutByMember[0] || shareRows[0] || '';
  const topPayerAmount = topPayerName ? Math.round(payers[topPayerName] || 0) : 0;
  const topShareAmount = topShareName
    ? Math.round(hasGambling ? walletEffectiveBurden(topShareName, share, tripGamblePl) : share[topShareName] || 0)
    : 0;
  const topCreditorName = members
    .slice()
    .sort((a, b) => (netIncl[b] || 0) - (netIncl[a] || 0))
    .find(name => (netIncl[name] || 0) > 0);
  const topDebtorName = members
    .slice()
    .sort((a, b) => (netIncl[a] || 0) - (netIncl[b] || 0))
    .find(name => (netIncl[name] || 0) < 0);
  const topCreditorAmount = topCreditorName ? Math.round(netIncl[topCreditorName] || 0) : 0;
  const topDebtorAmount = topDebtorName ? Math.abs(Math.round(netIncl[topDebtorName] || 0)) : 0;

  let statI = 0;
  let rowI = 0;
  let legendIdx = 0;
  const pieLegendRows = [];
  for (const s of pieSlices) {
    const pPie = pieDenom > 0 ? Math.round((s.amount / pieDenom) * 100) : 0;
    pieLegendRows.push(`<div class="analysis-legend-row" style="--legend-i:${legendIdx++}">
          <div class="analysis-legend-swatch" style="background:${s.color}"></div>
          <div class="analysis-legend-name">${esc(s.cat)}</div>
          <div class="analysis-legend-pct">${pPie}%</div>
          <div class="analysis-legend-amt">${formatCurrency(s.amount)}</div>
        </div>`);
  }

  const tripStatsHero = `<div class="trip-stats-section trip-stats-hero" style="--stat-i:${statI++}">
      <div class="trip-stats-hero-top">
        <div class="trip-stats-hero-copy">
          <div class="trip-stats-hero-kicker">出遊統計摘要</div>
          <div class="trip-stats-hero-total">${formatCurrency(totalSpend)}</div>
          <div class="trip-stats-hero-sub">這趟共 ${active.length} 筆有效消費，${members.length} 位成員一起記帳</div>
        </div>
        <div class="trip-stats-hero-meta">
          <span class="trip-stats-chip">一般支出 ${formatCurrency(generalSpend)}</span>
          ${hasGambling ? `<span class="trip-stats-chip trip-stats-chip--accent">賭博 ${formatCurrency(gambleSpendSum)}</span>` : `<span class="trip-stats-chip">平均每人 ${formatCurrency(averagePerMember)}</span>`}
        </div>
      </div>
      <div class="trip-stats-summary-grid">
        <div class="trip-stats-summary-card">
          <div class="trip-stats-summary-label">出最多</div>
          <div class="trip-stats-summary-name">${esc(topPayerName || '尚無資料')}</div>
          <div class="trip-stats-summary-value">${topPayerName ? formatCurrency(topPayerAmount) : 'NT$0'}</div>
          <div class="trip-stats-summary-note">${topPayerName ? '先付金額最高' : '目前沒有有效消費'}</div>
        </div>
        <div class="trip-stats-summary-card">
          <div class="trip-stats-summary-label">${hasGambling ? '實際負擔最多' : '分攤最多'}</div>
          <div class="trip-stats-summary-name">${esc(topShareName || '尚無資料')}</div>
          <div class="trip-stats-summary-value">${topShareName ? formatCurrency(topShareAmount) : 'NT$0'}</div>
          <div class="trip-stats-summary-note">${hasGambling ? '一般應付扣掉賭博淨額後最高' : '應付金額最高'}</div>
        </div>
        <div class="trip-stats-summary-card trip-stats-summary-card--status">
          <div class="trip-stats-summary-label">${topCreditorName ? '最多待收' : '待收 / 待付'}</div>
          ${
            topCreditorName
              ? `<div class="trip-stats-summary-name">${esc(topCreditorName)}</div>
          <div class="trip-stats-summary-value">${formatCurrency(topCreditorAmount)}</div>
          <div class="trip-stats-summary-note">${topDebtorName ? `如果現在結算，${esc(topDebtorName)} 還要再付 ${formatCurrency(topDebtorAmount)}` : '其餘成員已接近平衡'}</div>`
              : `<div class="trip-stats-summary-name">目前接近平衡</div>
          <div class="trip-stats-summary-value">已結清</div>
          <div class="trip-stats-summary-note">沒有明顯待收待付差額</div>`
          }
        </div>
      </div>
    </div>`;

  const tripPieBlock =
    pieGrandTotal > 0
      ? `
    <div class="trip-stats-section trip-stats-section--card trip-stats-pie-section" style="--stat-i:${statI++}">
      ${tripGamblePlHTML}
      <div class="trip-stats-section-head trip-pie-toolbar">
        <div>
          <span class="trip-stats-label trip-stats-label--pie-toolbar">分類支出</span>
          <p class="trip-stats-section-desc">看看錢大多花在哪些分類</p>
        </div>
        <button type="button" id="trip-stats-pie-fold-btn${idSuffix}" class="trip-pie-fold-btn" onclick="${pieToggleClick}" aria-expanded="${pieExpanded ? 'true' : 'false'}" aria-controls="trip-stats-pie-panel${idSuffix}" title="收合／展開圓餅圖" aria-label="收合或展開圓餅圖">
          <span class="trip-pie-fold-label">圓餅圖</span>
          <svg id="trip-stats-pie-toggle-icon${idSuffix}" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${tripPieToggleIconPath}"/></svg>
        </button>
      </div>
      <div id="trip-stats-pie-panel${idSuffix}" class="collapsible-panel${pieExpanded ? ' is-open' : ''}">
        <div class="collapsible-panel__inner trip-stats-pie-panel-inner">
          ${pieInner}
        </div>
      </div>
      <div class="analysis-legend-card trip-pie-legend">
        ${pieLegendRows.join('')}
        <div class="analysis-legend-row analysis-legend-row--total" style="--legend-n:${legendIdx}">
          <div class="analysis-legend-swatch analysis-legend-swatch--empty"></div>
          <div class="analysis-legend-name analysis-legend-name--total">合計</div>
          <div class="analysis-legend-pct">100%</div>
          <div class="analysis-legend-amt analysis-legend-amt--total">${formatCurrency(nonGamR)}</div>
        </div>
      </div>
    </div>`
      : '';

  const prepaidTitle = hasGambling ? '先付排行（未含賭博，佔合計比例）' : '先付排行（佔先付合計比例）';
  const prepaidFoot = hasGambling
    ? `先付加總 NT$${Math.round(prepaidSumAll).toLocaleString()}（未含賭博） · 一般支出 NT$${Math.round(generalSpend).toLocaleString()} · 賭博 NT$${gambleSpendSum.toLocaleString()} · 有效消費合計 NT$${Math.round(totalSpend).toLocaleString()}`
    : `先付加總 NT$${Math.round(prepaidSumAll).toLocaleString()} · 有效消費 NT$${Math.round(totalSpend).toLocaleString()}${Math.abs(prepaidSumAll - totalSpend) < 0.5 ? ' ✓' : ''}`;

  const prepaidBlock = `<div class="trip-stats-section trip-stats-section--card" style="--stat-i:${statI++}">
      <div class="trip-stats-section-head">
        <div>
          <div class="trip-stats-label">誰出最多</div>
          <p class="trip-stats-section-desc">${esc(prepaidTitle)}</p>
        </div>
      </div>
      <div class="payer-stats-list">
        ${prepaidRows
          .map((name, i) => {
            const amt = payers[name] || 0;
            return `<div class="payer-stats-row" style="--row-i:${rowI++}">
            <span class="payer-stats-rank">${i + 1}</span>
            <span class="payer-stats-name">${esc(name)}</span>
            <span class="payer-stats-amt">NT$${Math.round(amt).toLocaleString()}<span class="payer-stats-pct">${pct(amt)}%</span></span>
          </div>`;
          })
          .join('')}
      </div>
      <div class="trip-stats-foot">${prepaidFoot}</div>
    </div>`;

  const shareTitle = hasGambling ? '每人分攤負擔（應付，未含賭博）' : '每人分攤負擔（應付）';
  const shareBlock = `<div class="trip-stats-section trip-stats-section--card" style="--stat-i:${statI++}">
      <div class="trip-stats-section-head">
        <div>
          <div class="trip-stats-label">${hasGambling ? '誰負擔最多' : '誰分攤最多'}</div>
          <p class="trip-stats-section-desc">${esc(shareTitle)}</p>
        </div>
      </div>
      <div class="payer-stats-list">
        ${shareRows
          .map(
            name => `<div class="payer-stats-row payer-stats-row-plain" style="--row-i:${rowI++}">
          <span class="payer-stats-name">${esc(name)}</span>
          <span class="payer-stats-amt">NT$${Math.round(share[name] || 0).toLocaleString()}</span>
        </div>`,
          )
          .join('')}
      </div>
    </div>`;

  const netBlock = `<div class="trip-stats-section trip-stats-section--card" style="--stat-i:${statI++}">
      <div class="trip-stats-section-head">
        <div>
          <div class="trip-stats-label">目前差額</div>
          <p class="trip-stats-section-desc">看誰目前該收、誰目前該付</p>
        </div>
      </div>
      <div class="trip-stats-net-list">
        ${netRows
          .map(name => {
            const ve = netExcl[name];
            const vi = netIncl[name];
            const statusValue = hasGambling ? vi : ve;
            const statusCls =
              statusValue > 0 ? 'trip-stats-net-card--creditor' : statusValue < 0 ? 'trip-stats-net-card--debtor' : 'trip-stats-net-card--balanced';
            const statusLabel = formatOutstandingLabel(statusValue);
            return `<div class="trip-stats-net-card ${statusCls}">
              <div class="trip-stats-net-card-head">
                <span class="trip-stats-net-card-name">${esc(name)}</span>
                <span class="trip-stats-net-card-status">${esc(statusLabel)}</span>
              </div>
              ${
                hasGambling
                  ? `<div class="trip-stats-net-card-compare">
                <span>未含賭博 <strong class="${ve > 0 ? 'net-pos' : ve < 0 ? 'net-neg' : ''}">${formatNetSigned(ve)}</strong></span>
                <span>含賭博 <strong class="${vi > 0 ? 'net-pos' : vi < 0 ? 'net-neg' : ''}">${formatNetSigned(vi)}</strong></span>
              </div>`
                  : `<div class="trip-stats-net-card-compare">
                <span>先付 ${formatCurrency(payers[name] || 0)}</span>
                <span>應付 ${formatCurrency(share[name] || 0)}</span>
              </div>`
              }
            </div>`;
          })
          .join('')}
      </div>
    </div>`;

  const walletOutTripSection = `<div class="trip-stats-section trip-stats-section--card trip-stats-section--accent trip-stats-wallet-out" style="--stat-i:${statI++}">
      <div class="trip-stats-section-head">
        <div>
          <div class="trip-stats-label">實際負擔</div>
          <p class="trip-stats-section-desc">${hasGambling ? '一般應付扣掉賭博淨額後，每個人最後真正承擔多少' : '每個人最後真正承擔多少'}</p>
        </div>
      </div>
      <div class="trip-stats-wallet-out-list">
        ${walletOutByMember
          .map(name => {
            const v = walletEffectiveBurden(name, share, tripGamblePl);
            const negCls = v < 0 ? ' trip-stats-wallet-out-row-amt--credit' : '';
            const disp =
              v < 0 ? `−NT$${Math.abs(v).toLocaleString()}` : `NT$${v.toLocaleString()}`;
            return `<div class="trip-stats-wallet-out-row">
          <span class="trip-stats-wallet-out-name">${esc(name)}</span>
          <span class="trip-stats-wallet-out-row-amt${negCls}">${disp}</span>
        </div>`;
          })
          .join('')}
      </div>
      <div class="trip-stats-wallet-out-total">合計 ${formatCurrency(generalSpend)}</div>
    </div>`;

  const rankingGrid = `<div class="trip-stats-compare-grid">${prepaidBlock}${shareBlock}</div>`;

  return `<div class="card-body trip-stats-body">${tripStatsHero}${walletOutTripSection}${netBlock}${rankingGrid}${tripPieBlock}</div>`;
}

export function buildTripClosureReportModel(trip, expenses, allRows = appState.allRows) {
  const members = Array.isArray(trip?.members) ? trip.members.slice() : [];
  const activeExpenses = (expenses || []).filter(e => !e?._voided);
  const voidCount = (expenses || []).length - activeExpenses.length;
  const { active: nonVoid, generalOnly, hasGambling } = tripStatsExpenseSplit(expenses || []);
  const total = nonVoid.reduce((s, e) => s + tripExpenseBillNtd(e), 0);
  const generalTotal = generalOnly.reduce((s, e) => s + tripExpenseBillNtd(e), 0);
  const gamblingTotal = Math.max(0, Math.round(total - generalTotal));
  const payers = computePayerTotals(generalOnly);
  const payersAll = hasGambling ? computePayerTotals(nonVoid) : payers;
  const share = computeMemberShareTotals(members, generalOnly);
  const shareAll = hasGambling ? computeMemberShareTotals(members, nonVoid) : share;
  const gamblePl = computeTripGamblingWinLoseByMember(nonVoid);
  const recordedSettlements = getTripSettlementAdjustmentsFromRows(trip.id, allRows).filter(
    s => Math.round(parseFloat(s.amount) || 0) > 0,
  );
  const remainingSettlements = computeSettlements(members, nonVoid, recordedSettlements);
  const outstandingByMember = computeOutstandingByMember(members, remainingSettlements);
  const dayMap = computeTripDaySubtotals(expenses || []);
  const daySubtotals = Object.keys(dayMap)
    .sort()
    .reverse()
    .map(date => ({ date, amount: Math.round(dayMap[date]) }));
  const dateRangeLabel = tripDateRangeLabel(trip, nonVoid, recordedSettlements);
  const memberRows = members.map(name => {
    const paid = Math.round(payersAll[name] || 0);
    const shareAmount = hasGambling ? walletEffectiveBurden(name, share, gamblePl) : Math.round(share[name] || 0);
    const net = Math.round((payersAll[name] || 0) - (shareAll[name] || 0));
    const outstanding = Math.round(outstandingByMember[name] || 0);
    return {
      name,
      paid,
      share: Math.round(shareAmount),
      net,
      outstanding,
      outstandingLabel: formatOutstandingLabel(outstanding),
    };
  });

  return {
    tripId: trip.id,
    tripName: trip.name,
    memberCount: members.length,
    members,
    activeCount: nonVoid.length,
    voidCount,
    total: Math.round(total),
    generalTotal: Math.round(generalTotal),
    gamblingTotal,
    hasGambling,
    prepaidSum: Math.round(Object.values(payersAll).reduce((s, v) => s + v, 0)),
    recordedSettlementCount: recordedSettlements.length,
    recordedSettlementTotal: Math.round(recordedSettlements.reduce((s, row) => s + (parseFloat(row.amount) || 0), 0)),
    remainingSettlementCount: remainingSettlements.length,
    remainingSettlementTotal: Math.round(remainingSettlements.reduce((s, row) => s + (parseFloat(row.amount) || 0), 0)),
    dateRangeLabel,
    daySubtotals,
    memberRows,
    remainingSettlements: remainingSettlements.map(s => ({
      from: s.from,
      to: s.to,
      amount: Math.round(s.amount),
    })),
    recordedSettlements: recordedSettlements.map(s => ({
      from: s.from,
      to: s.to,
      amount: Math.round(parseFloat(s.amount) || 0),
    })),
  };
}

export function renderTripClosureReportCard(model) {
  const memberRowsHtml = model.memberRows
    .map(
      row => `<div class="trip-closure-report-person-row">
      <div class="trip-closure-report-person-name">${esc(row.name)}</div>
      <div class="trip-closure-report-person-num">NT$${row.paid.toLocaleString()}</div>
      <div class="trip-closure-report-person-num">NT$${row.share.toLocaleString()}</div>
      <div class="trip-closure-report-person-outstanding${row.outstanding > 0 ? ' is-positive' : row.outstanding < 0 ? ' is-negative' : ''}">${esc(row.outstandingLabel)}</div>
    </div>`,
    )
    .join('');
  const transferRowsHtml = model.remainingSettlements.length
    ? model.remainingSettlements
        .map(
          row => `<div class="trip-closure-report-transfer-row">
        <span class="trip-closure-report-transfer-flow">${esc(row.from)} → ${esc(row.to)}</span>
        <span class="trip-closure-report-transfer-amt">NT$${row.amount.toLocaleString()}</span>
      </div>`,
        )
        .join('')
    : '<div class="trip-closure-report-empty">目前已全部結清，不需再轉帳。</div>';
  const recordedRowsHtml = model.recordedSettlements.length
    ? model.recordedSettlements
        .map(
          row => `<div class="trip-closure-report-mini-row">
        <span>${esc(row.from)} → ${esc(row.to)}</span>
        <span>NT$${row.amount.toLocaleString()}</span>
      </div>`,
        )
        .join('')
    : '<div class="trip-closure-report-empty trip-closure-report-empty--mini">尚未記錄還款</div>';
  const dayRowsHtml = model.daySubtotals.length
    ? model.daySubtotals
        .map(
          row => `<div class="trip-closure-report-mini-row">
        <span>${esc(row.date)}</span>
        <span>NT$${row.amount.toLocaleString()}</span>
      </div>`,
        )
        .join('')
    : '<div class="trip-closure-report-empty trip-closure-report-empty--mini">尚無日期資料</div>';

  return `<div class="trip-closure-report-card">
    <div class="trip-closure-report-hero">
      <div class="trip-closure-report-kicker">已結束行程報告</div>
      <h4 class="trip-closure-report-title">${esc(model.tripName)}</h4>
      <div class="trip-closure-report-meta">
        <span>${model.dateRangeLabel ? esc(model.dateRangeLabel) : '未標記日期'}</span>
        <span>${model.memberCount} 人</span>
        <span>${model.activeCount} 筆有效消費</span>
      </div>
      <div class="trip-closure-report-metrics">
        <div class="trip-closure-report-metric">
          <span class="trip-closure-report-metric-label">總支出</span>
          <strong>NT$${model.total.toLocaleString()}</strong>
        </div>
        <div class="trip-closure-report-metric">
          <span class="trip-closure-report-metric-label">已記錄還款</span>
          <strong>${model.recordedSettlementCount} 筆</strong>
          <small>NT$${model.recordedSettlementTotal.toLocaleString()}</small>
        </div>
        <div class="trip-closure-report-metric">
          <span class="trip-closure-report-metric-label">剩餘轉帳</span>
          <strong>${model.remainingSettlementCount} 筆</strong>
          <small>NT$${model.remainingSettlementTotal.toLocaleString()}</small>
        </div>
      </div>
      ${model.hasGambling ? `<div class="trip-closure-report-note">含賭博時，「實際分攤」會用未含賭博應付扣掉賭博淨額。</div>` : ''}
    </div>

    <div class="trip-closure-report-section">
      <div class="trip-closure-report-section-head">
        <h5>成員總覽</h5>
        <span>誰總共付了多少、實際分攤多少、目前待收／待付</span>
      </div>
      <div class="trip-closure-report-person-head">
        <span>成員</span>
        <span>總共付了</span>
        <span>實際分攤</span>
        <span>目前狀態</span>
      </div>
      <div class="trip-closure-report-person-list">${memberRowsHtml}</div>
    </div>

    <div class="trip-closure-report-section">
      <div class="trip-closure-report-section-head">
        <h5>最後誰該付誰</h5>
        <span>已扣除目前已記錄的出遊還款</span>
      </div>
      <div class="trip-closure-report-transfer-list">${transferRowsHtml}</div>
    </div>

    <div class="trip-closure-report-grid">
      <div class="trip-closure-report-section trip-closure-report-section--mini">
        <div class="trip-closure-report-section-head">
          <h5>依日小計</h5>
          <span>${model.daySubtotals.length} 天</span>
        </div>
        <div class="trip-closure-report-mini-list">${dayRowsHtml}</div>
      </div>
      <div class="trip-closure-report-section trip-closure-report-section--mini">
        <div class="trip-closure-report-section-head">
          <h5>已記錄還款</h5>
          <span>${model.recordedSettlementCount} 筆</span>
        </div>
        <div class="trip-closure-report-mini-list">${recordedRowsHtml}</div>
      </div>
    </div>
  </div>`;
}

export function buildTripSettlementSummaryText(trip, expenses) {
  const model = buildTripClosureReportModel(trip, expenses, appState.allRows);

  let t = `【${trip.name}】出遊結案報告\n`;
  t += `成員：${model.members.join('、')}\n`;
  if (model.dateRangeLabel) t += `日期：${model.dateRangeLabel}\n`;
  t += `有效消費：${model.activeCount} 筆，總計 NT$${model.total.toLocaleString()}`;
  if (model.voidCount > 0) t += `（另 ${model.voidCount} 筆已撤回不計）`;
  if (model.hasGambling) t += `\n※「實際分攤」已扣除賭博淨額。`;
  t += `\n\n── 依日小計 ──\n`;
  if (model.daySubtotals.length === 0) t += '（無）\n';
  else model.daySubtotals.forEach(row => {
    t += `${row.date}  NT$${row.amount.toLocaleString()}\n`;
  });

  t += `\n── 成員總覽 ──\n`;
  model.memberRows.forEach(row => {
    t += `${row.name}  總共付了 NT$${row.paid.toLocaleString()} ／ 實際分攤 NT$${row.share.toLocaleString()} ／ ${row.outstandingLabel}\n`;
  });

  t += `\n── 已記錄還款 ──\n`;
  if (model.recordedSettlements.length === 0) t += '尚未記錄還款。\n';
  else model.recordedSettlements.forEach(row => {
    t += `${row.from} → ${row.to}  NT$${row.amount.toLocaleString()}\n`;
  });

  t += `\n── 最後誰該付誰 ──\n`;
  if (model.remainingSettlements.length === 0) t += '帳已平衡，不需轉帳。\n';
  else model.remainingSettlements.forEach(row => {
    t += `${row.from} → ${row.to}  NT$${row.amount.toLocaleString()}\n`;
  });
  t += `\n（由記帳本自動產生）`;
  return t;
}
