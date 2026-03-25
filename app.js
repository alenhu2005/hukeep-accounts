// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────
const API_URL = 'https://script.google.com/macros/s/AKfycbzDxvHzVV8TR3PR5IMS3zgZE_t1Dq3CDw1yEGGm3FkiQzikl7WnaCOvNMf8rvrcO9Jz/exec';

// ──────────────────────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────────────────────
let allRows = [];          // raw rows from GAS (append-only event log)
let currentPage = 'home';
let currentTripId = null;

// Form state – home
let homePaidBy = '胡';
let homeSplitMode = '均分';
let homeShowAll = false;
let _dailyRecordsCache = [];
let _tripExpenseCache = [];

// Analysis state
let analysisPeriod = 'month';

// Form state – new trip creation
let newTripMembers = [];

// Form state – trip detail
let detailSplitAmong = [];

// ──────────────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────────────
function uid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now();
}

function todayStr() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }); }

function esc(s) {
  if (s == null) return '';   // guard: don't show "undefined" or "null" as text
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/** Safe embedding of values inside inline onclick="" (avoids esc() + HTML entity decode breaking JS strings). */
function jq(v) { return JSON.stringify(v); }
/** Use inside onclick="..." so JSON double-quotes don't break the HTML attribute. */
function jqAttr(v) { return jq(v).replace(/"/g, '&quot;'); }

function parseArr(s) { try { const r = JSON.parse(s); return Array.isArray(r) ? r : []; } catch { return []; } }

// normalizeRow ensures every row returned by GAS has the rich internal fields
// the rest of the code expects, handling two cases:
//   1. Rich format  – GAS has all columns (after the updated doPost is deployed)
//   2. Compact fallback – old rows where trip fields were missing (backward compat)
function normalizeRow(r) {
  if (!r || !r.type) return r;
  if (r.type === 'daily') {
    r.item      = r.item      ?? '';
    r.paidBy    = r.paidBy    ?? '';
    r.splitMode = r.splitMode ?? '均分';
    r.date      = normalizeDate(r.date);
    r.amount    = r.amount    ?? 0;
    r.note      = r.note      || '';
    r.category  = typeof r.category === 'string' ? r.category.trim() : '';
  } else if (r.type === 'settlement') {
    r.item      = '還款';
    r.paidBy    = r.paidBy    ?? '';
    r.date      = normalizeDate(r.date);
    r.amount    = r.amount    ?? 0;
  } else if (r.type === 'trip') {
    r.name      = r.name      ?? (r.item      || '');
    r.createdAt = r.createdAt ?? (r.date       || '');
    r.members   = r.members   ?? (r.splitMode  || '[]');
  } else if (r.type === 'tripMember') {
    r.tripId     = r.tripId     ?? (r.id   || '');
    r.memberName = r.memberName ?? (r.date || '');
  } else if (r.type === 'tripExpense') {
    if (r.tripId == null || r.splitAmong == null) {
      const sm  = r.splitMode || '';
      const sep = sm.indexOf('::');
      r.tripId     = r.tripId     ?? (sep >= 0 ? sm.slice(0, sep) : '');
      r.splitAmong = r.splitAmong ?? (sep >= 0 ? sm.slice(sep + 2) : '[]');
    }
    r.item      = r.item      ?? '';
    r.paidBy    = r.paidBy    ?? '';
    r.amount    = r.amount    ?? 0;
    r.date      = normalizeDate(r.date);
    r.note      = r.note      || '';
    r.category  = typeof r.category === 'string' ? r.category.trim() : '';
    if (typeof r.payers === 'string') {
      try { r.payers = JSON.parse(r.payers); } catch { r.payers = null; }
    }
  }
  return r;
}

// Google Sheets serialises date cells as ISO timestamps ("2026-03-24T16:00:00.000Z").
// Extract just the YYYY-MM-DD part so the UI shows a clean date string.
function normalizeDate(d) {
  if (!d) return '';
  const s = String(d);
  if (s.length > 10 && s.includes('T')) {
    return new Date(s).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  }
  return s;
}

function toast(msg) {
  const el = document.getElementById('toast-container');
  const div = document.createElement('div');
  div.className = 'toast-item';
  div.textContent = msg;
  el.appendChild(div);
  setTimeout(() => div.remove(), 3200);
}

// ──────────────────────────────────────────────────────────────────────────────
// Confirm dialog (promise-based)
// ──────────────────────────────────────────────────────────────────────────────
let _dlgResolve = null;

function showConfirm(title, desc) {
  return new Promise(resolve => {
    _dlgResolve = resolve;
    document.getElementById('dlg-title').textContent = title;
    document.getElementById('dlg-desc').textContent = desc;
    document.getElementById('dlg-ok').onclick = () => { closeDialog(); resolve(true); };
    document.getElementById('dialog-overlay').classList.add('open');
  });
}

function cancelDialog() { closeDialog(); if (_dlgResolve) { _dlgResolve(false); _dlgResolve = null; } }
function closeDialog() { document.getElementById('dialog-overlay').classList.remove('open'); }

// ──────────────────────────────────────────────────────────────────────────────
// API
// ──────────────────────────────────────────────────────────────────────────────
const CACHE_DAILY = 'gasRows_daily_v2';
const CACHE_TRIP  = 'gasRows_trip_v2';
const TRIP_TYPES  = new Set(['trip', 'tripMember', 'tripExpense']);
const DAILY_TYPES = new Set(['daily', 'settlement']);

function isDailyRow(r) { return r && DAILY_TYPES.has(r.type); }
function isTripRow(r)  { return r && TRIP_TYPES.has(r.type); }

function loadCache() {
  try {
    const daily = localStorage.getItem(CACHE_DAILY);
    const trip  = localStorage.getItem(CACHE_TRIP);
    allRows = [
      ...(daily ? JSON.parse(daily) : []),
      ...(trip  ? JSON.parse(trip)  : []),
    ].map(normalizeRow);
  } catch {}
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_DAILY, JSON.stringify(allRows.filter(isDailyRow)));
    localStorage.setItem(CACHE_TRIP,  JSON.stringify(allRows.filter(isTripRow)));
  } catch {}
}

async function loadData() {
  const localDailyRows = allRows.filter(isDailyRow);
  const localTripRows  = allRows.filter(isTripRow);
  try {
    const res = await fetch(API_URL + '?t=' + Date.now(), { redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const raw = await res.json();
    const fresh = (Array.isArray(raw) ? raw : [])
      .filter(r => r && r.type)
      .map(normalizeRow);

    // GAS returned no rows — keep local cache intact rather than wiping it
    if (fresh.length === 0) return;

    const freshDaily = fresh.filter(isDailyRow);
    const freshTrips = fresh.filter(isTripRow);

    // GAS responded with data — use it as source of truth.
    // Only fall back to local cache if GAS returned absolutely nothing.
    const gasHasData = fresh.length > 0;
    const dailyRows = freshDaily.length > 0 ? freshDaily
                    : (gasHasData ? [] : localDailyRows);

    const localById = {};
    localTripRows.forEach(r => { if (r.id) localById[r.id] = r; });

    const tripRows = freshTrips.length > 0
      ? freshTrips.map(r => {
          const local = localById[r.id];
          if (!local) return r;
          if (r.type === 'trip'        && !r.name)   return local;
          if (r.type === 'tripExpense' && !r.tripId)  return local;
          return r;
        })
      : (gasHasData ? [] : localTripRows);

    allRows = [...dailyRows, ...tripRows];
    saveCache();
  } catch (e) {
    console.warn('Load error:', e.message || e);
  }
}

async function postRow(data) {
  // Use text/plain to avoid CORS preflight with Google Apps Script
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(data),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  saveCache(); // keep local cache in sync after every confirmed write
}

// ──────────────────────────────────────────────────────────────────────────────
// Derived state helpers
// ──────────────────────────────────────────────────────────────────────────────
function getDailyRecords() {
  const hardDelIds = new Set(
    allRows.filter(r => DAILY_TYPES.has(r.type) && r.action === 'delete').map(r => r.id)
  );
  const voidIds = new Set(
    allRows.filter(r => DAILY_TYPES.has(r.type) && r.action === 'void').map(r => r.id)
  );
  // Build edit map: last edit wins
  const editMap = {};
  for (const e of allRows.filter(r => DAILY_TYPES.has(r.type) && r.action === 'edit')) {
    editMap[e.id] = { date: normalizeDate(e.date), note: e.note ?? '', ...(e.category !== undefined ? { category: e.category } : {}) };
  }
  return allRows
    .filter(r => DAILY_TYPES.has(r.type) && r.action === 'add' && !hardDelIds.has(r.id))
    .map(r => {
      let rec = voidIds.has(r.id) ? { ...r, _voided: true } : r;
      if (editMap[r.id]) rec = { ...rec, ...editMap[r.id] };
      return rec;
    })
    .slice().reverse();
}

function getTrips() {
  const delIds = new Set(
    allRows.filter(r => r.type === 'trip' && r.action === 'delete').map(r => r.id)
  );
  return allRows
    .filter(r => r.type === 'trip' && r.action === 'add' && !delIds.has(r.id))
    .map(r => buildTrip(r))
    .reverse();
}

function buildTrip(tripRow) {
  let members = parseArr(tripRow.members);
  const events = allRows.filter(r => r.type === 'tripMember' && r.tripId === tripRow.id);
  for (const ev of events) {
    if (ev.action === 'add' && !members.includes(ev.memberName)) {
      members = [...members, ev.memberName];
    } else if (ev.action === 'remove') {
      members = members.filter(m => m !== ev.memberName);
    }
  }
  const closeEvents = allRows.filter(r => r.type === 'trip' && (r.action === 'close' || r.action === 'reopen') && r.id === tripRow.id);
  const lastCloseEvent = closeEvents[closeEvents.length - 1];
  const _closed = lastCloseEvent ? lastCloseEvent.action === 'close' : false;
  return { id: tripRow.id, name: tripRow.name, members, createdAt: tripRow.createdAt, _closed };
}

function getTripById(id) {
  const row = allRows.find(r => r.type === 'trip' && r.action === 'add' && r.id === id);
  if (!row) return null;
  const delIds = new Set(allRows.filter(r => r.type === 'trip' && r.action === 'delete').map(r => r.id));
  return delIds.has(id) ? null : buildTrip(row);
}

function getTripExpenses(tripId) {
  const hardDelIds = new Set(
    allRows.filter(r => r.type === 'tripExpense' && r.action === 'delete').map(r => r.id)
  );
  const voidIds = new Set(
    allRows.filter(r => r.type === 'tripExpense' && r.action === 'void').map(r => r.id)
  );
  const editMap = {};
  for (const e of allRows.filter(r => r.type === 'tripExpense' && r.action === 'edit')) {
    editMap[e.id] = { date: normalizeDate(e.date), note: e.note ?? '', ...(e.category !== undefined ? { category: e.category } : {}) };
  }
  return allRows
    .filter(r => r.type === 'tripExpense' && r.action === 'add' && r.tripId === tripId && !hardDelIds.has(r.id))
    .map(r => {
      let rec = { ...r, amount: parseFloat(r.amount) || 0, splitAmong: parseArr(r.splitAmong), _voided: voidIds.has(r.id) };
      if (editMap[r.id]) rec = { ...rec, ...editMap[r.id] };
      return rec;
    })
    .slice().reverse();
}

// ──────────────────────────────────────────────────────────────────────────────
// Balance / settlement calculations
// ──────────────────────────────────────────────────────────────────────────────
function computeBalance(records) {
  let net = 0;
  for (const r of records) {
    if (r._voided) continue;
    const a = parseFloat(r.amount) || 0;
    if (r.type === 'settlement') {
      // paidBy = who is paying off their debt
      if (r.paidBy === '胡') net += a;   // 胡 pays 詹 → reduces 胡's debt (net goes up)
      else                   net -= a;   // 詹 pays 胡 → reduces 詹's debt (net goes down)
      continue;
    }
    if (r.splitMode === '兩人付') {
      const hu   = parseFloat(r.paidHu)   || 0;
      const zhan = parseFloat(r.paidZhan) || 0;
      net += (hu - zhan) / 2;
      continue;
    }
    let shareHu = 0, shareZhan = 0;
    if (r.splitMode === '均分')    { shareHu = a/2; shareZhan = a/2; }
    else if (r.splitMode === '只有胡') { shareHu = a; }
    else                            { shareZhan = a; }
    if (r.paidBy === '胡') net += shareZhan;
    else                   net -= shareHu;
  }
  return net;
}

function computeSettlements(members, expenses) {
  const bal = {};
  members.forEach(m => (bal[m] = 0));
  for (const e of expenses.filter(e => !e._voided)) {
    const share = e.amount / (e.splitAmong.length || 1);
    if (e.payers && Array.isArray(e.payers)) {
      for (const p of e.payers) bal[p.name] = (bal[p.name] || 0) + (parseFloat(p.amount) || 0);
    } else {
      bal[e.paidBy] = (bal[e.paidBy] || 0) + e.amount;
    }
    for (const m of e.splitAmong) bal[m] = (bal[m] || 0) - share;
  }
  const pos = Object.entries(bal).filter(([,v]) => v >  0.01).map(([n,a]) => ({n, a}));
  const neg = Object.entries(bal).filter(([,v]) => v < -0.01).map(([n,a]) => ({n, a: -a}));
  const out = [];
  let i = 0, j = 0;
  while (i < neg.length && j < pos.length) {
    const pay = Math.min(neg[i].a, pos[j].a);
    if (pay > 0.01) out.push({ from: neg[i].n, to: pos[j].n, amount: pay });
    neg[i].a -= pay; pos[j].a -= pay;
    if (neg[i].a < 0.01) i++;
    if (pos[j].a < 0.01) j++;
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Navigation
// ──────────────────────────────────────────────────────────────────────────────
function navigate(page, tripId = null) {
  currentPage = page;
  currentTripId = tripId;
  // Reset multi-pay state when entering trip detail
  if (page === 'tripDetail' && detailMultiPay) {
    detailMultiPay = false;
    const tog = document.getElementById('d-multipay-toggle');
    if (tog) tog.textContent = '多人出款';
    const pg = document.getElementById('d-paidby-group');
    const ag = document.getElementById('d-amount-group');
    const mg = document.getElementById('d-multipay-group');
    if (pg) pg.style.display = ''; if (ag) ag.style.display = ''; if (mg) mg.style.display = 'none';
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const pageId = page === 'tripDetail' ? 'page-trip-detail'
               : page === 'trips'     ? 'page-trips'
               : page === 'analysis'  ? 'page-analysis'
               :                        'page-home';
  document.getElementById(pageId).classList.add('active');
  const navId = page === 'trips' ? 'nav-trips' : page === 'analysis' ? 'nav-analysis' : 'nav-home';
  document.getElementById(navId).classList.add('active');
  window.scrollTo(0, 0);
  render();
}

// ──────────────────────────────────────────────────────────────────────────────
// Render
// ──────────────────────────────────────────────────────────────────────────────
function render() {
  if (currentPage === 'home')         renderHome();
  else if (currentPage === 'trips')   renderTrips();
  else if (currentPage === 'analysis') renderAnalysis();
  else                              renderTripDetail();
}

// ── Home ──────────────────────────────────────────────────────────────────────
function renderHome() {
  const records  = getDailyRecords();
  _dailyRecordsCache = records;
  const expCount = records.filter(r => r.type === 'daily').length;
  document.getElementById('home-count').textContent = expCount + ' 筆';

  const balance   = computeBalance(records);
  const bar       = document.getElementById('balance-bar');
  const main      = document.getElementById('balance-main');
  const who       = document.getElementById('balance-who');
  const sub       = document.getElementById('balance-sub');
  const iconWrap  = document.getElementById('balance-icon-wrap');
  const svg       = document.getElementById('balance-svg');
  const settleBtn = document.getElementById('settle-btn');

  if (balance === 0) {
    bar.className = 'balance-bar';
    iconWrap.style.cssText = 'background:#eff6ff';
    svg.style.cssText = 'fill:#3b82f6';
    svg.innerHTML = '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>';
    main.textContent = '帳目已清';
    who.textContent  = '';
    settleBtn.style.display = 'none';
  } else if (balance > 0) {
    bar.className = 'balance-bar success';
    iconWrap.style.cssText = 'background:#d1fae5';
    svg.style.cssText = 'fill:#10b981';
    svg.innerHTML = '<path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>';
    main.textContent = 'NT$ ' + Math.round(balance);
    who.textContent  = '詹欠胡';
    settleBtn.style.display = 'inline-block';
    settleBtn.textContent   = '✓ 還款 NT$' + Math.round(balance);
  } else {
    bar.className = 'balance-bar danger';
    iconWrap.style.cssText = 'background:#fee2e2';
    svg.style.cssText = 'fill:#ef4444';
    svg.innerHTML = '<path d="M16 18l2.29-2.29-4.88-4.88-4 4L2 7.41 3.41 6l6 6 4-4 6.3 6.29L22 12v6z"/>';
    main.textContent = 'NT$ ' + Math.round(Math.abs(balance));
    who.textContent  = '胡欠詹';
    settleBtn.style.display = 'inline-block';
    settleBtn.textContent   = '✓ 還款 NT$' + Math.round(Math.abs(balance));
  }
  sub.textContent = expCount > 0 ? '共 ' + expCount + ' 筆消費' : '';

  // Compute running balance per record (oldest → newest)
  const ordered = [...records].reverse();
  let running = 0;
  const balanceMap = {};
  for (const r of ordered) {
    if (!r._voided) {
      const a = parseFloat(r.amount) || 0;
      if (r.type === 'settlement') {
        if (r.paidBy === '胡') running += a; else running -= a;
      } else if (r.splitMode === '兩人付') {
        const hu   = parseFloat(r.paidHu)   || 0;
        const zhan = parseFloat(r.paidZhan) || 0;
        running += (hu - zhan) / 2;
      } else {
        let shareZhan = 0, shareHu = 0;
        if (r.splitMode === '均分')       { shareHu = a/2; shareZhan = a/2; }
        else if (r.splitMode === '只有胡') { shareHu = a; }
        else                               { shareZhan = a; }
        if (r.paidBy === '胡') running += shareZhan; else running -= shareHu;
      }
    }
    balanceMap[r.id] = running;
  }

  const listEl = document.getElementById('home-records');
  if (records.length === 0) {
    listEl.innerHTML = emptyHTML('還沒有消費紀錄', '填寫上方表單，開始記帳吧');
  } else {
    const LIMIT = 5;
    const visible = homeShowAll ? records : records.slice(0, LIMIT);
    const hidden  = records.length - visible.length;
    const moreBtn = hidden > 0
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

function toggleHomeHistory() {
  homeShowAll = !homeShowAll;
  renderHome();
}

function runningHTML(val) {
  if (val === undefined) return '';
  const rounded = Math.round(val);
  if (rounded === 0) return `<div class="record-running zero">±0</div>`;
  if (rounded > 0)   return `<div class="record-running pos">詹欠 +${rounded}</div>`;
  return `<div class="record-running neg">胡欠 ${rounded}</div>`;
}

const CATEGORY_STYLE = {
  '餐飲': 'background:#fef3c7;color:#92400e',
  '交通': 'background:#dbeafe;color:#1e40af',
  '購物': 'background:#ede9fe;color:#5b21b6',
  '娛樂': 'background:#fce7f3;color:#9d174d',
  '生活': 'background:#d1fae5;color:#065f46',
  '其他': 'background:#f3f4f6;color:#4b5563',
};
const CATEGORY_KEYWORDS = {
  '餐飲': ['餐','飯','食','吃','喝','咖啡','飲料','早餐','午餐','晚餐','宵夜','麵','粥','鍋','燒烤','火鍋','茶','奶茶','甜點','蛋糕','麵包','便當','小吃','拉麵','壽司','漢堡','pizza','咖哩','炒飯','湯','果汁','牛奶','豆漿','河粉','牛排','炸雞','滷肉','燙','沙拉','三明治','點心'],
  '交通': ['車','捷運','公車','計程車','uber','taxi','高鐵','火車','飛機','機票','油費','加油','停車','過路費','腳踏車','機車','租車','轉運','船','渡輪'],
  '購物': ['購物','超市','賣場','百貨','costco','全聯','家樂福','衣服','鞋','包','3c','電器','書','文具','玩具','禮物','藥','藥妝','化妝','保養','日用','雜貨','家用','清潔用'],
  '娛樂': ['電影','ktv','唱歌','遊樂','門票','展覽','表演','音樂會','景點','遊樂園','遊戲','娛樂','酒吧','live','演唱會'],
  '生活': ['水費','電費','瓦斯','房租','房貸','管理費','清潔','打掃','衛生紙','洗衣','家具','沙發','床','燈','鎖','網路','電話費','保險','醫療','看診','健身','剪髮','美容'],
};
function guessCategoryFromItem(item) {
  if (!item) return '';
  const s = item.toLowerCase();
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (kws.some(k => s.includes(k.toLowerCase()))) return cat;
  }
  return '';
}
function categoryBadgeHTML(cat) {
  if (!cat) return '';
  const st = CATEGORY_STYLE[cat] || 'background:#f3f4f6;color:#4b5563';
  return `<span style="${st};font-size:10px;font-weight:600;padding:1px 7px;border-radius:99px;margin-left:4px;vertical-align:middle;white-space:nowrap">${esc(cat)}</span>`;
}

function dailyRecordHTML(r, runBal) {
  const isHu = r.paidBy === '胡';
  const a = parseFloat(r.amount) || 0;
  const voidBtn = r._voided ? '' :
    `<button class="record-delete" title="撤回" onclick='voidDailyRecord(${jq(r.id)})'>
      <svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
    </button>`;

  const clickAttr = r._voided ? '' : `onclick='openEditRecordById(${jq(r.id)},false)' style="cursor:pointer" title="點擊編輯"`;

  if (r.type === 'settlement') {
    return `<div class="record-item is-settlement${r._voided?' is-voided':''}">
      <div class="record-avatar settle">↕</div>
      <div class="record-info" ${clickAttr}>
        <div class="record-name">
          <span class="record-name-text">還款紀錄</span>
          <span class="badge ${r._voided?'badge-void':'badge-settle'}">${r._voided?'已撤回':'還款'}</span>
        </div>
        <div class="record-meta">${esc(r.date)}</div>
      </div>
      <div class="record-amount-wrap">
        <div class="record-amount" style="color:${r._voided?'#9ca3af':'#065f46'}">NT$${Math.round(a)}</div>
        ${runningHTML(runBal)}
      </div>
      ${voidBtn}
    </div>`;
  }

  const noteEl  = r.note ? `<div class="record-note">${esc(r.note)}</div>` : '';

  if (r.splitMode === '兩人付') {
    const hu   = parseFloat(r.paidHu)   || 0;
    const zhan = parseFloat(r.paidZhan) || 0;
    const metaDetail = `胡 NT$${Math.round(hu)} ＋ 詹 NT$${Math.round(zhan)}`;
    return `<div class="record-item${r._voided?' is-voided':''}">
      <div class="record-avatar split">兩</div>
      <div class="record-info" ${clickAttr}>
        <div class="record-name">
          <span class="record-name-text">${esc(r.item)}</span>
          <span class="badge${r._voided?' badge-void':''}">${r._voided?'已撤回':'各自出資'}</span>
          ${categoryBadgeHTML(r.category)}
        </div>
        <div class="record-meta">${esc(r.date)} · ${metaDetail}</div>
        ${noteEl}
      </div>
      <div class="record-amount-wrap">
        <div class="record-amount" style="${r._voided?'color:#9ca3af;text-decoration:line-through':''}">NT$${Math.round(a)}</div>
        ${runningHTML(runBal)}
      </div>
      ${voidBtn}
    </div>`;
  }

  const label   = r.splitMode === '均分' ? '各付一半' : r.splitMode === '只有胡' ? '胡全付' : '詹全付';
  return `<div class="record-item${r._voided?' is-voided':''}">
    <div class="record-avatar ${isHu?'me':'other'}">${esc(r.paidBy)}</div>
    <div class="record-info" ${clickAttr}>
      <div class="record-name">
        <span class="record-name-text">${esc(r.item)}</span>
        <span class="badge${r._voided?' badge-void':''}">${r._voided?'已撤回':label}</span>
        ${categoryBadgeHTML(r.category)}
      </div>
      <div class="record-meta">${esc(r.date)} · ${esc(r.paidBy)}付</div>
      ${noteEl}
    </div>
    <div class="record-amount-wrap">
      <div class="record-amount" style="${r._voided?'color:#9ca3af;text-decoration:line-through':''}">NT$${Math.round(a)}</div>
      ${runningHTML(runBal)}
    </div>
    ${voidBtn}
  </div>`;
}

// ── Trips list ────────────────────────────────────────────────────────────────
function renderTrips() {
  const trips = getTrips();
  const el = document.getElementById('trips-list');
  if (trips.length === 0) {
    el.innerHTML = emptyHTML('還沒有出遊行程', '點擊「新增行程」開始記帳吧');
    return;
  }
  const active = trips.filter(t => !t._closed);
  const closed = trips.filter(t => t._closed);
  let html = '';
  if (active.length > 0) {
    html += active.map(t => tripCardHTML(t)).join('');
  }
  if (closed.length > 0) {
    html += `<div class="section-label" style="margin:18px 0 8px;padding:0 4px;font-size:12px;font-weight:600;color:var(--text-muted);letter-spacing:.05em;text-transform:uppercase">已結束行程</div>`;
    html += closed.map(t => tripCardHTML(t)).join('');
  }
  el.innerHTML = html;
}

function tripCardHTML(t) {
  const deleteBtn = t._closed ? '' :
    `<button class="btn btn-ghost btn-icon btn-danger-ghost" title="刪除" onclick='event.stopPropagation();deleteTripAction(${jq(t.id)})'>
      <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
    </button>`;
  const closedBadge = t._closed ? `<span class="badge" style="background:var(--bg-tertiary);color:var(--text-muted);font-size:10px">已結束</span>` : '';
  return `<div class="trip-card${t._closed?' is-voided':''}" onclick='navigate("tripDetail",${jq(t.id)})'>
    <div class="trip-icon" style="${t._closed?'opacity:.45':''}"><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>
    <div class="trip-info">
      <div class="trip-name" style="${t._closed?'color:var(--text-muted)':''}"><span>${esc(t.name)}</span>${closedBadge}</div>
      <div class="trip-members">${esc(t.members.join('、'))}</div>
    </div>
    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
      ${deleteBtn}
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:var(--text-muted);flex-shrink:0"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
    </div>
  </div>`;
}

// ── Analysis ──────────────────────────────────────────────────────────────────
const CAT_PIE_COLORS = {
  '餐飲':'#f59e0b','交通':'#3b82f6','購物':'#8b5cf6',
  '娛樂':'#ec4899','生活':'#10b981','其他':'#9ca3af','未分類':'#cbd5e1'
};

function makePieChartSVG(slices, total) {
  const cx = 110, cy = 110, R = 90, ri = 55;
  const isDark = document.documentElement.classList.contains('dark');
  const bgCard = isDark ? '#1e2025' : '#ffffff';
  const textColor = isDark ? '#e4e8f0' : '#1a1d23';
  const mutedColor = isDark ? '#7a8196' : '#9098af';
  if (slices.length === 1) {
    return `<svg width="220" height="220" viewBox="0 0 220 220">
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="${slices[0].color}"/>
      <circle cx="${cx}" cy="${cy}" r="${ri}" fill="${bgCard}"/>
      <text x="${cx}" y="${cy-8}" text-anchor="middle" fill="${textColor}" font-size="16" font-weight="700">NT$${Math.round(total).toLocaleString()}</text>
      <text x="${cx}" y="${cy+12}" text-anchor="middle" fill="${mutedColor}" font-size="11">總支出</text>
    </svg>`;
  }
  let paths = [], a = -Math.PI / 2;
  for (const s of slices) {
    const da = (s.amount / total) * 2 * Math.PI;
    if (da < 0.005) { a += da; continue; }
    const ea = a + da, lg = da > Math.PI ? 1 : 0;
    const x1=cx+R*Math.cos(a), y1=cy+R*Math.sin(a);
    const x2=cx+R*Math.cos(ea), y2=cy+R*Math.sin(ea);
    const ix1=cx+ri*Math.cos(ea), iy1=cy+ri*Math.sin(ea);
    const ix2=cx+ri*Math.cos(a), iy2=cy+ri*Math.sin(a);
    paths.push(`<path d="M${x1},${y1} A${R},${R} 0 ${lg},1 ${x2},${y2} L${ix1},${iy1} A${ri},${ri} 0 ${lg},0 ${ix2},${iy2} Z" fill="${s.color}"/>`);
    a = ea;
  }
  return `<svg width="220" height="220" viewBox="0 0 220 220" style="filter:drop-shadow(0 4px 12px rgba(0,0,0,.12))">
    ${paths.join('')}
    <circle cx="${cx}" cy="${cy}" r="${ri}" fill="${bgCard}"/>
    <text x="${cx}" y="${cy-8}" text-anchor="middle" fill="${textColor}" font-size="16" font-weight="700">NT$${Math.round(total).toLocaleString()}</text>
    <text x="${cx}" y="${cy+12}" text-anchor="middle" fill="${mutedColor}" font-size="11">總支出</text>
  </svg>`;
}

function setAnalysisPeriod(p) { analysisPeriod = p; renderAnalysis(); }

function renderAnalysis() {
  const el = document.getElementById('analysis-content');
  if (!el) return;

  const now = new Date();
  const y = now.getFullYear(), mo = now.getMonth(), dy = now.getDate();
  const pad = n => String(n).padStart(2,'0');
  const toStr = `${y}-${pad(mo+1)}-${pad(dy)}`;
  let fromStr;
  if (analysisPeriod === 'week') {
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const mon = new Date(y, mo, dy - dow);
    fromStr = `${mon.getFullYear()}-${pad(mon.getMonth()+1)}-${pad(mon.getDate())}`;
  } else if (analysisPeriod === 'month') {
    fromStr = `${y}-${pad(mo+1)}-01`;
  } else {
    fromStr = `${y}-01-01`;
  }

  const periodLabel = analysisPeriod === 'week'  ? `${fromStr} ～ ${toStr}`
                    : analysisPeriod === 'month' ? `${y} 年 ${mo+1} 月`
                    :                              `${y} 年`;

  const records = getDailyRecords().filter(r =>
    !r._voided && r.type === 'daily' && r.date >= fromStr && r.date <= toStr
  );

  let total = 0, huTotal = 0, zhanTotal = 0;
  const catTotals = {};
  for (const r of records) {
    const a = parseFloat(r.amount) || 0;
    if (r.splitMode === '兩人付') {
      const hu = parseFloat(r.paidHu) || 0, zhan = parseFloat(r.paidZhan) || 0;
      huTotal += hu; zhanTotal += zhan; total += hu + zhan;
    } else {
      total += a;
      if (r.paidBy === '胡') huTotal += a; else if (r.paidBy === '詹') zhanTotal += a;
    }
    const cat = r.category || '未分類';
    catTotals[cat] = (catTotals[cat] || 0) + a;
  }

  const tabs = ['week','month','year'].map(p =>
    `<button onclick="setAnalysisPeriod('${p}')" style="flex:1;padding:9px;border-radius:10px;border:none;cursor:pointer;font-size:13px;font-weight:600;background:${analysisPeriod===p?'var(--primary)':'var(--bg-secondary)'};color:${analysisPeriod===p?'#fff':'var(--text-muted)'};transition:.15s">
      ${{week:'本週',month:'本月',year:'本年'}[p]}
    </button>`
  ).join('');

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
    .sort((a,b) => b[1]-a[1])
    .map(([cat,amt]) => ({ cat, amount:amt, color: CAT_PIE_COLORS[cat]||'#94a3b8' }));

  const legend = slices.map(s => {
    const pct = total > 0 ? Math.round(s.amount/total*100) : 0;
    return `<div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--border)">
      <div style="width:12px;height:12px;border-radius:3px;background:${s.color};flex-shrink:0"></div>
      <div style="flex:1;font-size:13px;font-weight:500;color:var(--text)">${esc(s.cat)}</div>
      <div style="font-size:12px;color:var(--text-muted);min-width:32px;text-align:right">${pct}%</div>
      <div style="font-size:14px;font-weight:600;color:var(--text);min-width:80px;text-align:right">NT$${Math.round(s.amount).toLocaleString()}</div>
    </div>`;
  }).join('');

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

// ── Trip detail ───────────────────────────────────────────────────────────────
function renderTripDetail() {
  const trip = getTripById(currentTripId);
  if (!trip) { navigate('trips'); return; }
  const expenses = getTripExpenses(currentTripId);
  _tripExpenseCache = expenses;

  document.getElementById('detail-name').textContent = trip.name;
  document.getElementById('detail-count').textContent = expenses.length + ' 筆';

  // Members chips
  renderDetailMemberChips(trip.members);

  // PaidBy select
  const sel = document.getElementById('d-paidby');
  const prev = sel.value;
  sel.innerHTML = trip.members.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
  if (trip.members.includes(prev)) sel.value = prev;

  // Split chips
  detailSplitAmong = detailSplitAmong.filter(m => trip.members.includes(m));
  if (detailSplitAmong.length === 0) detailSplitAmong = [...trip.members];
  renderSplitChips(trip.members);

  // Settlement
  renderSettlement(trip.members, expenses);

  // Archive bar + form visibility
  const archiveBar = document.getElementById('trip-archive-bar');
  const addCard = document.getElementById('add-expense-card');
  if (trip._closed) {
    archiveBar.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:0;gap:12px">
      <div style="display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:13px">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;flex-shrink:0"><path d="M20 6h-2.18c.07-.44.18-.88.18-1 0-2.21-1.79-4-4-4s-4 1.79-4 4c0 .12.11.56.18 1H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-3c1.1 0 2 .9 2 2 0 .12-.11.56-.18 1h-3.64C12.11 5.56 12 5.12 12 5c0-1.1.9-2 2-2zm0 10l-4-4 1.41-1.41L14 10.17l4.59-4.58L20 7l-6 6z"/></svg>
        此行程已結束，僅供瀏覽
      </div>
      <button class="btn btn-outline btn-sm" onclick='reopenTripAction(${jq(trip.id)})'>重新開啟</button>
    </div>`;
    addCard.style.display = 'none';
  } else {
    archiveBar.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:0">
      <button class="btn btn-ghost btn-sm" style="color:var(--text-muted);font-size:12px;gap:5px" onclick='closeTripAction(${jq(trip.id)})'>
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M20 6h-2.18c.07-.44.18-.88.18-1 0-2.21-1.79-4-4-4s-4 1.79-4 4c0 .12.11.56.18 1H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-3c1.1 0 2 .9 2 2 0 .12-.11.56-.18 1h-3.64C12.11 5.56 12 5.12 12 5c0-1.1.9-2 2-2zm0 10l-4-4 1.41-1.41L14 10.17l4.59-4.58L20 7l-6 6z"/></svg>
        結束行程
      </button>
    </div>`;
    addCard.style.display = '';
  }

  // Expense list
  const expEl = document.getElementById('detail-expenses');
  if (expenses.length === 0) {
    expEl.innerHTML = emptyHTML('還沒有消費紀錄', '');
  } else {
    expEl.innerHTML = expenses.map(e => tripExpenseHTML(e, trip.members.length)).join('');
  }
}

function renderDetailMemberChips(members) {
  const el = document.getElementById('detail-member-chips');
  el.innerHTML = members.map(m => {
    const removeBtn = members.length > 2
      ? `<button class="member-chip-remove" title="移除" onclick="removeMemberAction(${jqAttr(m)})">
           <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
         </button>`
      : '';
    return `<span class="member-chip">${esc(m)}${removeBtn}</span>`;
  }).join('');
}

function renderSplitChips(members) {
  const el = document.getElementById('d-split-chips');
  el.innerHTML = members.map(m => {
    const active = detailSplitAmong.includes(m);
    return `<button class="split-chip ${active?'active':''}" onclick="toggleSplit(${jqAttr(m)})">${esc(m)}</button>`;
  }).join('');
  updatePerPerson();
}

function renderSettlement(members, expenses) {
  const bar  = document.getElementById('settlement-bar');
  const body = document.getElementById('settlement-body');

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

  const settlements = computeSettlements(members, expenses);
  const total = expenses.reduce((s,e) => s + e.amount, 0);

  if (settlements.length === 0) {
    bar.className = 'balance-bar';
    body.innerHTML = `<div class="balance-content">
      <div class="balance-icon" style="background:#eff6ff">
        <svg viewBox="0 0 24 24" style="fill:#3b82f6"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
      </div>
      <div>
        <div class="balance-label">目前結算</div>
        <div style="font-size:22px;font-weight:700">帳目已清</div>
        <div class="balance-sub">共 ${expenses.length} 筆 · NT$${Math.round(total)}</div>
      </div>
    </div>`;
    return;
  }

  bar.className = 'balance-bar';
  bar.style.background = '#f59e0b';
  body.innerHTML = `<div class="settlement-list">
    <div class="settlement-header">
      <span>誰要付給誰</span>
      <span style="font-size:11px">共 ${expenses.length} 筆 · NT$${Math.round(total)}</span>
    </div>
    ${settlements.map(s => `<div class="settlement-row">
      <span class="settlement-name">${esc(s.from)}</span>
      <span class="settlement-arrow">→</span>
      <span class="settlement-name">${esc(s.to)}</span>
      <span class="settlement-amount">NT$${Math.round(s.amount)}</span>
    </div>`).join('')}
  </div>`;
}

function tripExpenseHTML(e, totalMembers) {
  const label  = e.splitAmong.length === totalMembers ? '均分' : e.splitAmong.join('、');
  const noteEl = e.note ? `<div class="record-note">${esc(e.note)}</div>` : '';
  const voidBtn = e._voided ? '' :
    `<button class="record-delete" title="撤回" onclick='voidTripExpenseAction(${jq(e.id)})'>
      <svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
    </button>`;
  const clickAttr = e._voided ? '' : `onclick='openEditRecordById(${jq(e.id)},true)' style="cursor:pointer" title="點擊編輯"`;

  if (e.payers && Array.isArray(e.payers)) {
    const payerStr = e.payers.map(p => `${esc(p.name)} NT$${Math.round(p.amount)}`).join(' ＋ ');
    const perPerson = Math.round(e.amount / (e.splitAmong.length || 1));
    return `<div class="record-item${e._voided?' is-voided':''}">
      <div class="record-avatar multi">多</div>
      <div class="record-info" ${clickAttr}>
        <div class="record-name">
          <span class="record-name-text">${esc(e.item)}</span>
          <span class="badge${e._voided?' badge-void':''}">${e._voided?'已撤回':'多人出款'}</span>
          ${categoryBadgeHTML(e.category)}
        </div>
        <div class="record-meta">${esc(e.date)} · ${payerStr} · 每人 NT$${perPerson}</div>
        ${noteEl}
      </div>
      <div class="record-amount" style="${e._voided?'color:#9ca3af;text-decoration:line-through':''}">NT$${Math.round(e.amount)}</div>
      ${voidBtn}
    </div>`;
  }

  return `<div class="record-item${e._voided?' is-voided':''}">
    <div class="record-avatar me">${esc(e.paidBy.charAt(0))}</div>
    <div class="record-info" ${clickAttr}>
      <div class="record-name">
        <span class="record-name-text">${esc(e.item)}</span>
        <span class="badge${e._voided?' badge-void':''}">${e._voided?'已撤回':esc(label)}</span>
        ${categoryBadgeHTML(e.category)}
      </div>
      <div class="record-meta">${esc(e.date)} · ${esc(e.paidBy)}付 · 每人 NT$${Math.round(e.amount/(e.splitAmong.length||1))}</div>
      ${noteEl}
    </div>
    <div class="record-amount" style="${e._voided?'color:#9ca3af;text-decoration:line-through':''}">NT$${Math.round(e.amount)}</div>
    ${voidBtn}
  </div>`;
}

function emptyHTML(title, sub) {
  return `<div class="empty-state">
    <div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg></div>
    <div class="empty-title">${esc(title)}</div>
    ${sub ? `<div class="empty-sub">${esc(sub)}</div>` : ''}
  </div>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Form helpers
// ──────────────────────────────────────────────────────────────────────────────
function setHomePaidBy(val) {
  homePaidBy = val;
  ['胡','詹'].forEach(v => document.getElementById('pb-'+v).classList.toggle('active', v === val));
}

function setHomeSplitMode(val) {
  homeSplitMode = val;
  ['均分','只有胡','只有詹','兩人付'].forEach(v => document.getElementById('sm-'+v).classList.toggle('active', v === val));
  const isBoth = val === '兩人付';
  document.getElementById('h-amount-group').style.display = isBoth ? 'none' : '';
  document.getElementById('h-both-group').style.display   = isBoth ? '' : 'none';
  document.getElementById('h-paidby-group').style.display = isBoth ? 'none' : '';
}

function toggleCollapsible(id, iconId) {
  const el = document.getElementById(id);
  const open = el.classList.toggle('open');
  document.getElementById(iconId).innerHTML = open
    ? '<path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>'
    : '<path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>';
}

// ── Multi-pay (trip) ──────────────────────────────────────────────────────────
let detailMultiPay = false;

function toggleMultiPay() {
  detailMultiPay = !detailMultiPay;
  document.getElementById('d-paidby-group').style.display = detailMultiPay ? 'none' : '';
  document.getElementById('d-amount-group').style.display = detailMultiPay ? 'none' : '';
  document.getElementById('d-multipay-group').style.display = detailMultiPay ? '' : 'none';
  document.getElementById('d-multipay-toggle').textContent = detailMultiPay ? '單人付款' : '多人出款';
  if (detailMultiPay) {
    document.getElementById('d-payers-list').innerHTML = '';
    const trip = getTripById(currentTripId);
    const members = trip ? trip.members : [];
    addPayerRow(members);
    addPayerRow(members);
  }
  updatePerPerson();
}

function addPayerRow(membersOverride) {
  const trip = getTripById(currentTripId);
  const members = membersOverride || (trip ? trip.members : []);
  const list = document.getElementById('d-payers-list');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;align-items:center';
  row.innerHTML = `
    <select class="form-select payer-name" style="flex:1" onchange="updateMultiPayTotal()">
      ${members.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
    </select>
    <input type="number" class="form-input payer-amount" placeholder="金額" min="0" step="1"
      style="flex:1" oninput="updateMultiPayTotal()">
    <button type="button" onclick="this.parentNode.remove();updateMultiPayTotal()"
      style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;padding:0 4px">×</button>`;
  list.appendChild(row);
}

function updateMultiPayTotal() {
  const rows = document.querySelectorAll('#d-payers-list .payer-amount');
  const total = Array.from(rows).reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
  const el = document.getElementById('d-multipay-total');
  const n = detailSplitAmong.length || 1;
  if (total > 0) {
    el.textContent = `合計 NT$${Math.round(total)}，每人分 NT$${Math.round(total / n)}`;
  } else {
    el.textContent = '';
  }
}

function toggleSplit(name) {
  if (detailSplitAmong.includes(name)) {
    if (detailSplitAmong.length <= 1) return;
    detailSplitAmong = detailSplitAmong.filter(m => m !== name);
  } else {
    detailSplitAmong = [...detailSplitAmong, name];
  }
  const trip = getTripById(currentTripId);
  if (trip) renderSplitChips(trip.members);
}

function updatePerPerson() {
  if (detailMultiPay) { updateMultiPayTotal(); return; }
  const a = parseFloat(document.getElementById('d-amount').value) || 0;
  const note = document.getElementById('d-per-person');
  note.textContent = (a > 0 && detailSplitAmong.length > 0)
    ? '每人 NT$' + Math.round(a / detailSplitAmong.length)
    : '';
}

// ──────────────────────────────────────────────────────────────────────────────
// Actions — Daily
// ──────────────────────────────────────────────────────────────────────────────
async function recordSettlement() {
  const records = getDailyRecords();
  const balance = computeBalance(records);
  if (balance === 0) return;

  const debtor   = balance > 0 ? '詹' : '胡';
  const creditor = balance > 0 ? '胡' : '詹';
  const amount   = Math.round(Math.abs(balance));

  const ok = await showConfirm('記錄還款', `${debtor} 還給 ${creditor} NT$${amount}，記錄後餘額歸零。`);
  if (!ok) return;

  const row = { type:'settlement', action:'add', id:uid(), date:todayStr(), amount, paidBy:debtor };
  allRows.push(row); renderHome();
  try { await postRow(row); toast('已記錄還款！'); }
  catch { allRows.pop(); renderHome(); toast('記錄失敗，請再試一次'); }
}

async function submitDailyRecord() {
  const item = document.getElementById('h-item').value.trim();
  const note = document.getElementById('h-note').value.trim();
  if (!item) { toast('請填寫消費項目'); return; }

  let amount, paidBy, extraFields = {};
  if (homeSplitMode === '兩人付') {
    const hu   = parseFloat(document.getElementById('h-paidhu').value)   || 0;
    const zhan = parseFloat(document.getElementById('h-paidzhan').value) || 0;
    if (hu + zhan <= 0) { toast('請輸入各自出的金額'); return; }
    amount = hu + zhan;
    paidBy = '兩人';
    extraFields = { paidHu: hu, paidZhan: zhan };
  } else {
    amount = parseFloat(document.getElementById('h-amount').value);
    paidBy = homePaidBy;
    if (!amount || amount <= 0) { toast('請輸入有效金額'); return; }
  }

  const btn = document.getElementById('h-submit');
  btn.disabled = true; btn.textContent = '記帳中…';

  const row = { type:'daily', action:'add', id:uid(), date:todayStr(), item, amount,
                paidBy, splitMode:homeSplitMode, note, ...extraFields };
  allRows.push(row);
  renderHome();

  try {
    await postRow(row);
    toast('已記帳！');
  } catch {
    allRows.pop(); renderHome(); toast('記帳失敗，請再試一次');
  }

  document.getElementById('h-item').value = '';
  document.getElementById('h-amount').value = '';
  document.getElementById('h-paidhu').value = '';
  document.getElementById('h-paidzhan').value = '';
  document.getElementById('h-note').value = '';
  btn.disabled = false; btn.textContent = '記起來';
}

async function voidDailyRecord(id) {
  const r = _dailyRecordsCache.find(x => x.id === id);
  if (!r) return;
  const label = r.type === 'settlement' ? '還款' : (r.item || '消費');
  const amount = parseFloat(r.amount) || 0;
  const ok = await showConfirm('撤回這筆紀錄？', `「${label}」— NT$${Math.round(amount)} 將標記為撤回，帳面隨之更動，紀錄仍保留。`);
  if (!ok) return;
  const row = { type:'daily', action:'void', id };
  allRows.push(row); renderHome();
  try { await postRow(row); toast('已撤回'); }
  catch { allRows.pop(); renderHome(); toast('撤回失敗'); }
}

// ──────────────────────────────────────────────────────────────────────────────
// Actions — Trips
// ──────────────────────────────────────────────────────────────────────────────
function showCreateTripForm() {
  newTripMembers = [];
  document.getElementById('new-trip-name').value = '';
  document.getElementById('new-member-input').value = '';
  renderNewTripMemberChips();
  document.getElementById('create-trip-card').style.display = '';
  document.getElementById('new-trip-name').focus();
}
function hideCreateTripForm() {
  document.getElementById('create-trip-card').style.display = 'none';
  newTripMembers = [];
}

function addNewTripMember() {
  const input = document.getElementById('new-member-input');
  const name = input.value.trim();
  if (!name) return;
  if (newTripMembers.includes(name)) { toast(`「${name}」已在名單中`); return; }
  newTripMembers.push(name);
  input.value = ''; input.focus();
  renderNewTripMemberChips();
}
function removeNewTripMember(name) {
  newTripMembers = newTripMembers.filter(m => m !== name);
  renderNewTripMemberChips();
}
function renderNewTripMemberChips() {
  document.getElementById('new-trip-member-chips').innerHTML = newTripMembers.map(m =>
    `<span class="member-chip">${esc(m)}
      <button class="member-chip-remove" onclick="removeNewTripMember(${jqAttr(m)})">
        <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    </span>`
  ).join('');
}

async function createTrip() {
  const name = document.getElementById('new-trip-name').value.trim();
  if (!name)                    { toast('請填寫行程名稱'); return; }
  if (newTripMembers.length < 2) { toast('至少需要兩位成員'); return; }

  const btn = document.getElementById('create-trip-btn');
  btn.disabled = true; btn.textContent = '建立中…';

  const row = { type:'trip', action:'add', id:uid(), name, members:JSON.stringify(newTripMembers), createdAt:todayStr() };
  allRows.push(row);
  hideCreateTripForm();
  navigate('tripDetail', row.id);

  try { await postRow(row); toast(`「${name}」行程已建立`); }
  catch { allRows.pop(); toast('建立失敗，請再試一次'); }

  btn.disabled = false; btn.textContent = '建立行程';
}

async function deleteTripAction(id) {
  const trip = getTripById(id);
  if (!trip) return;
  const ok = await showConfirm(`刪除行程「${trip.name}」？`, '這個動作無法還原，所有消費紀錄也會一併刪除。');
  if (!ok) return;
  const row = { type:'trip', action:'delete', id };
  allRows.push(row); renderTrips();
  try { await postRow(row); toast('行程已刪除'); }
  catch { allRows.pop(); renderTrips(); toast('刪除失敗'); }
}

async function closeTripAction(id) {
  const trip = getTripById(id);
  if (!trip) return;
  const ok = await showConfirm(`結束行程「${trip.name}」？`, '結束後將無法新增消費，可隨時重新開啟。');
  if (!ok) return;
  const row = { type:'trip', action:'close', id };
  allRows.push(row); renderTripDetail();
  try { await postRow(row); toast('行程已結束'); }
  catch { allRows.pop(); renderTripDetail(); toast('操作失敗'); }
}

async function reopenTripAction(id) {
  const trip = getTripById(id);
  if (!trip) return;
  const row = { type:'trip', action:'reopen', id };
  allRows.push(row); renderTripDetail();
  try { await postRow(row); toast(`「${trip.name}」已重新開啟`); }
  catch { allRows.pop(); renderTripDetail(); toast('操作失敗'); }
}

// ──────────────────────────────────────────────────────────────────────────────
// Actions — Trip members
// ──────────────────────────────────────────────────────────────────────────────
async function addDetailMember() {
  const input = document.getElementById('detail-new-member');
  const name = input.value.trim();
  if (!name) return;
  const trip = getTripById(currentTripId);
  if (!trip) return;
  if (trip.members.includes(name)) { toast(`「${name}」已在名單中`); return; }
  const row = { type:'tripMember', action:'add', tripId:currentTripId, memberName:name };
  allRows.push(row); input.value = ''; renderTripDetail();
  try { await postRow(row); }
  catch { allRows.pop(); renderTripDetail(); toast('新增失敗'); }
}

async function removeMemberAction(name) {
  const trip = getTripById(currentTripId);
  if (!trip || trip.members.length <= 2) return;
  const ok = await showConfirm(`移除成員「${name}」？`, '相關的消費紀錄不會被刪除，但該成員將從行程中移除。');
  if (!ok) return;
  const row = { type:'tripMember', action:'remove', tripId:currentTripId, memberName:name };
  allRows.push(row);
  detailSplitAmong = detailSplitAmong.filter(m => m !== name);
  renderTripDetail();
  try { await postRow(row); }
  catch { allRows.pop(); renderTripDetail(); toast('移除失敗'); }
}

// ──────────────────────────────────────────────────────────────────────────────
// Actions — Trip expenses
// ──────────────────────────────────────────────────────────────────────────────
async function submitTripExpense() {
  const item = document.getElementById('d-item').value.trim();
  const note = document.getElementById('d-note').value.trim();
  if (!item)                         { toast('請填寫消費項目'); return; }
  if (detailSplitAmong.length === 0) { toast('請選擇分攤成員'); return; }

  let amount, paidBy, extraFields = {};
  if (detailMultiPay) {
    const nameEls   = document.querySelectorAll('#d-payers-list .payer-name');
    const amountEls = document.querySelectorAll('#d-payers-list .payer-amount');
    const payers = Array.from(nameEls).map((sel, i) => ({
      name: sel.value, amount: parseFloat(amountEls[i].value) || 0
    })).filter(p => p.amount > 0);
    if (payers.length === 0) { toast('請輸入各自出的金額'); return; }
    amount = payers.reduce((s, p) => s + p.amount, 0);
    paidBy = '多人';
    extraFields = { payers };
  } else {
    amount = parseFloat(document.getElementById('d-amount').value);
    paidBy = document.getElementById('d-paidby').value;
    if (!amount || amount <= 0) { toast('請輸入有效金額'); return; }
    if (!paidBy)                { toast('請選擇付款人'); return; }
  }

  const btn = document.getElementById('d-submit');
  btn.disabled = true; btn.textContent = '記帳中…';

  const row = {
    type:'tripExpense', action:'add', id:uid(), tripId:currentTripId,
    item, amount, paidBy, splitAmong:JSON.stringify(detailSplitAmong),
    date:todayStr(), note, ...extraFields
  };
  allRows.push(row); renderTripDetail();

  try { await postRow(row); toast('已記帳！'); }
  catch { allRows.pop(); renderTripDetail(); toast('記帳失敗，請再試一次'); }

  document.getElementById('d-item').value = '';
  document.getElementById('d-amount').value = '';
  document.getElementById('d-note').value = '';
  if (detailMultiPay) document.querySelectorAll('#d-payers-list .payer-amount').forEach(el => el.value = '');
  btn.disabled = false; btn.textContent = '記起來';
}

async function voidTripExpenseAction(id) {
  const r = _tripExpenseCache.find(x => x.id === id);
  if (!r) return;
  const item = r.item || '消費';
  const amount = parseFloat(r.amount) || 0;
  const ok = await showConfirm('撤回這筆紀錄？', `「${item}」— NT$${Math.round(amount)} 將標記為撤回，分帳隨之更動，紀錄仍保留。`);
  if (!ok) return;
  const row = { type:'tripExpense', action:'void', id };
  allRows.push(row); renderTripDetail();
  try { await postRow(row); toast('已撤回'); }
  catch { allRows.pop(); renderTripDetail(); toast('撤回失敗'); }
}

// ──────────────────────────────────────────────────────────────────────────────
// Auto-polling & bootstrap
// ──────────────────────────────────────────────────────────────────────────────
const POLL_MS = 30_000; // poll every 30 s
let _pollTimer = null;

function rowSignature() {
  return allRows.length + '|' + (allRows[allRows.length - 1]?.id ?? '');
}

async function pollForChanges() {
  if (document.hidden) return schedulePoll();
  const before = rowSignature();
  try { await loadData(); } catch {}
  if (rowSignature() !== before) {
    render();
    showUpdateBadge();
  }
  schedulePoll();
}

function schedulePoll() {
  clearTimeout(_pollTimer);
  _pollTimer = setTimeout(pollForChanges, POLL_MS);
}

function showUpdateBadge() {
  const el = document.getElementById('update-badge');
  if (!el) return;
  el.style.display = 'flex';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

(async function init() {
  // 0. Sync theme icon with current theme (set by early-init script)
  updateThemeIcon();
  // 1. Load cache instantly — user sees their data with zero wait
  loadCache();
  render();
  // 2. Fetch fresh data from GAS in background
  setSyncing(true);
  await loadData();
  setSyncing(false);
  render();
  // 3. Start background polling
  schedulePoll();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { clearTimeout(_pollTimer); pollForChanges(); }
    else clearTimeout(_pollTimer);
  });
})();

// ──────────────────────────────────────────────────────────────────────────────
// Dark mode
// ──────────────────────────────────────────────────────────────────────────────
function updateThemeIcon() {
  const dark = document.documentElement.classList.contains('dark');
  document.getElementById('theme-icon').innerHTML = dark
    ? '<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>'  // sun
    : '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>'; // moon
}

function toggleTheme() {
  const dark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', dark ? 'dark' : 'light');
  updateThemeIcon();
}

// ──────────────────────────────────────────────────────────────────────────────
// Edit record dialog
// ──────────────────────────────────────────────────────────────────────────────
let _editRecord = null;

function openEditRecord(r) {
  if (r._voided) return;
  _editRecord = r;
  document.getElementById('edit-date').value = r.date || todayStr();
  document.getElementById('edit-note').value = r.note || '';
  document.getElementById('edit-category').value = r.category || guessCategoryFromItem(r.item) || '';
  document.getElementById('edit-overlay').classList.add('open');
}

function openEditRecordById(id, isTripExpense) {
  const r = isTripExpense
    ? _tripExpenseCache.find(x => x.id === id)
    : _dailyRecordsCache.find(x => x.id === id);
  if (!r) return;
  openEditRecord(r);
}

function closeEditRecord() {
  document.getElementById('edit-overlay').classList.remove('open');
  _editRecord = null;
}

async function submitEditRecord() {
  if (!_editRecord) return;
  const date = document.getElementById('edit-date').value;
  const note = document.getElementById('edit-note').value.trim();
  if (!date) { toast('請選擇日期'); return; }

  const isTrip = _editRecord.type === 'tripExpense';
  const doRender = () => isTrip ? renderTripDetail() : renderHome();

  const category = document.getElementById('edit-category').value;
  const row = { type: _editRecord.type, action: 'edit', id: _editRecord.id, date, note, category };
  allRows.push(row); doRender();
  closeEditRecord();
  try { await postRow(row); toast('已更新'); }
  catch { allRows.pop(); doRender(); toast('更新失敗'); }
}

function setSyncing(on) {
  let el = document.getElementById('sync-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sync-indicator';
    el.style.cssText = 'position:fixed;top:10px;right:10px;z-index:500;' +
      'background:rgba(0,0,0,.65);color:#fff;border-radius:8px;' +
      'padding:4px 10px;font-size:11px;display:flex;align-items:center;gap:6px;';
    el.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px"></span>同步中…';
    document.body.appendChild(el);
  }
  el.style.display = on ? 'flex' : 'none';
}
