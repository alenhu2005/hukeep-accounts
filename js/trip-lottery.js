import { appState } from './state.js';
import { getTripById, getAvatarUrlByMemberName, getMemberColor, isHiddenMemberColorId, getHiddenMemberStyleKey } from './data.js';
import { esc, jq, prefersReducedMotion, randomUniformIndex, toast, memberToneClass, memberToneVars } from './utils.js';

const STORAGE_KEY = 'ledger_trip_lottery_v1';

/** @typedef {{ remaining: string[]; keep: boolean; sig: string; prevMembers?: string[] }} TripLotteryEntry */

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

function memberSig(members) {
  return [...members].sort().join('\u0001');
}

/**
 * @param {{ id: string, members: string[] }} trip
 * @returns {TripLotteryEntry}
 */
export function syncTripLotteryEntry(trip) {
  const sig = memberSig(trip.members);
  const all = readAll();
  let e = all[trip.id];
  if (!e || typeof e !== 'object') {
    e = { remaining: [...trip.members], keep: false, sig, prevMembers: [...trip.members] };
    all[trip.id] = e;
    writeAll(all);
    return e;
  }

  if (e.sig !== sig) {
    const oldMembers = Array.isArray(e.prevMembers) ? e.prevMembers : [];
    const oldSet = new Set(oldMembers);
    const newSet = new Set(trip.members);
    let rem = Array.isArray(e.remaining) ? [...e.remaining] : [...trip.members];
    rem = rem.filter(m => {
      if (newSet.has(m)) return true;
      if (!oldSet.has(m)) return true;
      return false;
    });
    for (const m of trip.members) {
      if (!rem.includes(m)) rem.push(m);
    }
    if (rem.length === 0) rem = [...trip.members];
    e = { remaining: rem, keep: !!e.keep, sig, prevMembers: [...trip.members] };
  } else {
    e.remaining = Array.isArray(e.remaining) ? e.remaining : [...trip.members];
    e.keep = !!e.keep;
    e.sig = sig;
    e.prevMembers = [...trip.members];
  }
  all[trip.id] = e;
  writeAll(all);
  return e;
}

function persistEntry(tripId, entry) {
  const all = readAll();
  all[tripId] = entry;
  writeAll(all);
}

let lotteryAnimating = false;
/** @type {((e: MouseEvent) => void) | null} */
let lotteryOutsideCloser = null;
/** @type {number} */
let drawAnimGen = 0;

function lotteryAvatarHtml(name) {
  const url = getAvatarUrlByMemberName(name, 'trip');
  const color = getMemberColor(name);
  const rare = isHiddenMemberColorId(color.id);
  const sk = rare ? getHiddenMemberStyleKey(color.id) : '';
  const styleCls = sk ? ` member-rare--${sk}` : '';
  const rareCls = rare ? ` trip-lottery-avatar--rare${styleCls}` : '';
  const toneCls = memberToneClass(rare);
  const tv = memberToneVars(color, rare);
  if (url) {
    return `<span class="trip-lottery-avatar${rareCls}${toneCls}"${tv ? ` style="${tv}"` : ''} aria-hidden="true"><img class="trip-lottery-avatar-img${rare ? ' trip-lottery-avatar-img--rare' : ''}" src="${url}" alt=""></span>`;
  }
  const ch = esc(String(name || '').trim().charAt(0) || '？');
  const fbStyle = tv ? `background:${color.bg};color:${color.fg};${tv}` : `background:${color.bg};color:${color.fg}`;
  return `<span class="trip-lottery-avatar trip-lottery-avatar--fallback${rareCls}${rare ? ` trip-lottery-avatar-fallback--rare${styleCls}` : ''}${toneCls}" style="${fbStyle}" aria-hidden="true">${ch}</span>`;
}

function lotteryResultHtml(name) {
  return `<span class="trip-lottery-result-avatar-only">${lotteryAvatarHtml(name)}</span>`;
}

/**
 * @param {TripLotteryEntry} entry
 * @param {{ id: string, members: string[] }} trip
 */
function poolManageHtml(entry, trip) {
  const names = entry.remaining;
  const tags =
    names.length > 0
      ? names
          .map(
            n => `
        <span class="trip-lottery-pool-tag">
          ${lotteryAvatarHtml(n)}
          ${esc(n)}
          <button type="button" class="trip-lottery-pool-remove" aria-label="從籤筒移除 ${esc(n)}" onclick="removeFromTripLotteryPool(${jq(n)})">×</button>
        </span>`,
          )
          .join('')
      : '<span class="trip-lottery-pool-tags--empty">籤筒為空，請加入名稱</span>';

  const available = trip.members.filter(m => !entry.remaining.includes(m));
  const selectOpts =
    available.length > 0
      ? `<option value="">加入行程成員…</option>${available.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}`
      : `<option value="">${trip.members.length ? '（行程成員皆已在籤筒）' : '（尚無行程成員，請用下方輸入）'}</option>`;

  return `
    <div class="trip-lottery-pool-tags">${tags}</div>
    <p class="trip-lottery-pool-hint">可加入非行程成員（例如臨時參加）。</p>
    <div class="trip-lottery-pool-add">
      <input type="text" id="trip-lottery-add-input" class="trip-lottery-add-input" placeholder="輸入名稱加入籤筒" maxlength="40" autocomplete="off"
        onkeydown="if(event.key==='Enter'){event.preventDefault();addToTripLotteryPoolFromInput();}" />
      <button type="button" class="btn btn-outline btn-sm" onclick="addToTripLotteryPoolFromInput()">加入</button>
    </div>
    <div class="trip-lottery-pool-add">
      <select id="trip-lottery-add-select" class="trip-lottery-add-select">${selectOpts}</select>
      <button type="button" class="btn btn-outline btn-sm" onclick="addToTripLotteryPoolFromSelect()">加入</button>
    </div>`;
}

export function removeFromTripLotteryPool(name) {
  const trip = getTripById(appState.currentTripId);
  if (!trip) return;
  const entry = syncTripLotteryEntry(trip);
  entry.remaining = entry.remaining.filter(m => m !== name);
  persistEntry(trip.id, entry);
  refreshPoolUI();
}

export function addToTripLotteryPoolFromInput() {
  const trip = getTripById(appState.currentTripId);
  if (!trip) return;
  const inp = document.getElementById('trip-lottery-add-input');
  const raw = (inp?.value || '').trim();
  if (!raw) return;
  const entry = syncTripLotteryEntry(trip);
  if (entry.remaining.includes(raw)) return;
  entry.remaining.push(raw);
  persistEntry(trip.id, entry);
  inp.value = '';
  refreshPoolUI();
}

export function addToTripLotteryPoolFromSelect() {
  const trip = getTripById(appState.currentTripId);
  if (!trip) return;
  const sel = document.getElementById('trip-lottery-add-select');
  const raw = (sel?.value || '').trim();
  if (!raw) return;
  const entry = syncTripLotteryEntry(trip);
  if (entry.remaining.includes(raw)) return;
  entry.remaining.push(raw);
  persistEntry(trip.id, entry);
  if (sel) sel.value = '';
  refreshPoolUI();
}

function refreshPoolUI() {
  const trip = getTripById(appState.currentTripId);
  if (!trip) return;
  const entry = syncTripLotteryEntry(trip);
  const poolEl = document.getElementById('trip-lottery-pool');
  if (poolEl) poolEl.innerHTML = poolManageHtml(entry, trip);
}

function setIdleResultDisplay() {
  const displayEl = document.getElementById('trip-lottery-display');
  const lineEl = document.getElementById('trip-lottery-result-line');
  if (displayEl && lineEl) {
    displayEl.classList.remove('trip-lottery-display--spinning', 'trip-lottery-display--reveal');
    lineEl.textContent = '—';
  }
}

export function closeTripLotteryPanel() {
  const pop = document.getElementById('trip-lottery-popover');
  const trig = document.getElementById('trip-lottery-trigger');
  const wasAnimating = lotteryAnimating;
  lotteryAnimating = false;
  drawAnimGen++;
  if (wasAnimating) {
    const btn = document.getElementById('trip-lottery-btn');
    if (btn) btn.disabled = false;
    setIdleResultDisplay();
  }
  if (lotteryOutsideCloser) {
    document.removeEventListener('mousedown', lotteryOutsideCloser, true);
    lotteryOutsideCloser = null;
  }
  if (pop) pop.hidden = true;
  trig?.setAttribute('aria-expanded', 'false');
}

export function toggleTripLotteryPanel(ev) {
  ev?.stopPropagation?.();
  const pop = document.getElementById('trip-lottery-popover');
  const trig = document.getElementById('trip-lottery-trigger');
  if (!pop || trig?.style.display === 'none') return;

  if (!pop.hidden) {
    closeTripLotteryPanel();
    return;
  }

  pop.hidden = false;
  trig?.setAttribute('aria-expanded', 'true');

  window.setTimeout(() => {
    lotteryOutsideCloser = e => {
      const t = e.target;
      if (pop.contains(t) || t === trig || trig?.contains(t)) return;
      closeTripLotteryPanel();
    };
    document.addEventListener('mousedown', lotteryOutsideCloser, true);
  }, 0);
}

/**
 * @param {{ id: string, members: string[] } | null} trip
 */
export function renderTripLotteryCard(trip) {
  const pop = document.getElementById('trip-lottery-popover');
  const trigger = document.getElementById('trip-lottery-trigger');
  if (!pop || !trigger) return;

  lotteryAnimating = false;
  drawAnimGen++;
  closeTripLotteryPanel();

  if (!trip) {
    pop.innerHTML = '';
    trigger.style.display = 'none';
    return;
  }

  trigger.style.display = '';

  const entry = syncTripLotteryEntry(trip);
  const keepId = 'trip-lottery-keep';

  pop.innerHTML = `
    <div class="trip-lottery-popover-inner">
      <div class="trip-lottery-popover-title">抽籤</div>
      <div id="trip-lottery-display" class="trip-lottery-display trip-lottery-display--popover" aria-live="polite" aria-atomic="true">
        <span id="trip-lottery-result-line">—</span>
      </div>
      <p class="trip-lottery-hint trip-lottery-hint--popover">按「開始抽籤」隨機抽出一人。</p>
      <div class="trip-lottery-pool-wrap">
        <span class="trip-lottery-pool-label">籤筒</span>
        <div id="trip-lottery-pool" class="trip-lottery-pool trip-lottery-pool--manage">${poolManageHtml(entry, trip)}</div>
      </div>
      <label class="trip-lottery-keep">
        <input type="checkbox" id="${keepId}" ${entry.keep ? 'checked' : ''} onchange="setTripLotteryKeepInPool(this.checked)">
        <span>抽中後仍留在籤筒</span>
      </label>
      <div class="trip-lottery-actions">
        <button type="button" class="btn btn-primary btn-sm" id="trip-lottery-btn" onclick="startTripLotteryDraw()">開始抽籤</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="resetTripLotteryPool()">重置籤筒</button>
      </div>
    </div>`;
}

/**
 * @param {string} finalPick
 * @param {() => void} onDone
 */
function runSimpleDrawReveal(finalPick, onDone) {
  drawAnimGen++;
  const gen = drawAnimGen;
  const displayEl = document.getElementById('trip-lottery-display');
  const lineEl = document.getElementById('trip-lottery-result-line');
  if (!displayEl || !lineEl) {
    onDone();
    return;
  }

  displayEl.classList.remove('trip-lottery-display--reveal');
  displayEl.classList.add('trip-lottery-display--spinning');
  lineEl.textContent = '洗牌中…';

  const duration = prefersReducedMotion() ? 0 : 520 + Math.floor(Math.random() * 380);

  window.setTimeout(() => {
    if (gen !== drawAnimGen) return;
    displayEl.classList.remove('trip-lottery-display--spinning');
    lineEl.innerHTML = lotteryResultHtml(finalPick);
    displayEl.classList.add('trip-lottery-display--reveal');
    displayEl.setAttribute('aria-label', `抽中 ${finalPick}`);
    onDone();
  }, duration);
}

/**
 * @param {{ id: string, members: string[] }} trip
 * @param {TripLotteryEntry} entry
 * @param {string} finalPick
 * @param {HTMLButtonElement | null} btn
 */
function finishDraw(trip, entry, finalPick, btn) {
  if (!entry.keep) {
    const i = entry.remaining.indexOf(finalPick);
    if (i >= 0) entry.remaining.splice(i, 1);
    if (entry.remaining.length === 0) entry.remaining = [...trip.members];
  }
  persistEntry(trip.id, entry);

  const poolEl = document.getElementById('trip-lottery-pool');
  if (poolEl) poolEl.innerHTML = poolManageHtml(entry, trip);

  lotteryAnimating = false;
  if (btn) btn.disabled = false;
}

export function startTripLotteryDraw() {
  const trip = getTripById(appState.currentTripId);
  if (!trip || lotteryAnimating) return;

  const entry = syncTripLotteryEntry(trip);
  const raw = entry.remaining.length ? [...entry.remaining] : [];
  const pool = [...new Set(raw)];
  if (pool.length === 0) {
    toast('請先在籤筒加入至少一人');
    return;
  }

  const finalPick = pool[randomUniformIndex(pool.length)];
  const btn = document.getElementById('trip-lottery-btn');

  lotteryAnimating = true;
  if (btn) btn.disabled = true;

  runSimpleDrawReveal(finalPick, () => {
    if (!lotteryAnimating) return;
    finishDraw(trip, entry, finalPick, btn);
  });
}

export function setTripLotteryKeepInPool(keep) {
  const trip = getTripById(appState.currentTripId);
  if (!trip) return;
  const entry = syncTripLotteryEntry(trip);
  entry.keep = !!keep;
  persistEntry(trip.id, entry);
}

export function resetTripLotteryPool() {
  const trip = getTripById(appState.currentTripId);
  if (!trip) return;
  lotteryAnimating = false;
  drawAnimGen++;
  const entry = syncTripLotteryEntry(trip);
  entry.remaining = [...trip.members];
  persistEntry(trip.id, entry);
  setIdleResultDisplay();
  const poolEl = document.getElementById('trip-lottery-pool');
  if (poolEl) poolEl.innerHTML = poolManageHtml(entry, trip);
  const btn = document.getElementById('trip-lottery-btn');
  if (btn) btn.disabled = false;
}
