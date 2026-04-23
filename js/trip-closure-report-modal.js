import { appState } from './state.js';
import { getTripById, getTripExpenses } from './data.js';
import { bindScrollReveal, toast } from './utils.js';
import {
  buildTripClosureReportModel,
  buildTripSettlementSummaryText,
  renderTripClosureReportCard,
} from './trip-stats.js';

const TRIP_CLOSURE_REPORT_MODAL_CLOSE_MS = 380;
const IMAGE_FONT_STACK = '"SF Pro Text","PingFang TC","Noto Sans TC",system-ui,sans-serif';

function getTripForReport(tripId = appState.currentTripId) {
  const id = String(tripId || '').trim();
  if (!id) return null;
  const trip = getTripById(id);
  if (!trip) return null;
  const expenses = getTripExpenses(id);
  return { trip, expenses, model: buildTripClosureReportModel(trip, expenses, appState.allRows) };
}

function finishTripClosureReportModalClose(overlay, body) {
  if (overlay) {
    overlay.classList.remove('open');
    overlay.classList.remove('closing');
    delete overlay.dataset.tripId;
    if (overlay._closingT) {
      clearTimeout(overlay._closingT);
      overlay._closingT = null;
    }
  }
  if (body?._scrollRevealCleanup) body._scrollRevealCleanup();
  if (body) body.innerHTML = '';
}

export function openTripClosureReportModal(tripId = appState.currentTripId) {
  const report = getTripForReport(tripId);
  if (!report) return;
  const body = document.getElementById('trip-closure-report-modal-body');
  const overlay = document.getElementById('trip-closure-report-modal-overlay');
  if (!body || !overlay) return;
  if (overlay._closingT) {
    clearTimeout(overlay._closingT);
    overlay._closingT = null;
  }
  overlay.classList.remove('closing');
  overlay.dataset.tripId = report.trip.id;
  if (body._scrollRevealCleanup) body._scrollRevealCleanup();
  body.innerHTML = renderTripClosureReportCard(report.model);
  bindScrollReveal(
    body,
    '.trip-closure-report-section, .trip-closure-report-person-row, .trip-closure-report-transfer-row, .trip-closure-report-metric',
    { enabled: true },
  );
  overlay.classList.add('open');
}

export function closeTripClosureReportModal() {
  const overlay = document.getElementById('trip-closure-report-modal-overlay');
  const body = document.getElementById('trip-closure-report-modal-body');
  if (!overlay || !overlay.classList.contains('open') || overlay.classList.contains('closing')) return;
  if (overlay._closingT) clearTimeout(overlay._closingT);
  overlay.classList.add('closing');
  overlay._closingT = setTimeout(() => {
    finishTripClosureReportModalClose(overlay, body);
  }, TRIP_CLOSURE_REPORT_MODAL_CLOSE_MS);
}

export async function copyTripClosureReportText(tripId = appState.currentTripId) {
  const report = getTripForReport(tripId);
  if (!report) return;
  const text = buildTripSettlementSummaryText(report.trip, report.expenses);
  try {
    await navigator.clipboard.writeText(text);
    toast('結案報告文字已複製');
  } catch {
    toast('無法複製，請檢查瀏覽器權限');
  }
}

function drawRoundedRect(ctx, x, y, w, h, r, fillStyle, strokeStyle = '', lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  const src = String(text || '').trim();
  if (!src) return lines;
  let line = '';
  for (const char of src) {
    const next = line + char;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function canvasToBlob(canvas) {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/png');
  });
}

function buildTripClosureReportCanvas(model) {
  const width = 1200;
  const outerPadding = 48;
  const cardX = outerPadding;
  const cardY = outerPadding;
  const cardWidth = width - outerPadding * 2;
  const peopleRows = model.memberRows.length || 1;
  const transferRows = Math.max(1, model.remainingSettlements.length);
  const recordedRows = Math.max(1, model.recordedSettlements.length);
  const dayRows = Math.max(1, Math.min(6, model.daySubtotals.length));
  const heroHeight = 260 + (model.hasGambling ? 28 : 0);
  const peopleHeight = 92 + peopleRows * 62;
  const transferHeight = 92 + transferRows * 58;
  const miniHeight = 92 + Math.max(dayRows, recordedRows) * 44;
  const footerHeight = 54;
  const height = outerPadding * 2 + heroHeight + peopleHeight + transferHeight + miniHeight + footerHeight + 56;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unsupported');

  ctx.fillStyle = '#eef2f7';
  ctx.fillRect(0, 0, width, height);
  drawRoundedRect(ctx, cardX, cardY, cardWidth, height - outerPadding * 2, 36, '#ffffff', '#d8e0eb');

  const innerX = cardX + 56;
  let y = cardY + 64;
  ctx.fillStyle = '#6b7280';
  ctx.font = `700 24px ${IMAGE_FONT_STACK}`;
  ctx.fillText('Hukeep Accounts · 結案報告', innerX, y);
  y += 44;

  ctx.fillStyle = '#111827';
  ctx.font = `800 54px ${IMAGE_FONT_STACK}`;
  const titleLines = wrapCanvasText(ctx, model.tripName, cardWidth - 112);
  titleLines.slice(0, 2).forEach(line => {
    ctx.fillText(line, innerX, y);
    y += 62;
  });

  ctx.fillStyle = '#475569';
  ctx.font = `600 24px ${IMAGE_FONT_STACK}`;
  const metaText = `${model.dateRangeLabel || '未標記日期'}  ·  ${model.memberCount} 人  ·  ${model.activeCount} 筆有效消費`;
  ctx.fillText(metaText, innerX, y);
  y += 34;

  const metricGap = 16;
  const metricWidth = Math.floor((cardWidth - 112 - metricGap * 2) / 3);
  const metrics = [
    ['總支出', `NT$${model.total.toLocaleString()}`, model.voidCount > 0 ? `另有 ${model.voidCount} 筆撤回` : '全部有效消費'],
    ['已記錄還款', `${model.recordedSettlementCount} 筆`, `NT$${model.recordedSettlementTotal.toLocaleString()}`],
    ['剩餘轉帳', `${model.remainingSettlementCount} 筆`, `NT$${model.remainingSettlementTotal.toLocaleString()}`],
  ];
  metrics.forEach((metric, idx) => {
    const mx = innerX + idx * (metricWidth + metricGap);
    drawRoundedRect(ctx, mx, y, metricWidth, 108, 24, idx === 0 ? '#eaf4ff' : '#f8fafc', '#d8e0eb');
    ctx.fillStyle = '#64748b';
    ctx.font = `700 20px ${IMAGE_FONT_STACK}`;
    ctx.fillText(metric[0], mx + 24, y + 34);
    ctx.fillStyle = '#0f172a';
    ctx.font = `800 34px ${IMAGE_FONT_STACK}`;
    ctx.fillText(metric[1], mx + 24, y + 72);
    ctx.fillStyle = '#64748b';
    ctx.font = `600 18px ${IMAGE_FONT_STACK}`;
    ctx.fillText(metric[2], mx + 24, y + 96);
  });
  y += 140;

  const sectionWidth = cardWidth - 112;
  const peopleSectionHeight = 92 + peopleRows * 62;
  drawRoundedRect(ctx, innerX, y, sectionWidth, peopleSectionHeight, 24, '#f8fafc', '#d8e0eb');
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 30px ${IMAGE_FONT_STACK}`;
  ctx.fillText('成員總覽', innerX + 28, y + 42);
  ctx.fillStyle = '#64748b';
  ctx.font = `600 18px ${IMAGE_FONT_STACK}`;
  ctx.fillText('誰總共付了多少、實際分攤多少、目前待收／待付', innerX + 28, y + 70);

  const cols = [innerX + 28, innerX + 340, innerX + 565, innerX + 820];
  ctx.fillStyle = '#64748b';
  ctx.font = `700 18px ${IMAGE_FONT_STACK}`;
  ['成員', '總共付了', '實際分攤', '目前狀態'].forEach((label, idx) => {
    ctx.fillText(label, cols[idx], y + 112);
  });
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(innerX + 28, y + 126);
  ctx.lineTo(innerX + sectionWidth - 28, y + 126);
  ctx.stroke();

  let rowY = y + 165;
  model.memberRows.forEach((row, idx) => {
    if (idx > 0) {
      ctx.beginPath();
      ctx.moveTo(innerX + 28, rowY - 24);
      ctx.lineTo(innerX + sectionWidth - 28, rowY - 24);
      ctx.stroke();
    }
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 24px ${IMAGE_FONT_STACK}`;
    ctx.fillText(row.name, cols[0], rowY);
    ctx.font = `700 22px ${IMAGE_FONT_STACK}`;
    ctx.fillText(`NT$${row.paid.toLocaleString()}`, cols[1], rowY);
    ctx.fillText(`NT$${row.share.toLocaleString()}`, cols[2], rowY);
    ctx.fillStyle = row.outstanding > 0 ? '#065f46' : row.outstanding < 0 ? '#9a3412' : '#475569';
    ctx.fillText(row.outstandingLabel, cols[3], rowY);
    rowY += 62;
  });
  y += peopleSectionHeight + 24;

  const transferSectionHeight = 92 + transferRows * 58;
  drawRoundedRect(ctx, innerX, y, sectionWidth, transferSectionHeight, 24, '#fff7ed', '#f5d0a8');
  ctx.fillStyle = '#7c2d12';
  ctx.font = `800 30px ${IMAGE_FONT_STACK}`;
  ctx.fillText('最後誰該付誰', innerX + 28, y + 42);
  ctx.fillStyle = '#9a3412';
  ctx.font = `600 18px ${IMAGE_FONT_STACK}`;
  ctx.fillText('已扣除目前已記錄的出遊還款', innerX + 28, y + 70);
  rowY = y + 122;
  if (model.remainingSettlements.length === 0) {
    ctx.fillStyle = '#7c2d12';
    ctx.font = `700 24px ${IMAGE_FONT_STACK}`;
    ctx.fillText('目前已全部結清，不需再轉帳。', innerX + 28, rowY);
  } else {
    model.remainingSettlements.forEach((row, idx) => {
      if (idx > 0) {
        ctx.strokeStyle = '#f5d0a8';
        ctx.beginPath();
        ctx.moveTo(innerX + 28, rowY - 26);
        ctx.lineTo(innerX + sectionWidth - 28, rowY - 26);
        ctx.stroke();
      }
      ctx.fillStyle = '#7c2d12';
      ctx.font = `700 24px ${IMAGE_FONT_STACK}`;
      ctx.fillText(`${row.from} → ${row.to}`, innerX + 28, rowY);
      ctx.textAlign = 'right';
      ctx.fillText(`NT$${row.amount.toLocaleString()}`, innerX + sectionWidth - 28, rowY);
      ctx.textAlign = 'left';
      rowY += 58;
    });
  }
  y += transferSectionHeight + 24;

  const miniGap = 16;
  const miniWidth = (sectionWidth - miniGap) / 2;
  const miniSectionHeight = 92 + Math.max(dayRows, recordedRows) * 44;
  const drawMiniSection = (x, title, suffix, rows, emptyLabel) => {
    drawRoundedRect(ctx, x, y, miniWidth, miniSectionHeight, 24, '#f8fafc', '#d8e0eb');
    ctx.fillStyle = '#0f172a';
    ctx.font = `800 26px ${IMAGE_FONT_STACK}`;
    ctx.fillText(title, x + 24, y + 40);
    ctx.fillStyle = '#64748b';
    ctx.font = `600 18px ${IMAGE_FONT_STACK}`;
    ctx.fillText(suffix, x + 24, y + 66);
    let my = y + 112;
    if (!rows.length) {
      ctx.fillStyle = '#64748b';
      ctx.font = `700 20px ${IMAGE_FONT_STACK}`;
      ctx.fillText(emptyLabel, x + 24, my);
      return;
    }
    rows.slice(0, Math.max(dayRows, recordedRows)).forEach((row, idx) => {
      if (idx > 0) {
        ctx.strokeStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(x + 24, my - 20);
        ctx.lineTo(x + miniWidth - 24, my - 20);
        ctx.stroke();
      }
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 19px ${IMAGE_FONT_STACK}`;
      ctx.fillText(row[0], x + 24, my);
      ctx.textAlign = 'right';
      ctx.fillText(row[1], x + miniWidth - 24, my);
      ctx.textAlign = 'left';
      my += 44;
    });
  };
  drawMiniSection(
    innerX,
    '依日小計',
    `${model.daySubtotals.length} 天`,
    model.daySubtotals.map(row => [row.date, `NT$${row.amount.toLocaleString()}`]),
    '尚無日期資料',
  );
  drawMiniSection(
    innerX + miniWidth + miniGap,
    '已記錄還款',
    `${model.recordedSettlementCount} 筆`,
    model.recordedSettlements.map(row => [`${row.from} → ${row.to}`, `NT$${row.amount.toLocaleString()}`]),
    '尚未記錄還款',
  );
  y += miniSectionHeight + 34;

  ctx.fillStyle = '#64748b';
  ctx.font = `600 18px ${IMAGE_FONT_STACK}`;
  ctx.fillText('由 Hukeep Accounts 自動產生', innerX, y);

  return canvas;
}

export async function downloadTripClosureReportImage(tripId = appState.currentTripId) {
  const report = getTripForReport(tripId);
  if (!report) return;
  try {
    const canvas = buildTripClosureReportCanvas(report.model);
    const blob = await canvasToBlob(canvas);
    if (!blob) throw new Error('blob unavailable');
    const safeName = String(report.trip.name || '行程').replace(/[\\/:*?"<>|]/g, '_');
    downloadBlob(`${safeName}_結案報告.png`, blob);
    toast('結案報告圖片已下載');
  } catch {
    toast('無法輸出圖片，請稍後再試');
  }
}
