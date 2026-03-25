import { USER_A, USER_B } from './config.js';
import { appState } from './state.js';
import { getDailyRecords } from './data.js';
import { getAnalysisRange } from './time.js';
import { esc, prefersReducedMotion } from './utils.js';
import { makePieChartSVG, CAT_PIE_COLORS } from './pie-chart.js';

let analysisCountGen = 0;

/** 切換離開分析頁時呼叫，中止數字刷動避免佔用主執行緒、底欄需點兩次才切頁 */
export function cancelAnalysisCountAnim() {
  analysisCountGen++;
}

function persistPieLabelOpts() {
  try {
    localStorage.setItem(
      'ledger_pie_label_opts_v1',
      JSON.stringify({
        cat: appState.pieLabelShowCategory,
        pct: appState.pieLabelShowPct,
        amt: appState.pieLabelShowAmount,
      }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * @param {HTMLElement} el
 * @param {number} to
 * @param {'currency'|'pct'} mode
 * @param {number} gen
 * @param {number} delayMs
 * @param {number} durationMs
 */
function runCountUp(el, to, mode, gen, delayMs, durationMs) {
  const from = 0;
  const target = Math.round(to);
  const startAnim = () => {
    if (gen !== analysisCountGen) return;
    const start = performance.now();
    function frame(now) {
      if (gen !== analysisCountGen) return;
      const u = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - u) ** 3;
      const val = Math.round(from + (target - from) * eased);
      if (mode === 'pct') {
        el.textContent = `${val}%`;
      } else {
        el.textContent = `NT$${val.toLocaleString()}`;
      }
      if (u < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };
  if (delayMs > 0) window.setTimeout(startAnim, delayMs);
  else startAnim();
}

function playAnalysisCountUps(root) {
  analysisCountGen++;
  const gen = analysisCountGen;
  if (prefersReducedMotion()) return;

  const nodes = root.querySelectorAll('[data-analysis-count]');
  const baseDuration = 820;
  nodes.forEach((el, idx) => {
    const raw = el.getAttribute('data-analysis-count');
    const to = parseFloat(raw || '0') || 0;
    const mode = el.getAttribute('data-analysis-mode') === 'pct' ? 'pct' : 'currency';
    const delay = idx * 48;
    runCountUp(el, to, mode, gen, delay, baseDuration);
  });
}

/**
 * @param {'cat'|'pct'|'amt'} field
 * @param {boolean} checked
 */
export function setPieLabelOption(field, checked) {
  const v = !!checked;
  if (field === 'cat') appState.pieLabelShowCategory = v;
  else if (field === 'pct') appState.pieLabelShowPct = v;
  else if (field === 'amt') appState.pieLabelShowAmount = v;
  persistPieLabelOpts();
  renderAnalysis();
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
      if (r.paidBy === USER_A) huTotal += a;
      else if (r.paidBy === USER_B) zhanTotal += a;
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
      <div class="analysis-tabs">${tabs}</div>
      <div class="analysis-empty">
        <div class="analysis-empty-icon" aria-hidden="true">📊</div>
        <div class="analysis-empty-text">${periodLabel} 尚無支出紀錄</div>
      </div>`;
    return;
  }

  const huR = Math.round(huTotal);
  const zhanR = Math.round(zhanTotal);
  const totalR = Math.round(total);

  const slices = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => ({ cat, amount: amt, color: CAT_PIE_COLORS[cat] || '#94a3b8' }));

  const legend = slices
    .map((s, idx) => {
      const pct = total > 0 ? Math.round((s.amount / total) * 100) : 0;
      const amtR = Math.round(s.amount);
      return `<div class="analysis-legend-row" style="--legend-i:${idx}">
      <div class="analysis-legend-swatch" style="background:${s.color}"></div>
      <div class="analysis-legend-name">${esc(s.cat)}</div>
      <div class="analysis-legend-pct" data-analysis-count="${pct}" data-analysis-mode="pct">${prefersReducedMotion() ? `${pct}%` : '0%'}</div>
      <div class="analysis-legend-amt" data-analysis-count="${amtR}" data-analysis-mode="currency">${prefersReducedMotion() ? `NT$${amtR.toLocaleString()}` : 'NT$0'}</div>
    </div>`;
    })
    .join('');

  const pieToggles = `
    <div class="analysis-pie-label-toggles" role="group" aria-label="圓餅圖環上顯示">
      <label class="analysis-pie-label-chip">
        <input type="checkbox" ${appState.pieLabelShowCategory ? 'checked' : ''} onchange="setPieLabelOption('cat', this.checked)">
        <span>分類</span>
      </label>
      <label class="analysis-pie-label-chip">
        <input type="checkbox" ${appState.pieLabelShowPct ? 'checked' : ''} onchange="setPieLabelOption('pct', this.checked)">
        <span>比例</span>
      </label>
      <label class="analysis-pie-label-chip">
        <input type="checkbox" ${appState.pieLabelShowAmount ? 'checked' : ''} onchange="setPieLabelOption('amt', this.checked)">
        <span>金額</span>
      </label>
    </div>`;

  const labelOpts = {
    cat: appState.pieLabelShowCategory,
    pct: appState.pieLabelShowPct,
    amt: appState.pieLabelShowAmount,
  };

  const statHuStart = prefersReducedMotion() ? `NT$${huR.toLocaleString()}` : 'NT$0';
  const statZhanStart = prefersReducedMotion() ? `NT$${zhanR.toLocaleString()}` : 'NT$0';
  const totalPctStart = prefersReducedMotion() ? '100%' : '0%';
  const totalAmtStart = prefersReducedMotion() ? `NT$${totalR.toLocaleString()}` : 'NT$0';

  el.innerHTML = `
    <div class="analysis-tabs">${tabs}</div>
    <div class="analysis-period">${periodLabel}</div>
    <div class="analysis-stats-grid">
      <div class="analysis-stat-card">
        <div class="analysis-stat-label">${esc(USER_A)} 付出</div>
        <div class="analysis-stat-val analysis-stat-val--hu" data-analysis-count="${huR}" data-analysis-mode="currency">${statHuStart}</div>
      </div>
      <div class="analysis-stat-card">
        <div class="analysis-stat-label">${esc(USER_B)} 付出</div>
        <div class="analysis-stat-val analysis-stat-val--zhan" data-analysis-count="${zhanR}" data-analysis-mode="currency">${statZhanStart}</div>
      </div>
    </div>
    ${pieToggles}
    <div class="analysis-pie-wrap">
      ${makePieChartSVG(slices, total, labelOpts)}
    </div>
    <div class="analysis-legend-card">
      ${legend}
      <div class="analysis-legend-row analysis-legend-row--total" style="--legend-n:${slices.length}">
        <div class="analysis-legend-swatch analysis-legend-swatch--empty"></div>
        <div class="analysis-legend-name analysis-legend-name--total">合計</div>
        <div class="analysis-legend-pct" data-analysis-count="100" data-analysis-mode="pct">${totalPctStart}</div>
        <div class="analysis-legend-amt analysis-legend-amt--total" data-analysis-count="${totalR}" data-analysis-mode="currency">${totalAmtStart}</div>
      </div>
    </div>`;

  playAnalysisCountUps(el);
}
