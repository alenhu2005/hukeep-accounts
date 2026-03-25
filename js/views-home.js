import { appState } from './state.js';
import { getDailyRecords } from './data.js';
import { computeBalance } from './finance.js';
import { categoryBadgeHTML } from './category.js';
import { esc, jq } from './utils.js';
import { emptyHTML } from './views-shared.js';

export function renderHome() {
  const records = getDailyRecords();
  appState._dailyRecordsCache = records;
  const expCount = records.filter(r => r.type === 'daily').length;
  document.getElementById('home-count').textContent = expCount + ' 筆';

  const balance = computeBalance(records);
  const bar = document.getElementById('balance-bar');
  const main = document.getElementById('balance-main');
  const who = document.getElementById('balance-who');
  const sub = document.getElementById('balance-sub');
  const iconWrap = document.getElementById('balance-icon-wrap');
  const svg = document.getElementById('balance-svg');
  const settleBtn = document.getElementById('settle-btn');

  if (balance === 0) {
    bar.className = 'balance-bar';
    iconWrap.style.cssText = 'background:#eff6ff';
    svg.style.cssText = 'fill:#3b82f6';
    svg.innerHTML =
      '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>';
    main.textContent = '帳目已清';
    who.textContent = '';
    settleBtn.style.display = 'none';
  } else if (balance > 0) {
    bar.className = 'balance-bar success';
    iconWrap.style.cssText = 'background:#d1fae5';
    svg.style.cssText = 'fill:#10b981';
    svg.innerHTML =
      '<path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>';
    main.textContent = 'NT$ ' + Math.round(balance);
    who.textContent = '詹欠胡';
    settleBtn.style.display = 'inline-block';
    settleBtn.textContent = '✓ 還款 NT$' + Math.round(balance);
  } else {
    bar.className = 'balance-bar danger';
    iconWrap.style.cssText = 'background:#fee2e2';
    svg.style.cssText = 'fill:#ef4444';
    svg.innerHTML =
      '<path d="M16 18l2.29-2.29-4.88-4.88-4 4L2 7.41 3.41 6l6 6 4-4 6.3 6.29L22 12v6z"/>';
    main.textContent = 'NT$ ' + Math.round(Math.abs(balance));
    who.textContent = '胡欠詹';
    settleBtn.style.display = 'inline-block';
    settleBtn.textContent = '✓ 還款 NT$' + Math.round(Math.abs(balance));
  }
  sub.textContent = expCount > 0 ? '共 ' + expCount + ' 筆消費' : '';

  const ordered = [...records].reverse();
  let running = 0;
  const balanceMap = {};
  for (const r of ordered) {
    if (!r._voided) {
      const a = parseFloat(r.amount) || 0;
      if (r.type === 'settlement') {
        if (r.paidBy === '胡') running += a;
        else running -= a;
      } else if (r.splitMode === '兩人付') {
        const hu = parseFloat(r.paidHu) || 0;
        const zhan = parseFloat(r.paidZhan) || 0;
        running += (hu - zhan) / 2;
      } else {
        let shareZhan = 0;
        let shareHu = 0;
        if (r.splitMode === '均分') {
          shareHu = a / 2;
          shareZhan = a / 2;
        } else if (r.splitMode === '只有胡') {
          shareHu = a;
        } else {
          shareZhan = a;
        }
        if (r.paidBy === '胡') running += shareZhan;
        else running -= shareHu;
      }
    }
    balanceMap[r.id] = running;
  }

  const listEl = document.getElementById('home-records');
  if (records.length === 0) {
    listEl.innerHTML = emptyHTML('還沒有消費紀錄', '填寫上方表單，開始記帳吧');
  } else {
    const LIMIT = 5;
    const visible = appState.homeShowAll ? records : records.slice(0, LIMIT);
    const hidden = records.length - visible.length;
    const moreBtn =
      hidden > 0
        ? `<button class="show-more-btn" onclick="toggleHomeHistory()">
           <svg viewBox="0 0 24 24" width="14" height="14" style="fill:currentColor"><path d="M7 10l5 5 5-5z"/></svg>
           查看更多 ${hidden} 筆
         </button>`
        : records.length > LIMIT
          ? `<button class="show-more-btn" onclick="toggleHomeHistory()">
             <svg viewBox="0 0 24 24" width="14" height="14" style="fill:currentColor"><path d="M7 14l5-5 5 5z"/></svg>
             收合
           </button>`
          : '';
    listEl.innerHTML = visible.map(r => dailyRecordHTML(r, balanceMap[r.id])).join('') + moreBtn;
  }
}

export function toggleHomeHistory() {
  appState.homeShowAll = !appState.homeShowAll;
  renderHome();
}

function runningHTML(val) {
  if (val === undefined) return '';
  const rounded = Math.round(val);
  if (rounded === 0) return `<div class="record-running zero">±0</div>`;
  if (rounded > 0) return `<div class="record-running pos">詹欠 +${rounded}</div>`;
  return `<div class="record-running neg">胡欠 ${rounded}</div>`;
}

function dailyRecordHTML(r, runBal) {
  const isHu = r.paidBy === '胡';
  const a = parseFloat(r.amount) || 0;
  const voidBtn = r._voided
    ? ''
    : `<button class="record-delete" title="撤回" onclick='voidDailyRecord(${jq(r.id)})'>
      <svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
    </button>`;

  const clickAttr = r._voided ? '' : `onclick='openEditRecordById(${jq(r.id)},false)' style="cursor:pointer" title="點擊編輯"`;

  if (r.type === 'settlement') {
    return `<div class="record-item is-settlement${r._voided ? ' is-voided' : ''}">
      <div class="record-avatar settle">↕</div>
      <div class="record-info" ${clickAttr}>
        <div class="record-name">
          <span class="record-name-text">還款紀錄</span>
          <span class="badge ${r._voided ? 'badge-void' : 'badge-settle'}">${r._voided ? '已撤回' : '還款'}</span>
        </div>
        <div class="record-meta">${esc(r.date)}</div>
      </div>
      <div class="record-amount-wrap">
        <div class="record-amount" style="color:${r._voided ? '#9ca3af' : '#065f46'}">NT$${Math.round(a)}</div>
        ${runningHTML(runBal)}
      </div>
      ${voidBtn}
    </div>`;
  }

  const noteEl = r.note ? `<div class="record-note">${esc(r.note)}</div>` : '';

  if (r.splitMode === '兩人付') {
    const hu = parseFloat(r.paidHu) || 0;
    const zhan = parseFloat(r.paidZhan) || 0;
    const metaDetail = `胡 NT$${Math.round(hu)} ＋ 詹 NT$${Math.round(zhan)}`;
    return `<div class="record-item${r._voided ? ' is-voided' : ''}">
      <div class="record-avatar split">兩</div>
      <div class="record-info" ${clickAttr}>
        <div class="record-name">
          <span class="record-name-text">${esc(r.item)}</span>
          <span class="badge${r._voided ? ' badge-void' : ''}">${r._voided ? '已撤回' : '各自出資'}</span>
          ${categoryBadgeHTML(r.category)}
        </div>
        <div class="record-meta">${esc(r.date)} · ${metaDetail}</div>
        ${noteEl}
      </div>
      <div class="record-amount-wrap">
        <div class="record-amount" style="${r._voided ? 'color:#9ca3af;text-decoration:line-through' : ''}">NT$${Math.round(a)}</div>
        ${runningHTML(runBal)}
      </div>
      ${voidBtn}
    </div>`;
  }

  const label = r.splitMode === '均分' ? '各付一半' : r.splitMode === '只有胡' ? '胡全付' : '詹全付';
  return `<div class="record-item${r._voided ? ' is-voided' : ''}">
    <div class="record-avatar ${isHu ? 'me' : 'other'}">${esc(r.paidBy)}</div>
    <div class="record-info" ${clickAttr}>
      <div class="record-name">
        <span class="record-name-text">${esc(r.item)}</span>
        <span class="badge${r._voided ? ' badge-void' : ''}">${r._voided ? '已撤回' : label}</span>
        ${categoryBadgeHTML(r.category)}
      </div>
      <div class="record-meta">${esc(r.date)} · ${esc(r.paidBy)}付</div>
      ${noteEl}
    </div>
    <div class="record-amount-wrap">
      <div class="record-amount" style="${r._voided ? 'color:#9ca3af;text-decoration:line-through' : ''}">NT$${Math.round(a)}</div>
      ${runningHTML(runBal)}
    </div>
    ${voidBtn}
  </div>`;
}
