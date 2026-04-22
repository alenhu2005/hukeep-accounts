import { tripDetailState } from '../state-accessors.js';
import { getTripSettlementAdjustmentsFromRows } from '../data.js';
import { computeSettlements, tripExpenseBillNtd } from '../finance.js';
import { esc, jqAttr, prefersReducedMotion } from '../utils.js';
import { memberAvatarPill } from './records.js';

let tripSettleAnimGen = 0;

/** 離開行程明細時中止結算條／金額動畫 */
export function cancelTripSettlementAnim() {
  tripSettleAnimGen++;
}

function playTripSettlementAnimations() {
  const body = document.getElementById('settlement-body');
  if (!body) return;
  tripSettleAnimGen++;
  const gen = tripSettleAnimGen;
  const rows = body.querySelectorAll('.settlement-row--visual');
  if (rows.length === 0) return;

  const applyFinal = () => {
    rows.forEach(row => {
      const t = parseInt(row.getAttribute('data-amt') || '0', 10);
      const amtEl = row.querySelector('[data-settle-amt]');
      const cover = row.querySelector('.settlement-compare-cover');
      const pct = parseInt(row.getAttribute('data-bar-pct') || '0', 10);
      if (amtEl) amtEl.textContent = 'NT$' + t.toLocaleString();
      if (cover) cover.style.width = `${100 - pct}%`;
    });
  };

  if (prefersReducedMotion()) {
    applyFinal();
    return;
  }

  rows.forEach(row => {
    const amtEl = row.querySelector('[data-settle-amt]');
    const cover = row.querySelector('.settlement-compare-cover');
    if (amtEl) amtEl.textContent = 'NT$0';
    if (cover) cover.style.width = '100%';
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (gen !== tripSettleAnimGen) return;
      rows.forEach((row, idx) => {
        window.setTimeout(() => {
          if (gen !== tripSettleAnimGen) return;
          const cover = row.querySelector('.settlement-compare-cover');
          const pct = parseInt(row.getAttribute('data-bar-pct') || '0', 10);
          if (cover) cover.style.width = `${100 - pct}%`;
        }, 45 + idx * 85);
      });
      rows.forEach((row, idx) => {
        const target = parseInt(row.getAttribute('data-amt') || '0', 10);
        const amtEl = row.querySelector('[data-settle-amt]');
        if (!amtEl || target <= 0) return;
        const delay = 55 + idx * 85;
        const duration = 700;
        window.setTimeout(() => {
          if (gen !== tripSettleAnimGen) return;
          const start = performance.now();
          function frame(now) {
            if (gen !== tripSettleAnimGen) return;
            const u = Math.min(1, (now - start) / duration);
            const eased = 1 - (1 - u) ** 3;
            const v = Math.round(target * eased);
            amtEl.textContent = 'NT$' + v.toLocaleString();
            if (u < 1) requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        }, delay);
      });
    });
  });
}

export function buildSettlementViewModel(members, expenses, trip, allRows) {
  const active = expenses.filter(e => !e._voided);
  const voidCount = expenses.length - active.length;
  const adjustments = trip ? getTripSettlementAdjustmentsFromRows(trip.id, allRows) : [];
  const settlements = computeSettlements(members, active, adjustments);
  const dueSettlements = settlements.filter(s => Math.round(parseFloat(s.amount) || 0) > 0);
  const total = active.reduce((s, e) => s + tripExpenseBillNtd(e), 0);
  return { active, voidCount, adjustments, dueSettlements, total };
}

export function renderSettlement(members, expenses, trip, allRows = tripDetailState().allRows) {
  const bar = document.getElementById('settlement-bar');
  const body = document.getElementById('settlement-body');
  const { active, voidCount, dueSettlements, total } = buildSettlementViewModel(members, expenses, trip, allRows);

  if (expenses.length === 0) {
    bar.className = 'balance-bar';
    bar.style.background = '';
    body.innerHTML = `<div class="balance-content">
      <div class="balance-icon" style="background:#eff6ff">
        <svg viewBox="0 0 24 24" style="fill:#3b82f6"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
      </div>
      <div>
        <div class="balance-label">目前結算</div>
        <div style="font-size:20px;font-weight:700">尚未記帳</div>
        <div class="balance-sub">新增消費後即可計算分攤</div>
      </div>
    </div>`;
    return;
  }

  if (active.length === 0) {
    bar.className = 'balance-bar';
    bar.style.background = '';
    body.innerHTML = `<div class="balance-content">
      <div class="balance-icon" style="background:#eff6ff">
        <svg viewBox="0 0 24 24" style="fill:#3b82f6"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
      </div>
      <div>
        <div class="balance-label">目前結算</div>
        <div style="font-size:20px;font-weight:700">無有效消費</div>
        <div class="balance-sub">共 ${voidCount} 筆已撤回</div>
      </div>
    </div>`;
    return;
  }

  if (dueSettlements.length === 0) {
    bar.className = 'balance-bar';
    bar.style.background = '';
    body.innerHTML = `<div class="balance-content">
      <div class="balance-icon" style="background:#eff6ff">
        <svg viewBox="0 0 24 24" style="fill:#3b82f6"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
      </div>
      <div>
        <div class="balance-label">目前結算</div>
        <div style="font-size:22px;font-weight:700">未有積欠金額</div>
        <div class="balance-sub">有效 ${active.length} 筆 · NT$${Math.round(total)}</div>
      </div>
    </div>`;
    return;
  }

  bar.className = 'balance-bar';
  bar.style.background = '#f59e0b';
  const maxPay = Math.max(...dueSettlements.map(s => s.amount), 1);
  const canSettle = trip && !trip._closed;
  const rowsHtml = dueSettlements
    .map(s => {
      const amt = Math.round(s.amount);
      const barPct = Math.round((s.amount / maxPay) * 100);
      const coverW = prefersReducedMotion() ? 100 - barPct : 100;
      const repayBtn = canSettle
        ? `<button type="button" class="settle-btn settle-btn--inline" data-from="${esc(s.from)}" data-to="${esc(s.to)}" onclick="recordTripSettlementOneAction(this)">還款</button>`
        : '';
      return `<div class="settlement-row settlement-row--visual" data-amt="${amt}" data-bar-pct="${barPct}">
      <div class="settlement-flow">
        ${memberAvatarPill(s.from, 'settlement-pill settlement-pill--payer')}
        <span class="settlement-names">${esc(s.from)}</span>
        <span class="settlement-arrow" aria-hidden="true">→</span>
        ${memberAvatarPill(s.to, 'settlement-pill settlement-pill--payee')}
        <span class="settlement-names">${esc(s.to)}</span>
        <div class="settlement-flow-tail">
        <span class="settlement-amount" data-settle-amt>NT$${prefersReducedMotion() ? amt.toLocaleString() : '0'}</span>
        ${repayBtn}
        </div>
      </div>
      <div class="settlement-compare-track settlement-compare-track--sharedgrad" aria-hidden="true">
        <div class="settlement-compare-grad"></div>
        <div class="settlement-compare-cover" style="width:${coverW}%"></div>
      </div>
    </div>`;
    })
    .join('');
  body.innerHTML = `<div class="settlement-collapse">
    <button type="button" class="settlement-collapse-trigger" onclick="toggleCollapsible('settlement-flows-panel','settlement-flows-icon')" aria-expanded="true">
      <div class="settlement-collapse-trigger__main">
        <span class="settlement-collapse-title">誰要付給誰</span>
        <span class="settlement-header-meta">有效 ${active.length} 筆 · NT$${Math.round(total)}</span>
      </div>
      <span class="settlement-collapse-chevron" aria-hidden="true">
        <svg id="settlement-flows-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>
      </span>
    </button>
    <div id="settlement-flows-panel" class="collapsible-panel is-open">
      <div class="collapsible-panel__inner settlement-collapse-panel-inner">
        <div class="settlement-list settlement-list--visual">${rowsHtml}</div>
      </div>
    </div>
  </div>`;
  playTripSettlementAnimations();
}
