import { appState } from './state.js';
import { getDailyRecords } from './data.js';
import { getAnalysisRange } from './time.js';
import { esc } from './utils.js';

const CAT_PIE_COLORS = {
  餐飲: '#f59e0b',
  交通: '#3b82f6',
  購物: '#8b5cf6',
  娛樂: '#ec4899',
  生活: '#10b981',
  其他: '#9ca3af',
  未分類: '#cbd5e1',
};

function makePieChartSVG(slices, total) {
  const cx = 110;
  const cy = 110;
  const R = 90;
  const ri = 55;
  const isDark = document.documentElement.classList.contains('dark');
  const bgCard = isDark ? '#1e2025' : '#ffffff';
  const textColor = isDark ? '#e4e8f0' : '#1a1d23';
  const mutedColor = isDark ? '#7a8196' : '#9098af';
  if (slices.length === 1) {
    return `<svg width="220" height="220" viewBox="0 0 220 220">
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="${slices[0].color}"/>
      <circle cx="${cx}" cy="${cy}" r="${ri}" fill="${bgCard}"/>
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="${textColor}" font-size="16" font-weight="700">NT$${Math.round(total).toLocaleString()}</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="${mutedColor}" font-size="11">總支出</text>
    </svg>`;
  }
  const paths = [];
  let a = -Math.PI / 2;
  for (const s of slices) {
    const da = (s.amount / total) * 2 * Math.PI;
    if (da < 0.005) {
      a += da;
      continue;
    }
    const ea = a + da;
    const lg = da > Math.PI ? 1 : 0;
    const x1 = cx + R * Math.cos(a);
    const y1 = cy + R * Math.sin(a);
    const x2 = cx + R * Math.cos(ea);
    const y2 = cy + R * Math.sin(ea);
    const ix1 = cx + ri * Math.cos(ea);
    const iy1 = cy + ri * Math.sin(ea);
    const ix2 = cx + ri * Math.cos(a);
    const iy2 = cy + ri * Math.sin(a);
    paths.push(
      `<path d="M${x1},${y1} A${R},${R} 0 ${lg},1 ${x2},${y2} L${ix1},${iy1} A${ri},${ri} 0 ${lg},0 ${ix2},${iy2} Z" fill="${s.color}"/>`,
    );
    a = ea;
  }
  return `<svg width="220" height="220" viewBox="0 0 220 220" style="filter:drop-shadow(0 4px 12px rgba(0,0,0,.12))">
    ${paths.join('')}
    <circle cx="${cx}" cy="${cy}" r="${ri}" fill="${bgCard}"/>
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="${textColor}" font-size="16" font-weight="700">NT$${Math.round(total).toLocaleString()}</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="${mutedColor}" font-size="11">總支出</text>
  </svg>`;
}

export function setAnalysisPeriod(p) {
  appState.analysisPeriod = p;
  renderAnalysis();
}

export function renderAnalysis() {
  const el = document.getElementById('analysis-content');
  if (!el) return;

  const { fromStr, toStr, periodLabel } = getAnalysisRange(appState.analysisPeriod);

  const records = getDailyRecords().filter(
    r => !r._voided && r.type === 'daily' && r.date >= fromStr && r.date <= toStr,
  );

  let total = 0;
  let huTotal = 0;
  let zhanTotal = 0;
  const catTotals = {};
  for (const r of records) {
    const a = parseFloat(r.amount) || 0;
    if (r.splitMode === '兩人付') {
      const hu = parseFloat(r.paidHu) || 0;
      const zhan = parseFloat(r.paidZhan) || 0;
      huTotal += hu;
      zhanTotal += zhan;
      total += hu + zhan;
    } else {
      total += a;
      if (r.paidBy === '胡') huTotal += a;
      else if (r.paidBy === '詹') zhanTotal += a;
    }
    const cat = r.category || '未分類';
    catTotals[cat] = (catTotals[cat] || 0) + a;
  }

  const tabs = ['week', 'month', 'year']
    .map(
      p =>
        `<button onclick="setAnalysisPeriod('${p}')" style="flex:1;padding:9px;border-radius:10px;border:none;cursor:pointer;font-size:13px;font-weight:600;background:${appState.analysisPeriod === p ? 'var(--primary)' : 'var(--bg-secondary)'};color:${appState.analysisPeriod === p ? '#fff' : 'var(--text-muted)'};transition:.15s">
      ${{ week: '本週', month: '本月', year: '本年' }[p]}
    </button>`,
    )
    .join('');

  if (records.length === 0) {
    el.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:20px">${tabs}</div>
      <div style="text-align:center;padding:60px 0;color:var(--text-muted)">
        <div style="font-size:40px;margin-bottom:12px">📊</div>
        <div style="font-size:14px">${periodLabel} 尚無支出紀錄</div>
      </div>`;
    return;
  }

  const slices = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => ({ cat, amount: amt, color: CAT_PIE_COLORS[cat] || '#94a3b8' }));

  const legend = slices
    .map(s => {
      const pct = total > 0 ? Math.round((s.amount / total) * 100) : 0;
      return `<div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--border)">
      <div style="width:12px;height:12px;border-radius:3px;background:${s.color};flex-shrink:0"></div>
      <div style="flex:1;font-size:13px;font-weight:500;color:var(--text)">${esc(s.cat)}</div>
      <div style="font-size:12px;color:var(--text-muted);min-width:32px;text-align:right">${pct}%</div>
      <div style="font-size:14px;font-weight:600;color:var(--text);min-width:80px;text-align:right">NT$${Math.round(s.amount).toLocaleString()}</div>
    </div>`;
    })
    .join('');

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:20px">${tabs}</div>
    <div style="text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:18px">${periodLabel}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px">
      <div style="background:var(--bg-card);border-radius:14px;padding:14px;text-align:center;border:1px solid var(--border)">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">胡 付出</div>
        <div style="font-size:17px;font-weight:700;color:var(--primary)">NT$${Math.round(huTotal).toLocaleString()}</div>
      </div>
      <div style="background:var(--bg-card);border-radius:14px;padding:14px;text-align:center;border:1px solid var(--border)">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">詹 付出</div>
        <div style="font-size:17px;font-weight:700;color:#10b981">NT$${Math.round(zhanTotal).toLocaleString()}</div>
      </div>
    </div>
    <div style="display:flex;justify-content:center;margin-bottom:24px">
      ${makePieChartSVG(slices, total)}
    </div>
    <div style="background:var(--bg-card);border-radius:16px;padding:0 16px;border:1px solid var(--border)">
      ${legend}
      <div style="display:flex;align-items:center;gap:10px;padding:11px 0">
        <div style="width:12px;height:12px;flex-shrink:0"></div>
        <div style="flex:1;font-size:13px;font-weight:700;color:var(--text)">合計</div>
        <div style="font-size:12px;color:var(--text-muted);min-width:32px;text-align:right">100%</div>
        <div style="font-size:14px;font-weight:700;color:var(--text);min-width:80px;text-align:right">NT$${Math.round(total).toLocaleString()}</div>
      </div>
    </div>`;
}
