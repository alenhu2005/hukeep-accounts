import { USER_A, USER_B } from './config.js';
import { appState } from './state.js';
import { getDailyRecords, getAvatarUrlByMemberName } from './data.js';
import { computeBalance } from './finance.js';
import { categoryBadgeHTML } from './category.js';
import { esc, jq, jqAttr, prefersReducedMotion } from './utils.js';
import { emptyHTML } from './views-shared.js';

let balanceCountGen = 0;

/** 樂觀更新失敗時呼叫，中止進行中的結算數字刷動 */
export function cancelHomeBalanceAnim() {
  balanceCountGen++;
}

function runBalanceAmountCountUp(mainEl, settleBtn, fromAbs, toAbs, onDone, durationMs = 980) {
  const gen = balanceCountGen;
  const duration = durationMs;
  const from = Math.round(fromAbs);
  const to = Math.round(toAbs);
  const delta = to - from;
  const start = performance.now();
  function frame(now) {
    if (gen !== balanceCountGen) return;
    const u = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - u) ** 3;
    const val = Math.round(from + delta * eased);
    mainEl.textContent = 'NT$ ' + val;
    // settle button stays as "✓ 還款" to avoid distracting amount changes
    if (u < 1) {
      requestAnimationFrame(frame);
    } else if (onDone) {
      onDone();
    }
  }
  requestAnimationFrame(frame);
}

export function renderHome() {
  balanceCountGen++;
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

  const wantBalanceAnim = appState.animateHomeBalanceNext && !prefersReducedMotion();
  appState.animateHomeBalanceNext = false;
  let deltaFromAbs = appState.pendingHomeBalanceFromAbs;
  appState.pendingHomeBalanceFromAbs = null;
  if (wantBalanceAnim) deltaFromAbs = null;

  const absAmt = balance === 0 ? 0 : Math.round(Math.abs(balance));

  function applyBalanceAmount() {
    settleBtn.style.display = 'inline-block';
    if (wantBalanceAnim) {
      main.textContent = 'NT$ 0';
      settleBtn.textContent = '✓ 還款';
      runBalanceAmountCountUp(main, settleBtn, 0, absAmt, () => {
        appState.homeBalanceAbsShown = absAmt;
      });
    } else if (
      typeof deltaFromAbs === 'number' &&
      !prefersReducedMotion() &&
      deltaFromAbs !== absAmt
    ) {
      const from = Math.max(0, Math.round(deltaFromAbs));
      main.textContent = 'NT$ ' + from;
      settleBtn.textContent = '✓ 還款';
      runBalanceAmountCountUp(main, settleBtn, from, absAmt, () => {
        appState.homeBalanceAbsShown = absAmt;
      }, 760);
    } else {
      main.textContent = 'NT$ ' + absAmt;
      settleBtn.textContent = '✓ 還款';
      appState.homeBalanceAbsShown = absAmt;
    }
  }

  if (balance === 0) {
    bar.className = 'balance-bar';
    iconWrap.style.cssText = 'background:#eff6ff';
    svg.style.cssText = 'fill:#3b82f6';
    svg.innerHTML =
      '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>';
    main.textContent = '帳目已清';
    who.textContent = '';
    settleBtn.style.display = 'none';
    appState.homeBalanceAbsShown = 0;
  } else if (balance > 0) {
    bar.className = 'balance-bar success';
    iconWrap.style.cssText = 'background:#d1fae5';
    svg.style.cssText = 'fill:#10b981';
    svg.innerHTML =
      '<path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>';
    who.textContent = `${USER_B}欠${USER_A}`;
    applyBalanceAmount();
  } else {
    bar.className = 'balance-bar danger';
    iconWrap.style.cssText = 'background:#fee2e2';
    svg.style.cssText = 'fill:#ef4444';
    svg.innerHTML =
      '<path d="M16 18l2.29-2.29-4.88-4.88-4 4L2 7.41 3.41 6l6 6 4-4 6.3 6.29L22 12v6z"/>';
    who.textContent = `${USER_A}欠${USER_B}`;
    applyBalanceAmount();
  }
  sub.textContent = expCount > 0 ? '共 ' + expCount + ' 筆消費' : '';

  const ordered = [...records].reverse();
  let running = 0;
  const balanceMap = {};
  for (const r of ordered) {
    if (!r._voided) {
      const a = parseFloat(r.amount) || 0;
      if (r.type === 'settlement') {
        if (r.paidBy === USER_A) running += a;
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
        if (r.paidBy === USER_A) running += shareZhan;
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

  const pageHome = document.getElementById('page-home');
  if (pageHome) {
    pageHome.classList.remove('home-refresh-reveal');
    if (pageHome._homeRevealT) {
      clearTimeout(pageHome._homeRevealT);
      pageHome._homeRevealT = null;
    }
    if (wantBalanceAnim) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (appState.currentPage !== 'home') return;
          pageHome.classList.add('home-refresh-reveal');
          pageHome._homeRevealT = setTimeout(() => {
            pageHome.classList.remove('home-refresh-reveal');
            pageHome._homeRevealT = null;
          }, 1250);
        });
      });
    }
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
  if (rounded > 0) return `<div class="record-running pos">${USER_B}欠 +${rounded}</div>`;
  return `<div class="record-running neg">${USER_A}欠 ${rounded}</div>`;
}

function recordAvatarHTML(name, cssClass, clickable = false) {
  const url = getAvatarUrlByMemberName(name);
  const inner = url
    ? `<img class="record-avatar-img" src="${url}" alt="${esc(name)}">`
    : esc(name);
  if (clickable) {
    return `<button type="button" class="record-avatar ${cssClass} record-avatar-clickable" onclick="openAvatarPickerForMember(${jqAttr(name)})" title="${esc(name)} — 點擊更換頭像">${inner}</button>`;
  }
  return `<div class="record-avatar ${cssClass}">${inner}</div>`;
}

function photoThumbHTML(r) {
  if (!r.photoUrl) return '';
  return `<button type="button" class="record-photo-btn" onclick="event.stopPropagation();openPhotoLightbox('${r.photoUrl.replace(/'/g, "\\'")}')" title="查看照片" aria-label="查看照片">
    <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
  </button>`;
}

function dailyRecordHTML(r, runBal) {
  const isHu = r.paidBy === USER_A;
  const a = parseFloat(r.amount) || 0;

  const clickAttr = r._voided ? '' : `onclick='openEditRecordById(${jq(r.id)},false)' style="cursor:pointer" title="點擊編輯"`;
  const photoEl = photoThumbHTML(r);

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
    </div>`;
  }

  const noteEl = r.note ? `<div class="record-note">${esc(r.note)}</div>` : '';

  if (r.splitMode === '兩人付') {
    const hu = parseFloat(r.paidHu) || 0;
    const zhan = parseFloat(r.paidZhan) || 0;
    const metaDetail = `胡 NT$${Math.round(hu)} ＋ 詹 NT$${Math.round(zhan)}`;
    return `<div class="record-item${r._voided ? ' is-voided' : ''}">
      ${recordAvatarHTML('兩', 'split')}
      <div class="record-info" ${clickAttr}>
        <div class="record-name">
          <span class="record-name-text">${esc(r.item)}</span>
          <span class="badge${r._voided ? ' badge-void' : ''}">${r._voided ? '已撤回' : '各自出資'}</span>
          ${categoryBadgeHTML(r.category)}
        </div>
        <div class="record-meta">${esc(r.date)} · ${metaDetail}</div>
        ${noteEl}
      </div>
      ${photoEl}
      <div class="record-amount-wrap">
        <div class="record-amount" style="${r._voided ? 'color:#9ca3af;text-decoration:line-through' : ''}">NT$${Math.round(a)}</div>
        ${runningHTML(runBal)}
      </div>
    </div>`;
  }

  const label = r.splitMode === '均分' ? '各付一半' : r.splitMode === '只有胡' ? '只算胡的' : '只算詹的';
  return `<div class="record-item${r._voided ? ' is-voided' : ''}">
    ${recordAvatarHTML(r.paidBy, isHu ? 'me' : 'other', true)}
    <div class="record-info" ${clickAttr}>
      <div class="record-name">
        <span class="record-name-text">${esc(r.item)}</span>
        <span class="badge${r._voided ? ' badge-void' : ''}">${r._voided ? '已撤回' : label}</span>
        ${categoryBadgeHTML(r.category)}
      </div>
      <div class="record-meta">${esc(r.date)} · ${esc(r.paidBy)}付</div>
      ${noteEl}
    </div>
    ${photoEl}
    <div class="record-amount-wrap">
      <div class="record-amount" style="${r._voided ? 'color:#9ca3af;text-decoration:line-through' : ''}">NT$${Math.round(a)}</div>
      ${runningHTML(runBal)}
    </div>
  </div>`;
}
