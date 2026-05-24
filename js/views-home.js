import { USER_A, USER_B } from './config.js';
import { appState } from './state.js';
import { getDailyRecords, getAvatarUrlByMemberName, getMemberColor, isHiddenMemberColorId, getHiddenMemberStyleKey } from './data.js';
import { computeBalance, nextDailyLedgerBalance } from './finance.js';
import { categoryBadgeHTML } from './category.js';
import { esc, jq, jqAttr, prefersReducedMotion, bindScrollReveal } from './utils.js';
import { emptyHTML } from './views-shared.js';
import {
  computeDateRunningDeltas,
  directionClassFromDelta,
  directionAriaFromDelta,
  formatCalendarDayDeltaText,
} from './views-analysis.js';
import {
  buildCalendarGridCells,
  currentYm,
  formatMonthLabelZh,
  shiftYm,
  todayStr,
} from './time.js';

let balanceCountGen = 0;
let prevHomeDailyExpCount = null;
let prevBalanceBarClass = '';

/** 樂觀更新失敗時呼叫，中止進行中的結算數字刷動 */
export function cancelHomeBalanceAnim() {
  balanceCountGen++;
}

/**
 * @param {import('./model.js').LedgerRow[]} orderedOldestFirst
 * @returns {Record<string, number>}
 */
function buildRunningBalanceMap(orderedOldestFirst) {
  let running = 0;
  const balanceMap = {};
  for (const r of orderedOldestFirst) {
    running = nextDailyLedgerBalance(running, r);
    balanceMap[r.id] = running;
  }
  return balanceMap;
}

/** @param {import('./model.js').LedgerRow[]} records */
function aggregateCountsByDateInMonth(records, ym) {
  const m = new Map();
  for (const r of records) {
    if (!r.date || !r.date.startsWith(ym + '-')) continue;
    m.set(r.date, (m.get(r.date) || 0) + 1);
  }
  return m;
}

/**
 * @param {string} ym
 * @param {string | null} filterDate
 * @param {string} today
 * @param {Map<string, number>} statsByDate
 */
function homeCalendarHTML(ym, filterDate, today, statsByDate) {
  const cells = buildCalendarGridCells(ym);
  const monthDates = cells.filter(c => c.day != null).map(c => c.dateStr);
  const deltaByDate = computeDateRunningDeltas(getDailyRecords(), monthDates);
  const label = formatMonthLabelZh(ym);
  const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const wdRow = weekdayLabels.map(w => `<div class="home-cal-wd">${esc(w)}</div>`).join('');
  const numRows = cells.length / 7;
  const rows = [];
  for (let row = 0; row < numRows; row++) {
    const rowCells = cells.slice(row * 7, row * 7 + 7).map(cell => {
      if (cell.day == null) {
        return '<div class="home-cal-cell home-cal-cell--empty" aria-hidden="true"></div>';
      }
      const ds = cell.dateStr;
      const has = statsByDate.get(ds) || 0;
      const isToday = ds === today;
      const isSel = filterDate === ds;
      const dDelta = deltaByDate.get(ds);
      const dirCls = directionClassFromDelta(dDelta);
      const ariaDir = directionAriaFromDelta(dDelta);
      const deltaTxt = formatCalendarDayDeltaText(dDelta);
      const deltaEl =
        dDelta != null
          ? `<span class="cal-cell-delta" aria-hidden="true">${esc(deltaTxt)}</span>`
          : '';
      const ariaBase = has > 0 ? `${ds}，${has} 筆` : ds;
      const ariaAmt = dDelta != null ? `，結算淨額 ${deltaTxt}` : '';
      const aria = `${ariaBase}${ariaAmt}${ariaDir}`;
      return `<button type="button" class="home-cal-cell${isToday ? ' home-cal-cell--today' : ''}${isSel ? ' home-cal-cell--selected' : ''}${dirCls}"
        role="gridcell"
        onclick='selectHomeCalendarDay(${jq(ds)})'
        aria-label="${esc(aria)}"
        aria-pressed="${isSel ? 'true' : 'false'}"><span class="home-cal-cell-day">${cell.day}</span>${deltaEl}</button>`;
    });
    rows.push(`<div class="home-cal-row" role="row">${rowCells.join('')}</div>`);
  }
  return `
    <div class="home-cal-nav">
      <button type="button" class="home-cal-nav-btn" onclick="shiftHomeCalendarMonth(-1)" aria-label="上一個月">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <div class="home-cal-nav-title" id="home-cal-month-label">${esc(label)}</div>
      <button type="button" class="home-cal-nav-btn" onclick="shiftHomeCalendarMonth(1)" aria-label="下一個月">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
      </button>
    </div>
    <div class="home-cal-weekdays">${wdRow}</div>
    <div class="home-cal-grid" role="grid" aria-labelledby="home-cal-month-label">${rows.join('')}</div>
  `;
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
  const homeCountEl = document.getElementById('home-count');
  homeCountEl.textContent = expCount + ' 筆';
  if (prevHomeDailyExpCount !== null && prevHomeDailyExpCount !== expCount && !prefersReducedMotion()) {
    homeCountEl.classList.remove('home-count--tick');
    void homeCountEl.offsetWidth;
    homeCountEl.classList.add('home-count--tick');
    window.clearTimeout(homeCountEl._tickT);
    homeCountEl._tickT = window.setTimeout(() => {
      homeCountEl.classList.remove('home-count--tick');
      homeCountEl._tickT = null;
    }, 420);
  }
  prevHomeDailyExpCount = expCount;

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

  const absAmt = balance === 0 ? 0 : Math.ceil(Math.abs(balance));

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
  const barClsNow = bar.className;
  if (prevBalanceBarClass && prevBalanceBarClass !== barClsNow && !prefersReducedMotion()) {
    iconWrap.classList.remove('balance-icon--pulse');
    void iconWrap.offsetWidth;
    iconWrap.classList.add('balance-icon--pulse');
    window.clearTimeout(iconWrap._pulseT);
    iconWrap._pulseT = window.setTimeout(() => {
      iconWrap.classList.remove('balance-icon--pulse');
      iconWrap._pulseT = null;
    }, 420);
  }
  prevBalanceBarClass = barClsNow;
  sub.textContent = expCount > 0 ? '共 ' + expCount + ' 筆消費' : '';

  if (!appState.homeCalendarMonth) {
    appState.homeCalendarMonth = appState.homeCalendarFilterDate
      ? appState.homeCalendarFilterDate.slice(0, 7)
      : currentYm();
  }
  if (appState.homeCalendarFilterDate) {
    const ymF = appState.homeCalendarFilterDate.slice(0, 7);
    if (ymF !== appState.homeCalendarMonth) {
      appState.homeCalendarMonth = ymF;
    }
  }

  const ym = appState.homeCalendarMonth;
  const filterDate = appState.homeCalendarFilterDate;
  const today = todayStr();

  const statsByDate = aggregateCountsByDateInMonth(records, ym);

  const orderedFull = [...records].reverse();
  const balanceMap =
    filterDate != null
      ? buildRunningBalanceMap([...records.filter(r => r.date === filterDate)].reverse())
      : buildRunningBalanceMap(orderedFull);

  let scoped;
  if (records.length === 0) {
    scoped = [];
  } else if (filterDate) {
    scoped = records.filter(r => r.date === filterDate);
  } else {
    scoped = records;
  }

  const calendarEl = document.getElementById('home-calendar');
  if (calendarEl) {
    calendarEl.innerHTML = homeCalendarHTML(ym, filterDate, today, statsByDate);
  }

  const listEl = document.getElementById('home-records');
  if (listEl._scrollRevealCleanup) listEl._scrollRevealCleanup();
  if (records.length === 0) {
    listEl.innerHTML = emptyHTML('還沒有消費紀錄', '填寫上方表單，開始記帳吧');
  } else if (scoped.length === 0) {
    const hint = filterDate ? '這天沒有紀錄' : '還沒有消費紀錄';
    const subhint = filterDate ? '換一天，或再點月曆上同一日以顯示全部' : '填寫上方表單，開始記帳吧';
    listEl.innerHTML = emptyHTML(hint, subhint);
  } else {
    const LIMIT = 5;
    const useLimit = !appState.homeShowAll;
    const visible = useLimit ? scoped.slice(0, LIMIT) : scoped;
    const hidden = scoped.length - visible.length;
    const moreBtn =
      hidden > 0
        ? `<button type="button" class="show-more-btn" onclick="toggleHomeHistory()">
           <svg viewBox="0 0 24 24" width="14" height="14" style="fill:currentColor"><path d="M7 10l5 5 5-5z"/></svg>
           查看更多 ${hidden} 筆
         </button>`
        : scoped.length > LIMIT && appState.homeShowAll
          ? `<button type="button" class="show-more-btn" onclick="toggleHomeHistory()">
             <svg viewBox="0 0 24 24" width="14" height="14" style="fill:currentColor"><path d="M7 14l5-5 5 5z"/></svg>
             收合
           </button>`
          : '';
    listEl.innerHTML =
      visible.map((r, i) => dailyRecordHTML(r, balanceMap[r.id], i)).join('') + moreBtn;
    const doReveal = appState.revealHomeRecordsNext;
    appState.revealHomeRecordsNext = false;
    bindScrollReveal(listEl, '.record-item', { enabled: doReveal });
  }

  syncHomeCalendarModalDom();

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
  if (appState.homeShowAll) appState.revealHomeRecordsNext = true;
  renderHome();
}

function syncHomeCalendarModalDom() {
  const overlay = document.getElementById('home-calendar-modal-overlay');
  const sheet = document.getElementById('home-calendar-modal');
  const openBtn = document.getElementById('home-calendar-open-btn');
  const open = appState.homeCalendarModalOpen;
  if (overlay) {
    overlay.classList.toggle('home-cal-modal-overlay--open', !!open);
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  if (sheet) {
    sheet.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  if (openBtn) {
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  try {
    document.body.style.overflow = open ? 'hidden' : '';
  } catch {
    /* ignore */
  }
}

export function toggleHomeCalendarModal() {
  appState.homeCalendarModalOpen = !appState.homeCalendarModalOpen;
  syncHomeCalendarModalDom();
}

export function closeHomeCalendarModal() {
  appState.homeCalendarModalOpen = false;
  syncHomeCalendarModalDom();
}

export function shiftHomeCalendarMonth(delta) {
  appState.homeCalendarMonth = shiftYm(appState.homeCalendarMonth || currentYm(), delta);
  appState.homeCalendarFilterDate = null;
  renderHome();
}

export function selectHomeCalendarDay(dateStr) {
  if (appState.homeCalendarFilterDate === dateStr) {
    appState.homeCalendarFilterDate = null;
  } else {
    appState.homeCalendarFilterDate = dateStr;
    appState.homeCalendarMonth = dateStr.slice(0, 7);
  }
  /* 保持彈層開啟，才能看到選取樣式並再點同一日取消 */
  renderHome();
}

export function clearHomeCalendarDayFilter() {
  appState.homeCalendarFilterDate = null;
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
  const url = getAvatarUrlByMemberName(name, 'daily');
  const color = getMemberColor(name);
  const rare = isHiddenMemberColorId(color.id);
  const sk = rare ? getHiddenMemberStyleKey(color.id) : '';
  const styleCls = sk ? ` member-rare--${sk}` : '';
  const rareCls = rare ? ` record-avatar--rare${styleCls}` : '';
  const inner = url
    ? `<img class="record-avatar-img" src="${url}" alt="${esc(name)}">`
    : esc(name);
  const styleParts = [];
  if (!url) {
    styleParts.push(`background:${color.bg}`, `color:${color.fg}`);
  }
  const styleAttr = styleParts.length ? ` style="${styleParts.join(';')}"` : '';
  if (clickable) {
    return `<button type="button" class="record-avatar ${cssClass}${rareCls} record-avatar-clickable"${styleAttr} onclick="event.stopPropagation();openMemberAvatarPreview(${jqAttr(name)},'daily')" title="預覽頭像">${inner}</button>`;
  }
  return `<div class="record-avatar ${cssClass}${rareCls}"${styleAttr}>${inner}</div>`;
}

function photoThumbHTML(r) {
  if (!r.photoUrl) return '';
  return `<button type="button" class="record-photo-btn" onclick="event.stopPropagation();openPhotoLightbox('${r.photoUrl.replace(/'/g, "\\'")}')" title="查看照片" aria-label="查看照片">
    <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
  </button>`;
}

function dailyRecordHTML(r, runBal, recordIndex = 0) {
  const ri = `--record-i:${recordIndex};`;
  const isHu = r.paidBy === USER_A;
  const a = parseFloat(r.amount) || 0;

  const clickAttr = r._voided ? '' : `onclick='openEditRecordById(${jq(r.id)},false)' style="cursor:pointer" title="點擊編輯"`;
  const photoEl = photoThumbHTML(r);

  if (r.type === 'settlement') {
    return `<div class="record-item is-settlement${r._voided ? ' is-voided' : ''}" style="${ri}">
      <div class="record-avatar settle">↕</div>
      <div class="record-info" ${clickAttr}>
        <div class="record-name">
          <span class="record-name-text">還款紀錄</span>
          <span class="badge ${r._voided ? 'badge-void' : 'badge-settle'}">${r._voided ? '已撤回' : '還款'}</span>
        </div>
        <div class="record-meta">${esc(r.date)}</div>
      </div>
      <div class="record-amount-wrap">
        <div class="record-amount${r._voided ? '' : ' record-amount--settle'}" style="${r._voided ? 'color:#9ca3af' : ''}">NT$${Math.round(a)}</div>
        ${runningHTML(runBal)}
      </div>
    </div>`;
  }

  const noteEl = r.note ? `<div class="record-note">${esc(r.note)}</div>` : '';

  if (r.splitMode === '兩人付') {
    const hu = parseFloat(r.paidHu) || 0;
    const zhan = parseFloat(r.paidZhan) || 0;
    const metaDetail = `胡 NT$${Math.round(hu)} ＋ 詹 NT$${Math.round(zhan)}`;
    return `<div class="record-item${r._voided ? ' is-voided' : ''}" style="${ri}">
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
  return `<div class="record-item${r._voided ? ' is-voided' : ''}" style="${ri}">
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
