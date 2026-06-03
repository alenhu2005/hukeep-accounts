import {
  getDailyRecordsFromRows,
  getTripsFromRows,
  getTripExpensesFromRows,
  getTripSettlementAdjustmentsFromRows,
} from './data.js';
import { computeBalance, computeSettlements, tripExpenseBillNtd } from './finance.js';
import { appState } from './state.js';
import { esc, toast } from './utils.js';

const TZ = 'Asia/Taipei';

function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  return `NT$${v.toLocaleString('zh-TW')}`;
}

function nowTaipei() {
  return new Date().toLocaleString('zh-TW', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function rowKey(row) {
  const type = String(row?.type || '').trim();
  const id = String(row?.id || '').trim();
  return type && id ? `${type}:${id}` : '';
}

function pushIssue(issues, level, title, detail, meta = {}) {
  issues.push({ level, title, detail, ...meta });
}

function duplicateAddIssues(rows) {
  const seen = new Map();
  const duplicates = [];
  for (const row of rows) {
    if (!row || row.action !== 'add') continue;
    const key = rowKey(row);
    if (!key) continue;
    if (seen.has(key)) {
      duplicates.push({ key, firstIndex: seen.get(key), duplicateIndex: rows.indexOf(row) });
    } else {
      seen.set(key, rows.indexOf(row));
    }
  }
  return duplicates;
}

function pendingRows(rows) {
  return rows.filter(row => row && (row._pendingSync || row._optimistic || row._localOnly));
}

export function runLedgerHealthCheck(rows = appState.allRows) {
  const allRows = Array.isArray(rows) ? rows : [];
  const issues = [];
  const dailyRecords = getDailyRecordsFromRows(allRows);
  const dailyBalance = computeBalance(dailyRecords);
  const trips = getTripsFromRows(allRows);
  const tripIds = new Set(trips.map(t => String(t.id || '')));
  const tripExpenses = allRows.filter(r => r && r.type === 'tripExpense' && r.action === 'add');
  const tripSettlements = allRows.filter(r => r && r.type === 'tripSettlement' && r.action === 'add');

  const duplicates = duplicateAddIssues(allRows);
  if (duplicates.length > 0) {
    pushIssue(
      issues,
      'error',
      '發現重複主鍵',
      `有 ${duplicates.length} 筆 add 紀錄使用相同 type/id，可能造成顯示或結算被覆蓋。`,
      { count: duplicates.length },
    );
  }

  const orphanExpenses = tripExpenses.filter(r => !tripIds.has(String(r.tripId || '')));
  if (orphanExpenses.length > 0) {
    pushIssue(
      issues,
      'warning',
      '有出遊消費找不到行程',
      `${orphanExpenses.length} 筆出遊消費的 tripId 不在目前行程列表。`,
      { count: orphanExpenses.length },
    );
  }

  const orphanSettlements = tripSettlements.filter(r => !tripIds.has(String(r.tripId || '')));
  if (orphanSettlements.length > 0) {
    pushIssue(
      issues,
      'warning',
      '有出遊還款找不到行程',
      `${orphanSettlements.length} 筆出遊還款的 tripId 不在目前行程列表。`,
      { count: orphanSettlements.length },
    );
  }

  const pending = pendingRows(allRows);
  if (pending.length > 0) {
    pushIssue(
      issues,
      'info',
      '還有未同步資料',
      `${pending.length} 筆資料仍標記為本機待同步，恢復連線後會繼續送出。`,
      { count: pending.length },
    );
  }

  const tripChecks = trips.map(trip => {
    const expenses = getTripExpensesFromRows(trip.id, allRows);
    const activeExpenses = expenses.filter(expense => !expense._voided);
    const adjustments = getTripSettlementAdjustmentsFromRows(trip.id, allRows);
    const remaining = computeSettlements(trip.members || [], activeExpenses, adjustments);
    const remainingTotal = remaining.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const expenseTotal = activeExpenses.reduce((sum, item) => sum + tripExpenseBillNtd(item), 0);
    return {
      id: trip.id,
      name: trip.name || '（未命名行程）',
      closed: !!trip._closed,
      memberCount: Array.isArray(trip.members) ? trip.members.length : 0,
      activeExpenseCount: activeExpenses.length,
      settlementCount: adjustments.length,
      remainingCount: remaining.length,
      remainingTotal,
      expenseTotal,
    };
  });

  for (const trip of tripChecks) {
    if (trip.memberCount < 2) {
      pushIssue(
        issues,
        'warning',
        '行程成員少於 2 人',
        `「${trip.name}」目前只有 ${trip.memberCount} 位成員，分帳可能沒有意義。`,
        { tripId: trip.id },
      );
    }
    if (trip.closed && trip.remainingTotal >= 1) {
      pushIssue(
        issues,
        'warning',
        '已結束行程仍有未結清金額',
        `「${trip.name}」還有約 ${fmtMoney(trip.remainingTotal)} 需要結算。`,
        { tripId: trip.id, amount: trip.remainingTotal },
      );
    }
  }

  const status = issues.some(issue => issue.level === 'error')
    ? 'error'
    : issues.some(issue => issue.level === 'warning')
      ? 'warning'
      : 'ok';

  return {
    checkedAt: nowTaipei(),
    status,
    issues,
    metrics: {
      totalRows: allRows.length,
      dailyRecordCount: dailyRecords.length,
      dailyBalance,
      tripCount: trips.length,
      tripExpenseCount: tripExpenses.length,
      tripSettlementCount: tripSettlements.length,
      pendingCount: pending.length,
      closedTripOutstandingCount: tripChecks.filter(t => t.closed && t.remainingTotal >= 1).length,
    },
    tripChecks,
  };
}

export function formatLedgerHealthReportText(result = runLedgerHealthCheck()) {
  const statusLabel = result.status === 'ok' ? '正常' : result.status === 'warning' ? '需注意' : '需處理';
  const lines = [
    `資料健康檢查：${statusLabel}`,
    `檢查時間：${result.checkedAt}`,
    `資料列：${result.metrics.totalRows} · 日常：${result.metrics.dailyRecordCount} · 行程：${result.metrics.tripCount}`,
    `日常結算：${fmtMoney(result.metrics.dailyBalance)}`,
    '',
    '問題摘要',
  ];
  if (result.issues.length === 0) {
    lines.push('無明顯資料問題。');
  } else {
    for (const issue of result.issues) {
      lines.push(`- [${issue.level}] ${issue.title}：${issue.detail}`);
    }
  }
  lines.push('', '行程結算狀態');
  for (const trip of result.tripChecks) {
    const status = trip.remainingTotal >= 1 ? `未結清 ${fmtMoney(trip.remainingTotal)}` : '已結清';
    lines.push(`- ${trip.name}：${status} · 有效 ${trip.activeExpenseCount} 筆`);
  }
  return lines.join('\n');
}

function issueClass(level) {
  if (level === 'error') return 'backup-health-issue--error';
  if (level === 'warning') return 'backup-health-issue--warning';
  return 'backup-health-issue--info';
}

export function renderLedgerHealthPanel(result = runLedgerHealthCheck()) {
  const el = document.getElementById('backup-health-panel');
  if (!el) return result;
  const statusText = result.status === 'ok' ? '資料看起來正常' : result.status === 'warning' ? '有項目需要確認' : '有資料風險';
  const topTrips = result.tripChecks.slice(0, 4);
  el.innerHTML = `
    <div class="backup-panel-head">
      <div>
        <div class="backup-panel-kicker">資料健康檢查</div>
        <div class="backup-panel-title">${esc(statusText)}</div>
      </div>
      <span class="backup-health-badge backup-health-badge--${esc(result.status)}">${esc(result.status === 'ok' ? '正常' : result.status === 'warning' ? '注意' : '風險')}</span>
    </div>
    <div class="backup-metric-row" aria-label="資料摘要">
      <span>${result.metrics.totalRows} 列</span>
      <span>${result.metrics.tripCount} 行程</span>
      <span>${result.metrics.pendingCount} 待同步</span>
    </div>
    ${
      result.issues.length
        ? `<div class="backup-health-issues">${result.issues
            .slice(0, 3)
            .map(
              issue => `
                <div class="backup-health-issue ${issueClass(issue.level)}">
                  <strong>${esc(issue.title)}</strong>
                  <span>${esc(issue.detail)}</span>
                </div>
              `,
            )
            .join('')}</div>`
        : '<div class="backup-health-empty">沒有發現明顯問題，可以安心匯出。</div>'
    }
    ${
      topTrips.length
        ? `<div class="backup-trip-health-list">${topTrips
            .map(trip => {
              const settled = trip.remainingTotal < 1;
              return `
                <div class="backup-trip-health-row">
                  <span>${esc(trip.name)}</span>
                  <strong class="${settled ? 'is-ok' : 'is-warn'}">${settled ? '已結清' : fmtMoney(trip.remainingTotal)}</strong>
                </div>
              `;
            })
            .join('')}</div>`
        : ''
    }
  `;
  return result;
}

export async function copyLedgerHealthReport() {
  try {
    await navigator.clipboard.writeText(formatLedgerHealthReportText(runLedgerHealthCheck()));
    toast('已複製資料健康報告');
  } catch {
    toast('無法複製健康報告');
  }
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function downloadLedgerHealthCard() {
  const result = runLedgerHealthCheck();
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, '#eef6ff');
  gradient.addColorStop(0.55, '#f8fbff');
  gradient.addColorStop(1, '#dbeafe');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, 90, 100, 900, 1150, 56);
  ctx.fill();

  ctx.fillStyle = result.status === 'ok' ? '#10b981' : result.status === 'warning' ? '#f59e0b' : '#ef4444';
  roundedRect(ctx, 90, 100, 900, 18, 9);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 64px "Noto Sans TC", sans-serif';
  ctx.fillText('資料健康檢查', 150, 220);
  ctx.font = '500 34px "Noto Sans TC", sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(result.checkedAt, 150, 275);

  const statusText = result.status === 'ok' ? '資料看起來正常' : result.status === 'warning' ? '有項目需要確認' : '有資料風險';
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 72px "Noto Sans TC", sans-serif';
  ctx.fillText(statusText, 150, 390);

  const metricY = 500;
  const metrics = [
    ['資料列', String(result.metrics.totalRows)],
    ['行程', String(result.metrics.tripCount)],
    ['待同步', String(result.metrics.pendingCount)],
  ];
  metrics.forEach(([label, value], index) => {
    const x = 150 + index * 280;
    ctx.fillStyle = '#eff6ff';
    roundedRect(ctx, x, metricY, 220, 160, 30);
    ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.font = '500 28px "Noto Sans TC", sans-serif';
    ctx.fillText(label, x + 28, metricY + 52);
    ctx.fillStyle = '#1d4ed8';
    ctx.font = '800 54px "Noto Sans TC", sans-serif';
    ctx.fillText(value, x + 28, metricY + 120);
  });

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 40px "Noto Sans TC", sans-serif';
  ctx.fillText('問題摘要', 150, 770);
  ctx.font = '500 30px "Noto Sans TC", sans-serif';
  ctx.fillStyle = '#475569';
  const issueLines = result.issues.length
    ? result.issues.slice(0, 5).map(issue => `${issue.title}：${issue.detail}`)
    : ['沒有發現明顯資料問題。'];
  issueLines.forEach((line, index) => {
    const text = line.length > 28 ? `${line.slice(0, 28)}…` : line;
    ctx.fillText(text, 150, 830 + index * 52);
  });

  ctx.fillStyle = '#64748b';
  ctx.font = '500 26px "Noto Sans TC", sans-serif';
  ctx.fillText('Hukeep Accounts · 本機檢查卡片', 150, 1180);

  const link = document.createElement('a');
  const date = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  link.download = `資料健康卡片_${date}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  toast('已下載資料健康卡片');
}
