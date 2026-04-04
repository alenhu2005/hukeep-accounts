import {
  computeMemberShareTotals,
  computePayerTotals,
  computeSettlements,
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

  const totalSpend = active.reduce((s, e) => s + e.amount, 0);
  const generalSpend = generalOnly.reduce((s, e) => s + e.amount, 0);
  const gambleSpendSum = Math.round(
    active.filter(e => e.category === GAMBLING_CATEGORY).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
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
    const a = parseFloat(e.amount) || 0;
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
          <div class="analysis-legend-amt">NT$${Math.round(s.amount).toLocaleString()}</div>
        </div>`);
  }

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

  const tripPieBlock =
    pieGrandTotal > 0
      ? `
    <div class="trip-stats-section trip-stats-pie-section" style="--stat-i:${statI++}">
      ${tripGamblePlHTML}
      <div class="trip-pie-toolbar">
        <span class="trip-stats-label trip-stats-label--pie-toolbar">分類支出</span>
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
          <div class="analysis-legend-amt analysis-legend-amt--total">NT$${nonGamR.toLocaleString()}</div>
        </div>
      </div>
    </div>`
      : '';

  const prepaidTitle = hasGambling ? '先付排行（未含賭博，佔合計比例）' : '先付排行（佔先付合計比例）';
  const prepaidFoot = hasGambling
    ? `先付加總 NT$${Math.round(prepaidSumAll).toLocaleString()}（未含賭博） · 一般支出 NT$${Math.round(generalSpend).toLocaleString()} · 賭博 NT$${gambleSpendSum.toLocaleString()} · 有效消費合計 NT$${Math.round(totalSpend).toLocaleString()}`
    : `先付加總 NT$${Math.round(prepaidSumAll).toLocaleString()} · 有效消費 NT$${Math.round(totalSpend).toLocaleString()}${Math.abs(prepaidSumAll - totalSpend) < 0.5 ? ' ✓' : ''}`;

  const prepaidBlock = `<div class="trip-stats-section" style="--stat-i:${statI++}">
      <div class="trip-stats-label">${esc(prepaidTitle)}</div>
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
  const shareBlock = `<div class="trip-stats-section" style="--stat-i:${statI++}">
      <div class="trip-stats-label">${esc(shareTitle)}</div>
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

  const netLabel = '淨額（先付 − 應付；正為多墊、負為少付）';
  const netHead = `<div class="trip-stats-net-row trip-stats-net-row--head">
      <span class="trip-stats-net-cell trip-stats-net-cell--name"></span>
      <span class="trip-stats-net-cell trip-stats-net-cell--num">未含賭博</span>
      <span class="trip-stats-net-cell trip-stats-net-cell--num">含賭博</span>
    </div>`;
  const netBlock = hasGambling
    ? `<div class="trip-stats-section" style="--stat-i:${statI++}">
      <div class="trip-stats-label">${esc(netLabel)}</div>
      <div class="trip-stats-net-grid" role="table" aria-label="淨額">
      ${netHead}
      ${netRows
        .map(name => {
          const ve = netExcl[name];
          const vi = netIncl[name];
          const clse = ve > 0 ? 'net-pos' : ve < 0 ? 'net-neg' : '';
          const clsi = vi > 0 ? 'net-pos' : vi < 0 ? 'net-neg' : '';
          return `<div class="trip-stats-net-row">
            <span class="trip-stats-net-cell trip-stats-net-cell--name">${esc(name)}</span>
            <span class="trip-stats-net-cell trip-stats-net-cell--num ${clse}">${formatNetSigned(ve)}</span>
            <span class="trip-stats-net-cell trip-stats-net-cell--num ${clsi}">${formatNetSigned(vi)}</span>
          </div>`;
        })
        .join('')}
      </div>
    </div>`
    : `<div class="trip-stats-section" style="--stat-i:${statI++}">
      <div class="trip-stats-label">${esc(netLabel)}</div>
      <div class="payer-stats-list">
        ${netRows
          .map(name => {
            const v = netExcl[name];
            const cls = v > 0 ? 'net-pos' : v < 0 ? 'net-neg' : '';
            return `<div class="payer-stats-row payer-stats-row-plain" style="--row-i:${rowI++}">
            <span class="payer-stats-name">${esc(name)}</span>
            <span class="payer-stats-amt ${cls}">${formatNetSigned(v)}</span>
          </div>`;
          })
          .join('')}
      </div>
    </div>`;

  const walletOutByMember = members
    .slice()
    .sort(
      (a, b) => walletEffectiveBurden(b, share, tripGamblePl) - walletEffectiveBurden(a, share, tripGamblePl),
    );
  const walletOutTripSection = `<div class="trip-stats-section trip-stats-wallet-out" style="--stat-i:${statI++}">
      <div class="trip-stats-label">實際負擔（未含賭博應付−賭博淨）</div>
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
      <div class="trip-stats-wallet-out-total">合計 NT$${Math.round(generalSpend).toLocaleString()}</div>
    </div>`;

  return `<div class="card-body trip-stats-body">${tripPieBlock}${prepaidBlock}${shareBlock}${netBlock}${walletOutTripSection}</div>`;
}

export function buildTripSettlementSummaryText(trip, expenses) {
  const voidCount = expenses.filter(e => e._voided).length;
  const { active: nonVoid, generalOnly, hasGambling } = tripStatsExpenseSplit(expenses);
  const total = nonVoid.reduce((s, e) => s + e.amount, 0);
  const generalTotal = generalOnly.reduce((s, e) => s + e.amount, 0);

  const payers = computePayerTotals(generalOnly);
  const share = computeMemberShareTotals(trip.members, generalOnly);
  const payersAll = hasGambling ? computePayerTotals(nonVoid) : payers;
  const shareAll = hasGambling ? computeMemberShareTotals(trip.members, nonVoid) : share;

  const payerLines = trip.members.slice().sort((a, b) => (payers[b] || 0) - (payers[a] || 0));
  const prepaidSum = Object.values(payers).reduce((s, v) => s + v, 0);
  const shareLineMembers = trip.members.slice().sort((a, b) => (share[b] || 0) - (share[a] || 0));
  const settlements = computeSettlements(
    trip.members,
    nonVoid,
    getTripSettlementAdjustmentsFromRows(trip.id, appState.allRows),
  );
  const dayMap = computeTripDaySubtotals(expenses);
  const dayKeys = Object.keys(dayMap).sort().reverse();

  let t = `【${trip.name}】出遊結算懶人包\n`;
  t += `成員：${trip.members.join('、')}\n`;
  t += `有效消費：${nonVoid.length} 筆，總計 NT$${Math.round(total)}`;
  if (voidCount > 0) t += `（另 ${voidCount} 筆已撤回不計）`;
  if (hasGambling) t += `\n※ 先付／應付為未含賭博；淨額右欄（含賭博）與建議轉帳一致。`;
  t += `\n\n── 依日小計 ──\n`;
  if (dayKeys.length === 0) t += '（無）\n';
  else dayKeys.forEach(d => { t += `${d}  NT$${Math.round(dayMap[d])}\n`; });

  t += `\n── 先付排行${hasGambling ? '（未含賭博）' : ''} ──\n`;
  payerLines.forEach((name, i) => {
    const ex = payers[name] || 0;
    const pc = prepaidSum > 0.01 ? Math.round((ex / prepaidSum) * 100) : 0;
    t += `${i + 1}. ${name}  NT$${Math.round(ex)}（${pc}%）\n`;
  });
  if (hasGambling) {
    t += `先付加總 NT$${Math.round(prepaidSum)}（未含賭博）\n`;
    t += `一般支出 NT$${Math.round(generalTotal)} · 賭博支出 NT$${Math.round(total - generalTotal)}\n`;
  } else {
    t += `先付加總 NT$${Math.round(prepaidSum)}\n`;
  }

  t += `\n── 每人應付（分攤）${hasGambling ? '（未含賭博）' : ''} ──\n`;
  shareLineMembers.forEach(name => {
    t += `${name}  NT$${Math.round(share[name] || 0)}\n`;
  });

  t += `\n── 淨額（先付−應付）──\n`;
  if (hasGambling) {
    t += '每人：未含賭博 ／ 含賭博\n';
    trip.members.forEach(name => {
      const ve = Math.round((payers[name] || 0) - (share[name] || 0));
      const vi = Math.round((payersAll[name] || 0) - (shareAll[name] || 0));
      t += `${name}  ${ve > 0 ? '+' : ''}${ve} ／ ${vi > 0 ? '+' : ''}${vi}\n`;
    });
  } else {
    trip.members.forEach(name => {
      const v = Math.round((payers[name] || 0) - (share[name] || 0));
      t += `${name}  ${v > 0 ? '+' : ''}${v}\n`;
    });
  }

  t += `\n── 建議轉帳（最少次數，全部有效消費）──\n`;
  if (settlements.length === 0) t += '帳已平衡，不需轉帳。\n';
  else settlements.forEach(s => { t += `${s.from} → ${s.to}  NT$${Math.round(s.amount)}\n`; });
  t += `\n（由記帳本自動產生）`;
  return t;
}
