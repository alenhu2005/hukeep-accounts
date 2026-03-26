import { appState } from './state.js';
import { getTripById, getTripExpenses, getTripSettlementAdjustmentsFromRows, getAvatarUrlByMemberName, getKnownMemberNames, getMemberColor } from './data.js';
import { computeSettlements } from './finance.js';
import { categoryBadgeHTML } from './category.js';
import { esc, jq, jqAttr } from './utils.js';
import { emptyHTML } from './views-shared.js';
import { navigate } from './navigation.js';
import { renderTripStatsCard } from './trip-stats.js';
import { renderTripLotteryCard } from './trip-lottery.js';

let tripSettleAnimGen = 0;

/** 離開行程明細時中止結算條／金額動畫 */
export function cancelTripSettlementAnim() {
  tripSettleAnimGen++;
}

function tripPrefersReducedMotion() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  if (tripPrefersReducedMotion()) {
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

function tripRecordAvatar(name, cssClass) {
  const url = getAvatarUrlByMemberName(name, 'trip');
  const color = getMemberColor(name);
  if (url) {
    return `<div class="record-avatar ${cssClass}"><img class="record-avatar-img" src="${url}" alt="${esc(name)}"></div>`;
  }
  if (cssClass === 'multi' || cssClass === 'split' || cssClass === 'settle') {
    return `<div class="record-avatar ${cssClass}">${esc(name)}</div>`;
  }
  return `<div class="record-avatar ${cssClass}" style="background:${color.bg};color:${color.fg}">${esc(name.charAt(0))}</div>`;
}

function memberAvatarPill(name, cssClass) {
  const url = getAvatarUrlByMemberName(name, 'trip');
  const color = getMemberColor(name);
  if (url) {
    return `<span class="${cssClass}" title="${esc(name)}"><img src="${url}" alt="${esc(name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block"></span>`;
  }
  return `<span class="${cssClass}" style="background:${color.bg};color:${color.fg};border-color:${color.fg}30" title="${esc(name)}">${esc(name.charAt(0))}</span>`;
}

function tripPhotoThumb(e) {
  if (!e.photoUrl) return '';
  return `<button type="button" class="record-photo-btn" onclick="event.stopPropagation();openPhotoLightbox('${e.photoUrl.replace(/'/g, "\\'")}')" title="查看照片" aria-label="查看照片">
    <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
  </button>`;
}

function tripExpenseHTML(e, totalMembers) {
  const label = e.splitAmong.length === totalMembers ? '均分' : e.splitAmong.join('、');
  const noteEl = e.note ? `<div class="record-note">${esc(e.note)}</div>` : '';
  const clickAttr = e._voided ? '' : `onclick='openEditRecordById(${jq(e.id)},true)' style="cursor:pointer" title="點擊編輯"`;
  const photoEl = tripPhotoThumb(e);

  if (e.payers && Array.isArray(e.payers)) {
    const payerStr = e.payers.map(p => `${esc(p.name)} NT$${Math.round(p.amount)}`).join(' ＋ ');
    const perPerson = Math.round(e.amount / (e.splitAmong.length || 1));
    return `<div class="record-item${e._voided ? ' is-voided' : ''}">
      ${tripRecordAvatar('多', 'multi')}
      <div class="record-info" ${clickAttr}>
        <div class="record-name">
          <span class="record-name-text">${esc(e.item)}</span>
          <span class="badge${e._voided ? ' badge-void' : ''}">${e._voided ? '已撤回' : '多人出款'}</span>
          ${categoryBadgeHTML(e.category)}
        </div>
        <div class="record-meta">${esc(e.date)} · ${payerStr} · 每人 NT$${perPerson}</div>
        ${noteEl}
      </div>
      ${photoEl}
      <div class="record-amount" style="${e._voided ? 'color:#9ca3af;text-decoration:line-through' : ''}">NT$${Math.round(e.amount)}</div>
    </div>`;
  }

  return `<div class="record-item${e._voided ? ' is-voided' : ''}">
    ${tripRecordAvatar(e.paidBy, 'me')}
    <div class="record-info" ${clickAttr}>
      <div class="record-name">
        <span class="record-name-text">${esc(e.item)}</span>
        <span class="badge${e._voided ? ' badge-void' : ''}">${e._voided ? '已撤回' : esc(label)}</span>
        ${categoryBadgeHTML(e.category)}
      </div>
      <div class="record-meta">${esc(e.date)} · ${esc(e.paidBy)}付 · 每人 NT$${Math.round(e.amount / (e.splitAmong.length || 1))}</div>
      ${noteEl}
    </div>
    ${photoEl}
    <div class="record-amount" style="${e._voided ? 'color:#9ca3af;text-decoration:line-through' : ''}">NT$${Math.round(e.amount)}</div>
  </div>`;
}

function buildTripExpensesByDayHTML(expenses, trip) {
  const byDay = {};
  for (const e of expenses) {
    const d = e.date || '（無日期）';
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(e);
  }
  const days = Object.keys(byDay).sort().reverse();
  return days
    .map(d => {
      const list = byDay[d];
      const sub = list.filter(e => !e._voided).reduce((s, e) => s + e.amount, 0);
      const voidN = list.filter(e => e._voided).length;
      const subLabel =
        voidN > 0
          ? `小計 NT$${Math.round(sub).toLocaleString()}（含撤回 ${voidN} 筆）`
          : `小計 NT$${Math.round(sub).toLocaleString()}`;
      return `
    <div class="trip-day-group">
      <div class="trip-day-label">
        <span>${esc(d)} · ${list.length} 筆</span>
        <span class="trip-day-sub">${subLabel}</span>
      </div>
      <div class="trip-day-items">
        ${list.map(e => tripExpenseHTML(e, trip.members.length)).join('')}
      </div>
    </div>`;
    })
    .join('');
}

export function renderDetailMemberChips(members) {
  const el = document.getElementById('detail-member-chips');
  el.innerHTML = members
    .map(m => {
      const avatarUrl = getAvatarUrlByMemberName(m, 'trip');
      const color = getMemberColor(m);
      const avatarHtml = avatarUrl
        ? `<img class="member-chip-avatar" src="${avatarUrl}" alt="${esc(m)} 頭像">`
        : `<span class="member-chip-avatar member-chip-avatar--fallback" style="background:${color.bg};color:${color.fg}" aria-hidden="true">${esc(m.charAt(0))}</span>`;

      const removeBtn =
        members.length > 2
          ? `<button class="member-chip-remove" title="移除" onclick="removeMemberAction(${jqAttr(m)})">
           <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
         </button>`
          : '';
      return `<span class="member-chip">
          ${avatarHtml}
          <span class="member-chip-name">${esc(m)}</span>
          ${removeBtn}
        </span>`;
    })
    .join('');
}

function renderDetailKnownMembers(trip) {
  const el = document.getElementById('detail-known-members');
  if (!el) return;
  const known = getKnownMemberNames();
  const available = known.filter(n => !trip.members.includes(n));
  if (available.length === 0 || trip._closed) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="known-member-bar">
    <span class="known-member-bar-label">快速加入</span>
    ${available.map(n => {
      const c = getMemberColor(n);
      return `<button type="button" class="known-member-bar-btn" onclick="addDetailMemberByName(${jqAttr(n)})">
        <span class="known-member-bar-dot" style="background:${c.fg}">${esc(n.charAt(0))}</span>${esc(n)}
      </button>`;
    }).join('')}
  </div>`;
}

export function renderSplitChips(members) {
  const el = document.getElementById('d-split-chips');
  el.innerHTML = members
    .map(m => {
      const active = appState.detailSplitAmong.includes(m);
      return `<button class="split-chip ${active ? 'active' : ''}" onclick="toggleSplit(${jqAttr(m)})">${esc(m)}</button>`;
    })
    .join('');
  updatePerPerson();
}

function renderSettlement(members, expenses, trip) {
  const bar = document.getElementById('settlement-bar');
  const body = document.getElementById('settlement-body');
  const active = expenses.filter(e => !e._voided);
  const voidCount = expenses.length - active.length;

  if (expenses.length === 0) {
    bar.className = 'balance-bar';
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

  const adjustments = trip
    ? getTripSettlementAdjustmentsFromRows(trip.id, appState.allRows)
    : [];
  const settlements = computeSettlements(members, active, adjustments);
  const total = active.reduce((s, e) => s + e.amount, 0);
  const subNote = voidCount > 0 ? ` · 已排除撤回 ${voidCount} 筆` : '';

  if (settlements.length === 0) {
    bar.className = 'balance-bar';
    body.innerHTML = `<div class="balance-content">
      <div class="balance-icon" style="background:#eff6ff">
        <svg viewBox="0 0 24 24" style="fill:#3b82f6"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
      </div>
      <div>
        <div class="balance-label">目前結算</div>
        <div style="font-size:22px;font-weight:700">帳目已清</div>
        <div class="balance-sub">有效 ${active.length} 筆 · NT$${Math.round(total)}${subNote}</div>
      </div>
    </div>`;
    return;
  }

  bar.className = 'balance-bar';
  bar.style.background = '#f59e0b';
  const maxPay = Math.max(...settlements.map(s => s.amount), 1);
  const canSettle = trip && !trip._closed;
  const rowsHtml = settlements
    .map(s => {
      const amt = Math.round(s.amount);
      const barPct = Math.round((s.amount / maxPay) * 100);
      const coverW = tripPrefersReducedMotion() ? 100 - barPct : 100;
      const repayBtn = canSettle
        ? `<button type="button" class="settle-btn settle-btn--inline" data-from="${esc(s.from)}" data-to="${esc(
            s.to,
          )}" onclick="recordTripSettlementOneAction(this)">還款</button>`
        : '';
      return `<div class="settlement-row settlement-row--visual" data-amt="${amt}" data-bar-pct="${barPct}">
      <div class="settlement-flow">
        ${memberAvatarPill(s.from, 'settlement-pill settlement-pill--payer')}
        <span class="settlement-names">${esc(s.from)}</span>
        <span class="settlement-arrow" aria-hidden="true">→</span>
        ${memberAvatarPill(s.to, 'settlement-pill settlement-pill--payee')}
        <span class="settlement-names">${esc(s.to)}</span>
        <div class="settlement-flow-tail">
        <span class="settlement-amount" data-settle-amt>NT$${tripPrefersReducedMotion() ? amt.toLocaleString() : '0'}</span>
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
        <span class="settlement-header-meta">有效 ${active.length} 筆 · NT$${Math.round(total)}${subNote}</span>
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

function updatePerPerson() {
  if (appState.detailMultiPay) {
    updateMultiPayTotal();
    return;
  }
  const a = parseFloat(document.getElementById('d-amount').value) || 0;
  const note = document.getElementById('d-per-person');
  note.textContent =
    a > 0 && appState.detailSplitAmong.length > 0
      ? '每人 NT$' + Math.round(a / appState.detailSplitAmong.length)
      : '';
}

function updateMultiPayTotal() {
  const rows = document.querySelectorAll('#d-payers-list .payer-amount');
  const total = Array.from(rows).reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
  const el = document.getElementById('d-multipay-total');
  const n = appState.detailSplitAmong.length || 1;
  if (total > 0) {
    el.textContent = `合計 NT$${Math.round(total)}，每人分 NT$${Math.round(total / n)}`;
  } else {
    el.textContent = '';
  }
}

export function renderTripDetail() {
  const trip = getTripById(appState.currentTripId);
  if (!trip) {
    if (appState.currentPage === 'tripDetail') navigate('trips');
    return;
  }
  const expenses = getTripExpenses(appState.currentTripId);
  appState._tripExpenseCache = expenses;

  document.getElementById('detail-name').textContent = trip.name;
  const activeExp = expenses.filter(e => !e._voided);
  const voidExpN = expenses.length - activeExp.length;
  document.getElementById('detail-count').textContent =
    voidExpN > 0 ? `有效 ${activeExp.length} 筆 · 共 ${expenses.length} 筆` : `${activeExp.length} 筆`;

  renderDetailMemberChips(trip.members);
  renderDetailKnownMembers(trip);
  renderTripLotteryCard(trip);

  if (!appState.detailPaidBy || !trip.members.includes(appState.detailPaidBy)) {
    appState.detailPaidBy = trip.members[0] || '';
  }
  const paidWrap = document.getElementById('d-paidby-toggles');
  if (paidWrap) {
    paidWrap.innerHTML = trip.members
      .map(
        m =>
          `<button type="button" class="btn-toggle${m === appState.detailPaidBy ? ' active' : ''}" data-member="${esc(m)}" onclick="setDetailPaidBy(${jqAttr(m)})">${esc(m)}</button>`,
      )
      .join('');
  }

  appState.detailSplitAmong = appState.detailSplitAmong.filter(m => trip.members.includes(m));
  if (appState.detailSplitAmong.length === 0) appState.detailSplitAmong = [...trip.members];
  renderSplitChips(trip.members);

  renderSettlement(trip.members, expenses, trip);

  const payerEl = document.getElementById('trip-payer-stats');
  if (payerEl) {
    payerEl.innerHTML = renderTripStatsCard(trip.members, expenses);
  }

  const headerActions = document.getElementById('trip-header-actions');
  const archiveBar = document.getElementById('trip-archive-bar');
  const addCard = document.getElementById('add-expense-card');
  if (trip._closed) {
    if (headerActions) headerActions.innerHTML = '';
    archiveBar.innerHTML = `<div class="trip-closed-bar">
      <div class="trip-closed-bar-note">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;flex-shrink:0"><path d="M20 6h-2.18c.07-.44.18-.88.18-1 0-2.21-1.79-4-4-4s-4 1.79-4 4c0 .12.11.56.18 1H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-3c1.1 0 2 .9 2 2 0 .12-.11.56-.18 1h-3.64C12.11 5.56 12 5.12 12 5c0-1.1.9-2 2-2zm0 10l-4-4 1.41-1.41L14 10.17l4.59-4.58L20 7l-6 6z"/></svg>
        此行程已結束，僅供瀏覽
      </div>
      <div class="trip-closed-bar-actions">
        <button type="button" class="btn btn-primary btn-sm" onclick='copyTripSettlementSummary(${jq(trip.id)})'>複製結算懶人包</button>
        <button type="button" class="btn btn-outline btn-sm" onclick='reopenTripAction(${jq(trip.id)})'>重新開啟</button>
      </div>
    </div>`;
    addCard.style.display = 'none';
  } else {
    if (headerActions) {
      headerActions.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" style="color:var(--text-muted);font-size:12px;gap:5px;flex-shrink:0" onclick='closeTripAction(${jq(trip.id)})'>
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M20 6h-2.18c.07-.44.18-.88.18-1 0-2.21-1.79-4-4-4s-4 1.79-4 4c0 .12.11.56.18 1H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-3c1.1 0 2 .9 2 2 0 .12-.11.56-.18 1h-3.64C12.11 5.56 12 5.12 12 5c0-1.1.9-2 2-2zm0 10l-4-4 1.41-1.41L14 10.17l4.59-4.58L20 7l-6 6z"/></svg>
        結束行程
      </button>`;
    }
    archiveBar.innerHTML = '';
    addCard.style.display = '';
  }

  const expEl = document.getElementById('detail-expenses');
  if (expenses.length === 0) {
    expEl.innerHTML = emptyHTML('還沒有消費紀錄', '');
  } else {
    expEl.innerHTML = buildTripExpensesByDayHTML(expenses, trip);
  }
}

export { updatePerPerson, updateMultiPayTotal };
