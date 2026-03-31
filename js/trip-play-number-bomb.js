import { getTripById, getAvatarUrlByMemberName, getMemberColor, isHiddenMemberColorId, getHiddenMemberStyleKey } from './data.js';
import { closeTripLotteryPanel } from './trip-lottery.js';
import { appState } from './state.js';
import { esc, memberToneClass, memberToneVars, randomUniformIndex, toast } from './utils.js';

// 無可見入口：抽籤浮層開啟時，對標題「抽籤」連點或長按。
let _nbombLotteryTapCount = 0;
let _nbombLotteryTapAt = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let _nbombLotteryPressTimer = null;

const NBOMB_SECRET_TAP_WINDOW_MS = 3800;
const NBOMB_SECRET_TAP_NEED = 8;
const NBOMB_SECRET_PRESS_MS = 2600;

/** 觸控後短暫忽略 click，避免 iOS 重複計次。 */
let _nbombSuppressClickUntil = 0;

function openNbombFromLotterySecret() {
  _nbombLotteryTapCount = 0;
  closeTripLotteryPanel();
  openTripNumberBomb();
}

/**
 * @param {number} low open interval left
 * @param {number} high open interval right
 * @param {number} bomb
 * @param {number} g guess
 * @returns {{ type: 'invalid' } | { type: 'boom' } | { type: 'low'; low: number; high: number } | { type: 'high'; low: number; high: number }}
 */
export function applyGuess(low, high, bomb, g) {
  const gi = Math.floor(Number(g));
  if (!Number.isFinite(gi)) return { type: 'invalid' };
  if (gi <= low || gi >= high) return { type: 'invalid' };
  if (gi === bomb) return { type: 'boom' };
  if (gi < bomb) return { type: 'low', low: gi, high };
  return { type: 'high', low, high: gi };
}

/** @typedef {'setup' | 'playing' | 'ended'} NbPhase */
/** @typedef {'low' | 'high' | 'boom' | 'invalid'} NbResult */

/**
 * @typedef {{
 *   phase: NbPhase;
 *   membersSnapshot: string[];
 *   low: number;
 *   high: number;
 *   bomb: number | null;
 *   turnIndex: number;
 *   history: { name: string; guess: number | null; result: NbResult }[];
 *   min: number;
 *   max: number;
 *   bombMode: 'random' | 'host';
 *   loserName: string;
 * }} NbState
 */

/** @type {NbState} */
let state = {
  phase: 'setup',
  membersSnapshot: [],
  low: 0,
  high: 101,
  bomb: null,
  turnIndex: 0,
  history: [],
  min: 1,
  max: 100,
  bombMode: 'random',
  loserName: '',
};

/** @type {{ id: string; members: string[] } | null} */
let tripRef = null;

const OVERLAY_ID = 'trip-number-bomb-overlay';

function overlayEl() {
  return document.getElementById(OVERLAY_ID);
}

function nbombAvatarHtml(name) {
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

function legalLow() {
  return state.low + 1;
}

function legalHigh() {
  return state.high - 1;
}

function historyLabel(r) {
  if (r.result === 'invalid') return '範圍外';
  if (r.result === 'boom') return '爆炸';
  if (r.result === 'low') return '太小';
  if (r.result === 'high') return '太大';
  return '';
}

function renderHistory() {
  if (state.history.length === 0) return '<p class="trip-number-bomb-hint">尚無紀錄</p>';
  const rows = [...state.history]
    .reverse()
    .slice(0, 12)
    .map(
      h =>
        `<li class="trip-number-bomb-history-item"><span class="trip-number-bomb-history-name">${esc(h.name)}</span>` +
        `<span class="trip-number-bomb-history-guess">${h.guess == null ? '—' : esc(String(h.guess))}</span>` +
        `<span class="trip-number-bomb-history-res">${historyLabel(h)}</span></li>`,
    )
    .join('');
  return `<ul class="trip-number-bomb-history" aria-label="猜測紀錄">${rows}</ul>`;
}

function renderSetup() {
  const members =
    state.membersSnapshot.length > 0 ? state.membersSnapshot : (tripRef?.members ?? []);
  const memberList =
    members.length === 0
      ? '<p class="trip-number-bomb-warn">請先新增行程成員。</p>'
      : `<ul class="trip-number-bomb-members">${members.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`;

  const preset100 = state.min === 1 && state.max === 100 ? 'selected' : '';
  const preset50 = state.min === 1 && state.max === 50 ? 'selected' : '';
  const presetCustom = !(state.min === 1 && (state.max === 100 || state.max === 50)) ? 'selected' : '';
  const showCustom = presetCustom === 'selected';

  const modeRandom = state.bombMode === 'random' ? 'selected' : '';
  const modeHost = state.bombMode === 'host' ? 'selected' : '';
  const showHost = state.bombMode === 'host';

  return `
    <div class="trip-number-bomb-inner">
      <div class="trip-number-bomb-top">
        <h2 class="trip-number-bomb-title">數字炸彈</h2>
        <button type="button" class="btn btn-outline btn-sm trip-number-bomb-close" onclick="closeNumberBombGame()">關閉</button>
      </div>
      <section class="trip-number-bomb-section">
        <div class="form-label">參與者（開局時固定名單）</div>
        ${memberList}
      </section>
      <section class="trip-number-bomb-section">
        <label class="form-label" for="nbomb-range-preset">數字範圍</label>
        <select id="nbomb-range-preset" class="form-input trip-number-bomb-select" onchange="nbombSyncSetupPanels()">
          <option value="100" ${preset100}>1 – 100</option>
          <option value="50" ${preset50}>1 – 50</option>
          <option value="custom" ${presetCustom}>自訂</option>
        </select>
        <div id="nbomb-custom-range" class="trip-number-bomb-custom-range" style="display:${showCustom ? 'flex' : 'none'}">
          <input type="number" id="nbomb-min" class="form-input" inputmode="numeric" placeholder="最小" value="${esc(String(state.min))}" aria-label="自訂最小值">
          <span class="trip-number-bomb-tilde">～</span>
          <input type="number" id="nbomb-max" class="form-input" inputmode="numeric" placeholder="最大" value="${esc(String(state.max))}" aria-label="自訂最大值">
        </div>
        <p class="trip-number-bomb-hint">須為整數，且最大 − 最小 &gt; 1。</p>
      </section>
      <section class="trip-number-bomb-section">
        <label class="form-label" for="nbomb-bomb-mode">炸彈</label>
        <select id="nbomb-bomb-mode" class="form-input trip-number-bomb-select" onchange="nbombSyncSetupPanels()">
          <option value="random" ${modeRandom}>系統隨機</option>
          <option value="host" ${modeHost}>主持人指定</option>
        </select>
        <div id="nbomb-host-bomb-wrap" style="display:${showHost ? 'block' : 'none'};margin-top:10px">
          <input type="number" id="nbomb-host-bomb" class="form-input" inputmode="numeric" placeholder="炸彈數字（勿讓其他人看到）" aria-label="主持人指定炸彈">
        </div>
      </section>
      <div class="trip-number-bomb-actions">
        <button type="button" class="btn btn-primary" onclick="nbombStart()" ${members.length === 0 ? 'disabled' : ''}>開始</button>
      </div>
    </div>`;
}

function renderPlaying() {
  const names = state.membersSnapshot;
  const n = names.length;
  const cur = n > 0 ? names[((state.turnIndex % n) + n) % n] : '';
  const lo = legalLow();
  const hi = legalHigh();
  const rangeText =
    lo === hi ? `只剩 <strong>${esc(String(lo))}</strong>！` : `請猜 <strong>${esc(String(lo))}</strong> 到 <strong>${esc(String(hi))}</strong> 之間的整數`;

  return `
    <div class="trip-number-bomb-inner">
      <div class="trip-number-bomb-top">
        <h2 class="trip-number-bomb-title">數字炸彈</h2>
        <button type="button" class="btn btn-outline btn-sm trip-number-bomb-close" onclick="closeNumberBombGame()">關閉</button>
      </div>
      <p class="trip-number-bomb-range" aria-live="polite">${rangeText}</p>
      <div class="trip-number-bomb-turn">
        <div class="trip-number-bomb-turn-label">輪到</div>
        <div class="trip-number-bomb-turn-row">
          ${nbombAvatarHtml(cur)}
          <span class="trip-number-bomb-turn-name">${esc(cur)}</span>
        </div>
      </div>
      <div class="trip-number-bomb-guess-row">
        <input type="number" id="nbomb-guess-input" class="form-input trip-number-bomb-guess-input" inputmode="numeric" placeholder="輸入數字"
          aria-label="猜測數字" onkeydown="if(event.key==='Enter'){event.preventDefault();nbombGuess()}">
        <button type="button" class="btn btn-primary" onclick="nbombGuess()">確認</button>
      </div>
      ${renderHistory()}
    </div>`;
}

function renderEnded() {
  return `
    <div class="trip-number-bomb-inner trip-number-bomb-inner--ended">
      <div class="trip-number-bomb-top">
        <h2 class="trip-number-bomb-title">數字炸彈</h2>
        <button type="button" class="btn btn-outline btn-sm trip-number-bomb-close" onclick="closeNumberBombGame()">關閉</button>
      </div>
      <div class="trip-number-bomb-boom" role="status">💥 爆炸！</div>
      <p class="trip-number-bomb-ended-line"><strong>${esc(state.loserName)}</strong> 猜中炸彈</p>
      <p class="trip-number-bomb-ended-bomb">炸彈數字：<strong>${state.bomb == null ? '—' : esc(String(state.bomb))}</strong></p>
      ${renderHistory()}
      <div class="trip-number-bomb-actions trip-number-bomb-actions--ended">
        <button type="button" class="btn btn-primary" onclick="nbombAgain()">再來一局</button>
      </div>
    </div>`;
}

function render() {
  const root = overlayEl();
  if (!root) return;
  let html = '';
  if (state.phase === 'setup') html = renderSetup();
  else if (state.phase === 'playing') html = renderPlaying();
  else html = renderEnded();
  root.innerHTML = html;
  if (state.phase === 'playing') {
    requestAnimationFrame(() => {
      const inp = document.getElementById('nbomb-guess-input');
      inp?.focus();
    });
  }
}

function readSetupFromDom() {
  const presetEl = document.getElementById('nbomb-range-preset');
  const preset = presetEl?.value || '100';
  if (preset === '100') {
    state.min = 1;
    state.max = 100;
  } else if (preset === '50') {
    state.min = 1;
    state.max = 50;
  } else {
    const a = Math.floor(Number(document.getElementById('nbomb-min')?.value));
    const b = Math.floor(Number(document.getElementById('nbomb-max')?.value));
    if (Number.isFinite(a)) state.min = a;
    if (Number.isFinite(b)) state.max = b;
  }
  const modeEl = document.getElementById('nbomb-bomb-mode');
  state.bombMode = modeEl?.value === 'host' ? 'host' : 'random';
}

/**
 * @param {{ id: string; members: string[] }} trip
 */
export function openNumberBombGame(trip) {
  tripRef = trip;
  state = {
    phase: 'setup',
    membersSnapshot: [],
    low: 0,
    high: 101,
    bomb: null,
    turnIndex: 0,
    history: [],
    min: 1,
    max: 100,
    bombMode: 'random',
    loserName: '',
  };
  const root = overlayEl();
  if (!root) return;
  root.hidden = false;
  document.body.style.overflow = 'hidden';
  render();
  nbombSyncSetupPanels();
}

export function closeNumberBombGame() {
  const root = overlayEl();
  if (root) {
    root.hidden = true;
    root.innerHTML = '';
  }
  document.body.style.overflow = '';
  tripRef = null;
}

export function nbombSyncSetupPanels() {
  const preset = document.getElementById('nbomb-range-preset')?.value;
  const custom = document.getElementById('nbomb-custom-range');
  if (custom) custom.style.display = preset === 'custom' ? 'flex' : 'none';
  const mode = document.getElementById('nbomb-bomb-mode')?.value;
  const host = document.getElementById('nbomb-host-bomb-wrap');
  if (host) host.style.display = mode === 'host' ? 'block' : 'none';
}

export function nbombStart() {
  if (!tripRef) return;
  readSetupFromDom();
  const members =
    state.membersSnapshot.length > 0 ? [...state.membersSnapshot] : [...tripRef.members];
  if (members.length === 0) return;

  const min = state.min;
  const max = state.max;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min + 1) {
    toast('範圍須為整數，且最大要比最小至少大 2');
    return;
  }

  let bomb;
  if (state.bombMode === 'host') {
    const raw = document.getElementById('nbomb-host-bomb')?.value;
    bomb = Math.floor(Number(raw));
    if (!Number.isFinite(bomb) || bomb < min || bomb > max) {
      toast(`主持人炸彈須在 ${min} 到 ${max} 之間（整數）`);
      return;
    }
  } else {
    const span = max - min + 1;
    bomb = randomUniformIndex(span) + min;
  }

  state.membersSnapshot = members;
  state.low = min - 1;
  state.high = max + 1;
  state.bomb = bomb;
  state.turnIndex = randomUniformIndex(members.length);
  state.history = [];
  state.phase = 'playing';
  render();
}

export function nbombGuess() {
  if (state.phase !== 'playing' || state.bomb == null) return;
  const names = state.membersSnapshot;
  if (names.length === 0) return;
  const cur = names[((state.turnIndex % names.length) + names.length) % names.length];

  const raw = document.getElementById('nbomb-guess-input')?.value;
  const g = Math.floor(Number(raw));
  const res = applyGuess(state.low, state.high, state.bomb, g);

  if (res.type === 'invalid') {
    state.history.push({ name: cur, guess: Number.isFinite(g) ? g : null, result: 'invalid' });
    render();
    return;
  }

  if (res.type === 'boom') {
    state.history.push({ name: cur, guess: g, result: 'boom' });
    state.loserName = cur;
    state.phase = 'ended';
    render();
    return;
  }

  state.history.push({
    name: cur,
    guess: g,
    result: res.type,
  });
  state.low = res.low;
  state.high = res.high;
  state.turnIndex += 1;
  render();
}

export function nbombAgain() {
  state.phase = 'setup';
  state.low = 0;
  state.high = 101;
  state.bomb = null;
  state.turnIndex = 0;
  state.history = [];
  state.loserName = '';
  // membersSnapshot、範圍與炸彈模式保留
  render();
  nbombSyncSetupPanels();
}

export function openTripNumberBomb() {
  const trip = getTripById(appState.currentTripId);
  if (trip) openNumberBombGame(trip);
}

function nbombSecretLotteryTitleTapCore() {
  const pop = document.getElementById('trip-lottery-popover');
  if (!pop || pop.hidden) return;
  const now = Date.now();
  if (now - _nbombLotteryTapAt > NBOMB_SECRET_TAP_WINDOW_MS) _nbombLotteryTapCount = 0;
  _nbombLotteryTapAt = now;
  _nbombLotteryTapCount++;
  if (_nbombLotteryTapCount >= NBOMB_SECRET_TAP_NEED) {
    openNbombFromLotterySecret();
  }
}

/** 桌面／觸控後已處理時由 click 呼叫。 */
export function nbombSecretLotteryTitleTapFromClick() {
  if (Date.now() < _nbombSuppressClickUntil) return;
  nbombSecretLotteryTitleTapCore();
}

/**
 * 手機：以 passive:false 綁定，才能 preventDefault，避免 iOS 延遲 click 導致連點失效。
 * @param {HTMLElement | null | undefined} popEl `#trip-lottery-popover`
 */
export function attachNbombSecretLotteryTitleListeners(popEl) {
  const el = popEl?.querySelector?.('.trip-lottery-popover-title--nbomb-secret');
  if (!el) return;
  el.addEventListener(
    'touchstart',
    /** @param {TouchEvent} ev */
    ev => {
      const pop = document.getElementById('trip-lottery-popover');
      if (!pop || pop.hidden) return;
      if (ev.targetTouches && ev.targetTouches.length !== 1) return;
      try {
        ev.preventDefault();
      } catch {
        /* ignore */
      }
      _nbombSuppressClickUntil = Date.now() + 500;
      nbombSecretLotteryTitlePressStart();
      nbombSecretLotteryTitleTapCore();
    },
    { passive: false },
  );
}

export function nbombSecretLotteryTitlePressStart() {
  const pop = document.getElementById('trip-lottery-popover');
  if (!pop || pop.hidden) return;
  if (_nbombLotteryPressTimer) clearTimeout(_nbombLotteryPressTimer);
  _nbombLotteryPressTimer = setTimeout(() => {
    _nbombLotteryPressTimer = null;
    openNbombFromLotterySecret();
  }, NBOMB_SECRET_PRESS_MS);
}

export function nbombSecretLotteryTitlePressEnd() {
  if (_nbombLotteryPressTimer) {
    clearTimeout(_nbombLotteryPressTimer);
    _nbombLotteryPressTimer = null;
  }
}
