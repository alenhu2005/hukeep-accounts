import { tripDetailState } from '../state-accessors.js';
import {
  getAvatarUrlByMemberName,
  getKnownMemberNames,
  getMemberColor,
  isHiddenMemberColorId,
  getHiddenMemberStyleKey,
} from '../data.js';
import { computeExpenseShares, tripExpenseFxFeeNtd } from '../finance.js';
import { categoryBadgeHTML } from '../category.js';
import { esc, jq, jqAttr, memberToneClass, memberToneVars } from '../utils.js';
import {
  isTripCnyModeEnabled,
  getDetailAmountNt,
  setDetailAmountFromNt,
  syncDetailAmountCurrencyToggleUi,
  updateCnyRateInlineDisplay,
  readLiveCnyCache,
  readSavedCnyTwdRate,
  cnyAuxAmountFromNtd,
} from '../trip-cny-rate.js';

export function parseMoneyLike(v) {
  if (v == null) return 0;
  const compact = String(v).replace(/[^\d.]/g, '');
  const n = parseFloat(compact);
  return Number.isFinite(n) ? n : 0;
}

export function hasAnyExplicitZeroRaw(rawsByMember, members) {
  return members.some(m => {
    const raw = String(rawsByMember?.[m] ?? '');
    if (!/\d/.test(raw)) return false;
    return parseMoneyLike(raw) === 0;
  });
}

export function resetRenderedSplitCustomInputs() {
  const splitBox = document.getElementById('d-split-custom-list');
  if (!splitBox) return;
  splitBox.querySelectorAll('input[data-member]').forEach(inp => {
    inp.value = '';
    inp.disabled = false;
    inp.classList.remove('split-custom-input--locked');
    inp.setAttribute('aria-disabled', 'false');
  });
}

function tripRecordAvatar(name, cssClass) {
  const url = getAvatarUrlByMemberName(name, 'trip');
  const color = getMemberColor(name);
  const rare = isHiddenMemberColorId(color.id);
  const sk = rare ? getHiddenMemberStyleKey(color.id) : '';
  const styleCls = sk ? ` member-rare--${sk}` : '';
  const rareCls = rare ? ` record-avatar--rare${styleCls}` : '';
  const toneCls = memberToneClass(rare);
  const tv = memberToneVars(color, rare);
  const previewable = cssClass === 'me';
  const previewClick = previewable
    ? ` onclick="event.stopPropagation();openMemberAvatarPreview(${jqAttr(name)})" title="預覽頭像"`
    : '';
  if (url) {
    if (previewable) {
      return `<button type="button" class="record-avatar ${cssClass}${rareCls}${toneCls} record-avatar-clickable"${tv ? ` style="${tv}"` : ''}${previewClick}><img class="record-avatar-img" src="${url}" alt="${esc(name)}"></button>`;
    }
    return `<div class="record-avatar ${cssClass}${rareCls}${toneCls}"${tv ? ` style="${tv}"` : ''}><img class="record-avatar-img" src="${url}" alt="${esc(name)}"></div>`;
  }
  if (cssClass === 'multi' || cssClass === 'split' || cssClass === 'settle') {
    return `<div class="record-avatar ${cssClass}">${esc(name)}</div>`;
  }
  const letterStyle = tv
    ? `background:${color.bg};color:${color.fg};${tv}`
    : `background:${color.bg};color:${color.fg}`;
  if (previewable) {
    return `<button type="button" class="record-avatar ${cssClass}${rareCls}${toneCls} record-avatar-clickable" style="${letterStyle}"${previewClick}>${esc(name.charAt(0))}</button>`;
  }
  return `<div class="record-avatar ${cssClass}${rareCls}${toneCls}" style="${letterStyle}">${esc(name.charAt(0))}</div>`;
}

export function memberAvatarPill(name, cssClass) {
  const url = getAvatarUrlByMemberName(name, 'trip');
  const color = getMemberColor(name);
  const rare = isHiddenMemberColorId(color.id);
  const toneCls = memberToneClass(rare);
  const tv = memberToneVars(color, rare);
  const pv = `onclick="event.stopPropagation();openMemberAvatarPreview(${jqAttr(name)})" title="${esc(name)}" aria-label="預覽 ${esc(name)} 頭像"`;
  if (url) {
    return `<button type="button" class="${cssClass} settlement-pill-avatar-btn${toneCls}"${tv ? ` style="${tv}"` : ''} ${pv}><img src="${url}" alt="${esc(name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block"></button>`;
  }
  const parts = [`background:${color.bg}`, `color:${color.fg}`, `border-color:${color.fg}30`];
  if (tv) parts.push(tv);
  return `<button type="button" class="${cssClass} settlement-pill-avatar-btn${toneCls}" style="${parts.join(';')}" ${pv}>${esc(name.charAt(0))}</button>`;
}

function tripPhotoThumb(e) {
  if (!e.photoUrl) return '';
  return `<button type="button" class="record-photo-btn" onclick="event.stopPropagation();openPhotoLightbox('${e.photoUrl.replace(/'/g, "\\'")}')" title="查看照片" aria-label="查看照片">
    <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
  </button>`;
}

function tripExpenseCnyHtml(e) {
  let c = parseFloat(e.amountCny);
  if (!Number.isFinite(c) || c <= 0) {
    const tid = e.tripId;
    if (!tid || !isTripCnyModeEnabled(tid)) return '';
    const live = readLiveCnyCache();
    const rate = live && live.rate > 0 ? live.rate : readSavedCnyTwdRate();
    if (!(rate > 0)) return '';
    const nt = Math.round(parseFloat(e.amount) || 0);
    if (nt <= 0) return '';
    c = cnyAuxAmountFromNtd(nt, rate);
    if (!(c > 0)) return '';
  }
  const t = c.toFixed(2).replace(/\.?0+$/, '');
  const mute = e._voided ? '' : 'color:var(--text-muted);';
  return `<div style="font-size:13px;font-weight:600;margin-top:2px;${mute}">¥${t}</div>`;
}

function tripExpenseFxFeeHtml(e) {
  const fee = tripExpenseFxFeeNtd(e);
  if (fee <= 0) return '';
  const mute = e._voided ? '' : 'color:var(--text-muted);';
  return `<div style="font-size:12px;font-weight:600;margin-top:2px;${mute}">手續／匯差 NT$${Math.round(fee)}</div>`;
}

export function tripExpenseHTML(e, totalMembers, recordIndex = 0) {
  const ri = `--record-i:${recordIndex};`;
  const hasCustomSplit = Array.isArray(e.splitDetails) && e.splitDetails.length > 0;
  const label = hasCustomSplit
    ? '詳細分攤'
    : e.splitAmong.length === totalMembers
      ? '均分'
      : e.splitAmong.join('、');
  const noteEl = e.note ? `<div class="record-note">${esc(e.note)}</div>` : '';
  const clickAttr = e._voided ? '' : `onclick='openEditRecordById(${jq(e.id)},true)' style="cursor:pointer" title="點擊編輯"`;
  const photoEl = tripPhotoThumb(e);
  const shareLines = computeExpenseShares(e);
  const splitMeta = hasCustomSplit
    ? shareLines.map(s => `${esc(s.name)} NT$${Math.round(s.amount)}`).join('、')
    : '';

  if (e.payers && Array.isArray(e.payers)) {
    const payerStr = e.payers.map(p => `${esc(p.name)} NT$${Math.round(p.amount)}`).join(' ＋ ');
    const perPerson = shareLines.length ? Math.round(shareLines[0].amount) : 0;
    return `<div class="record-item${e._voided ? ' is-voided' : ''}" style="${ri}">
      ${tripRecordAvatar('多', 'multi')}
      <div class="record-info" ${clickAttr}>
        <div class="record-name">
          <span class="record-name-text">${esc(e.item)}</span>
          <span class="badge${e._voided ? ' badge-void' : ''}">${e._voided ? '已撤回' : '多人出款'}</span>
          ${categoryBadgeHTML(e.category)}
        </div>
        <div class="record-meta">${esc(e.date)} · ${payerStr}${hasCustomSplit ? ` · ${splitMeta}` : ` · 每人 NT$${perPerson}`}</div>
        ${noteEl}
      </div>
      ${photoEl}
      <div class="record-amount" style="${e._voided ? 'color:#9ca3af;text-decoration:line-through' : ''}"><div>NT$${Math.round(e.amount)}</div>${tripExpenseFxFeeHtml(e)}${tripExpenseCnyHtml(e)}</div>
    </div>`;
  }

  return `<div class="record-item${e._voided ? ' is-voided' : ''}" style="${ri}">
    ${tripRecordAvatar(e.paidBy, 'me')}
    <div class="record-info" ${clickAttr}>
      <div class="record-name">
        <span class="record-name-text">${esc(e.item)}</span>
        <span class="badge${e._voided ? ' badge-void' : ''}">${e._voided ? '已撤回' : esc(label)}</span>
        ${categoryBadgeHTML(e.category)}
      </div>
      <div class="record-meta">${esc(e.date)} · ${esc(e.paidBy)}付${hasCustomSplit ? ` · ${splitMeta}` : ` · 每人 NT$${shareLines.length ? Math.round(shareLines[0].amount) : 0}`}</div>
      ${noteEl}
    </div>
    ${photoEl}
    <div class="record-amount" style="${e._voided ? 'color:#9ca3af;text-decoration:line-through' : ''}"><div>NT$${Math.round(e.amount)}</div>${tripExpenseFxFeeHtml(e)}${tripExpenseCnyHtml(e)}</div>
  </div>`;
}

export function tripSettlementHTML(s, recordIndex = 0) {
  const ri = `--record-i:${recordIndex};`;
  const clickAttr = s._voided
    ? ''
    : `onclick='openEditRecordById(${jq(s.id)},"tripSettlement")' style="cursor:pointer" title="點擊檢視／撤回"`;
  return `<div class="record-item is-settlement${s._voided ? ' is-voided' : ''}" style="${ri}">
    <div class="record-avatar settle">↕</div>
    <div class="record-info" ${clickAttr}>
      <div class="record-name">
        <span class="record-name-text">出遊還款</span>
        <span class="badge ${s._voided ? 'badge-void' : 'badge-settle'}">${s._voided ? '已撤回' : '還款'}</span>
      </div>
      <div class="record-meta">${esc(s.date)} · ${esc(s.from)} → ${esc(s.to)}</div>
    </div>
    <div class="record-amount${s._voided ? '' : ' record-amount--settle'}" style="${s._voided ? 'color:#9ca3af;text-decoration:line-through' : ''}">NT$${Math.round(s.amount)}</div>
  </div>`;
}

export function renderDetailMemberChips(members) {
  const el = document.getElementById('detail-member-chips');
  if (el._scrollRevealCleanup) el._scrollRevealCleanup();
  el.innerHTML = members
    .map((m, i) => {
      const avatarUrl = getAvatarUrlByMemberName(m, 'trip');
      const color = getMemberColor(m);
      const rare = isHiddenMemberColorId(color.id);
      const sk = rare ? getHiddenMemberStyleKey(color.id) : '';
      const styleCls = sk ? ` member-rare--${sk}` : '';
      const avCls = rare ? ` member-chip-avatar--rare${styleCls}` : '';
      const toneCls = memberToneClass(rare);
      const tv = memberToneVars(color, rare);
      const chipStyle = tv ? ` style="--chip-i:${i};${tv}"` : ` style="--chip-i:${i}"`;
      const fbStyle = tv
        ? `background:${color.bg};color:${color.fg};${tv}`
        : `background:${color.bg};color:${color.fg}`;
      const avatarHtml = avatarUrl
        ? `<img class="member-chip-avatar${avCls}${toneCls}" src="${avatarUrl}" alt="${esc(m)} 頭像"${tv ? ` style="${tv}"` : ''}>`
        : `<span class="member-chip-avatar member-chip-avatar--fallback${rare ? ` member-chip-avatar-fallback--rare${styleCls}` : ''}${toneCls}" style="${fbStyle}" aria-hidden="true">${esc(m.charAt(0))}</span>`;
      const avatarBtn = `<button type="button" class="member-chip-avatar-btn" onclick="openMemberAvatarPreview(${jqAttr(m)})" title="預覽頭像" aria-label="預覽 ${esc(m)} 頭像">${avatarHtml}</button>`;

      const removeBtn =
        members.length > 2
          ? `<button class="member-chip-remove" title="移除" onclick="removeMemberAction(${jqAttr(m)})">
           <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
         </button>`
          : '';
      return `<span class="member-chip${rare ? ` member-chip--rare${styleCls}` : ''}${toneCls}"${chipStyle}>
          ${avatarBtn}
          <span class="member-chip-name">${esc(m)}</span>
          ${removeBtn}
        </span>`;
    })
    .join('');
}

export function renderDetailKnownMembers(trip) {
  const el = document.getElementById('detail-known-members');
  if (!el) return;
  if (el._scrollRevealCleanup) el._scrollRevealCleanup();
  const known = getKnownMemberNames();
  const available = known.filter(n => !trip.members.includes(n));
  if (available.length === 0 || trip._closed) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="known-member-bar">
    <span class="known-member-bar-label">快速加入</span>
    ${available
      .map((n, ki) => {
        const c = getMemberColor(n);
        const rare = isHiddenMemberColorId(c.id);
        const sk = rare ? getHiddenMemberStyleKey(c.id) : '';
        const styleCls = sk ? ` member-rare--${sk}` : '';
        const kTone = memberToneClass(rare);
        const kTv = memberToneVars(c, rare);
        return `<button type="button" class="known-member-bar-btn${rare ? ` known-member-bar-btn--rare${styleCls}` : ''}${kTone}"${kTv ? ` style="--km-i:${ki};${kTv}"` : ` style="--km-i:${ki}"`} onclick="addDetailMemberByName(${jqAttr(n)})">
        <span class="known-member-bar-dot${rare ? ` known-member-bar-dot--rare${styleCls}` : ''}" style="background:${c.fg}">${esc(n.charAt(0))}</span>${esc(n)}
      </button>`;
      })
      .join('')}
  </div>`;
}

export function renderSplitChips(members) {
  const state = tripDetailState();
  const el = document.getElementById('d-split-chips');
  el.innerHTML = members
    .map(m => {
      const active = state.detailSplitAmong.includes(m);
      return `<button class="split-chip ${active ? 'active' : ''}" onclick="toggleSplit(${jqAttr(m)})">${esc(m)}</button>`;
    })
    .join('');
  renderSplitCustomList();
  updatePerPerson();
}

function resolveSplitLockTarget(members, totalReady, customMap, rawMap, activeMember = '', activeRawValue = '') {
  const state = tripDetailState();
  if (totalReady) {
    const activeRaw = String(activeRawValue ?? '');
    if (activeMember && !/\d/.test(activeRaw)) return '';

    const auto = String(state.detailSplitAutoFilledTarget || '').trim();
    const rawAll = { ...(rawMap || {}), ...(activeMember ? { [activeMember]: activeRaw } : {}) };
    const unfilledByRaw = members.filter(m => {
      const raw = String(rawAll?.[m] ?? '');
      const hasDigit = /\d/.test(raw);
      if (!hasDigit) return true;
      return false;
    });
    if (auto && members.includes(auto) && auto !== activeMember) return auto;
    return unfilledByRaw.length === 1 ? unfilledByRaw[0] : '';
  }
  return '';
}

export function renderSplitCustomList() {
  const state = tripDetailState();
  const box = document.getElementById('d-split-custom-list');
  if (!box) return;
  const useCustom = state.detailSplitMode === 'custom';
  box.style.display = useCustom ? '' : 'none';
  if (!useCustom) {
    box.innerHTML = '';
    return;
  }
  if (state.detailSplitAmong.length === 0) {
    box.innerHTML = '';
    return;
  }
  const members = state.detailSplitAmong.slice();
  const totalVal = getDetailAmountNt();
  const totalReady = totalVal > 0 || (state.detailMultiPay && totalVal > 0);
  const active = document.activeElement;
  const activeMember =
    active && active.getAttribute && active.getAttribute('data-member') ? String(active.getAttribute('data-member') || '') : '';
  const activeRawValue = active && activeMember && 'value' in active ? String(active.value || '') : '';
  const rawMap = Object.fromEntries(
    Array.from(box.querySelectorAll('input[data-member]')).map(inp => [
      String(inp.getAttribute('data-member') || ''),
      String(inp.value || ''),
    ]),
  );
  const uiRawAll = { ...rawMap, ...(activeMember ? { [activeMember]: activeRawValue } : {}) };
  const activeEmpty = !!activeMember && !/\d/.test(String(activeRawValue || ''));
  const anyZero = totalReady && hasAnyExplicitZeroRaw(uiRawAll, members);
  const editingMember = String(state.detailSplitEditingMember || '').trim();
  const suppressLock = !!editingMember || (totalReady && (anyZero || activeEmpty));
  const lock = suppressLock
    ? ''
    : resolveSplitLockTarget(members, totalReady, state.detailSplitCustom || {}, rawMap, activeMember, activeRawValue);
  state.detailSplitLockedTarget = lock;
  box.innerHTML = state.detailSplitAmong
    .map(name => {
      const v = parseFloat(state.detailSplitCustom?.[name]) || 0;
      const locked = !suppressLock && lock === name;
      const isActiveField = active && active.getAttribute && active.getAttribute('data-member') === name;
      const disable = !suppressLock && locked && !isActiveField;
      const touched = !!state.detailSplitTouched?.[name];
      const showZero = touched && parseMoneyLike(state.detailSplitCustom?.[name]) <= 0;
      return `<div class="split-custom-row">
        <div class="split-custom-name">${esc(name)}</div>
        <input type="text" class="form-input form-input-amount${locked ? ' split-custom-input--locked' : ''}" data-member="${esc(name)}" value="${v > 0 || showZero ? Math.round(v) : ''}" placeholder="0"
          lang="en" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off"
          inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" aria-label="${esc(name)} 分攤金額"
          ${disable ? 'disabled aria-disabled="true"' : ''}
          onfocus="beginDetailSplitEdit(${jqAttr(name)})"
          onblur="endDetailSplitEdit(${jqAttr(name)})"
          oninput="setDetailSplitAmount(${jqAttr(name)}, this.value)">
      </div>`;
    })
    .join('');
}

export function updatePerPerson() {
  const state = tripDetailState();
  if (state.detailMultiPay) {
    updateMultiPayTotal();
  }
  const a = getDetailAmountNt();
  const note = document.getElementById('d-per-person');
  if (state.detailSplitMode === 'custom') {
    if (note) note.textContent = '';
    const totalEl = document.getElementById('d-amount');
    const total = getDetailAmountNt();
    const members = state.detailSplitAmong.slice();
    const totalReady = total > 0 || (state.detailMultiPay && total > 0);
    const active = document.activeElement;
    const activeMember =
      active && active.getAttribute && active.getAttribute('data-member') ? String(active.getAttribute('data-member') || '') : '';
    const activeRawValue = active && activeMember && 'value' in active ? String(active.value || '') : '';
    const splitBox = document.getElementById('d-split-custom-list');
    const rawMap = splitBox
      ? Object.fromEntries(
          Array.from(splitBox.querySelectorAll('input[data-member]')).map(inp => [
            String(inp.getAttribute('data-member') || ''),
            String(inp.value || ''),
          ]),
        )
      : {};

    const uiRawAll = { ...rawMap, ...(activeMember ? { [activeMember]: activeRawValue } : {}) };
    const activeEmpty = !!activeMember && !/\d/.test(String(activeRawValue || ''));
    const anyZero = totalReady && hasAnyExplicitZeroRaw(uiRawAll, members);
    const editingMember = String(state.detailSplitEditingMember || '').trim();
    const suppressLock = !!editingMember || (totalReady && (anyZero || activeEmpty));

    const totalIsEmpty = totalEl && !/\d/.test(String(totalEl.value || ''));
    const allFilled = members.length > 0 && members.every(m => /\d/.test(String(uiRawAll?.[m] ?? '')));
    if (!suppressLock && totalEl && totalIsEmpty && allFilled && document.activeElement !== totalEl) {
      const sumFromState = members.reduce((s, m) => {
        const v = m === activeMember ? parseMoneyLike(activeRawValue) : parseMoneyLike(state.detailSplitCustom?.[m]);
        return s + (Number.isFinite(v) ? v : 0);
      }, 0);
      if (sumFromState > 0) {
        setDetailAmountFromNt(Math.round(sumFromState));
        state.detailSplitTotalTouched = false;
        state.detailSplitTotalDerived = true;
      }
    }

    if (suppressLock) {
      state.detailSplitLockedTarget = '';
      state.detailSplitAutoFilledTarget = '';
      state.detailSplitTotalDerived = false;
      if (totalEl) {
        totalEl.disabled = false;
        totalEl.classList.remove('split-custom-input--locked');
        totalEl.setAttribute('aria-disabled', 'false');
      }
      const inputs = Array.from(document.querySelectorAll('#d-split-custom-list input[data-member]'));
      inputs.forEach(inp => {
        inp.disabled = false;
        inp.classList.remove('split-custom-input--locked');
        inp.setAttribute('aria-disabled', 'false');
      });
      return;
    }

    const lock = resolveSplitLockTarget(members, totalReady, state.detailSplitCustom || {}, rawMap, activeMember, activeRawValue);
    state.detailSplitLockedTarget = lock;

    if (totalEl) {
      const lockTotal = lock === 'total';
      const shouldDisable = lockTotal && active !== totalEl;
      const derived = !!state.detailSplitTotalDerived && active !== totalEl;
      const disableTotal = shouldDisable || derived;
      totalEl.disabled = disableTotal;
      totalEl.classList.toggle('split-custom-input--locked', lockTotal || derived);
      totalEl.setAttribute('aria-disabled', disableTotal ? 'true' : 'false');
    }
    Array.from(document.querySelectorAll('#d-split-custom-list input[data-member]')).forEach(inp => {
      const m = String(inp.getAttribute('data-member') || '');
      const shouldLock = lock === m;
      const shouldDisable = shouldLock && active !== inp;
      inp.disabled = shouldDisable;
      inp.classList.toggle('split-custom-input--locked', shouldLock);
      inp.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
    });

    if (lock && lock !== 'total' && total > 0) {
      const used = members
        .filter(m => m !== lock)
        .reduce((s, m) => s + parseMoneyLike(state.detailSplitCustom?.[m]), 0);
      const residual = Math.max(0, total - used);
      state.detailSplitCustom[lock] = residual;
      state.detailSplitAutoFilledTarget = lock;
      const inp = Array.from(document.querySelectorAll('#d-split-custom-list input[data-member]')).find(
        el => el.getAttribute('data-member') === lock,
      );
      if (inp && active !== inp) inp.value = residual > 0 ? String(Math.round(residual)) : '';
    }

    const sum = members.reduce((s, m) => s + parseMoneyLike(state.detailSplitCustom?.[m]), 0);
    if (totalEl && lock === 'total' && active !== totalEl) {
      setDetailAmountFromNt(Math.round(sum));
    }
    return;
  }
  if (note) {
    note.textContent =
      a > 0 && state.detailSplitAmong.length > 0
        ? '每人 NT$' + Math.round(a / state.detailSplitAmong.length)
        : '';
  }
}

export function updateMultiPayTotal() {
  const state = tripDetailState();
  const payerAmountInputs = Array.from(document.querySelectorAll('#d-payers-list .payer-amount'));
  const payerRows = payerAmountInputs
    .map(inp => {
      const row = inp.closest('.payer-row');
      const name = row?.querySelector('input.payer-name')?.value || '';
      const rowId = String(row?.dataset?.rowId || '').trim();
      return {
        rowId,
        name: String(name || '').trim(),
        amountEl: inp,
        amount: parseMoneyLike(inp.value),
        touched: !!state.detailMultiPayTouchedRows?.[rowId],
      };
    })
    .filter(r => r.name);

  const totalEl = document.getElementById('d-amount');
  const totalVal = getDetailAmountNt();
  const sumPayers = payerRows.reduce((s, r) => s + r.amount, 0);
  const editing = String(state.detailMultiPayEditingTarget || '').trim();
  let lockTarget = '';
  const untouchedPayers = payerRows.filter(r => !r.touched);
  const zeroPayers = payerRows.filter(r => r.amount <= 0);
  const userProvidedTotal = state.detailMultiPayTotalTouched && totalVal > 0;
  if (!userProvidedTotal) {
    lockTarget = 'total';
  } else if (zeroPayers.length === 1) {
    const z = zeroPayers[0];
    if (z?.rowId) lockTarget = `row:${z.rowId}`;
  } else if (untouchedPayers.length === 1) {
    const t = untouchedPayers[0];
    if (t?.rowId) lockTarget = `row:${t.rowId}`;
  }
  state.detailMultiPayLockedTarget = lockTarget;

  if (totalEl) {
    totalEl.disabled = false;
    totalEl.classList.remove('split-custom-input--locked');
    totalEl.setAttribute('aria-disabled', 'false');
  }
  payerRows.forEach(r => {
    r.amountEl.disabled = false;
    r.amountEl.classList.remove('split-custom-input--locked');
    r.amountEl.setAttribute('aria-disabled', 'false');
  });

  const active = document.activeElement;

  if (lockTarget === 'total' && totalEl) {
    if (active !== totalEl) {
      setDetailAmountFromNt(sumPayers > 0 ? Math.round(sumPayers) : 0);
      const autoTotal = !userProvidedTotal;
      totalEl.disabled = autoTotal;
      totalEl.classList.toggle('split-custom-input--locked', autoTotal);
      totalEl.setAttribute('aria-disabled', autoTotal ? 'true' : 'false');
    }
  } else if (lockTarget.startsWith('row:')) {
    const targetRowId = lockTarget.slice(4);
    const target = payerRows.find(r => r.rowId === targetRowId);
    if (target) {
      if (active === target.amountEl || editing === `row:${targetRowId}`) {
        const n = state.detailSplitAmong.length || 1;
        const displayTotal = totalVal > 0 ? totalVal : sumPayers;
        const note = document.getElementById('d-per-person');
        if (note) {
          note.textContent = displayTotal > 0 && n > 0 ? `每人 NT$${Math.round(displayTotal / n)}` : '';
        }
        return;
      }
      const used = payerRows.filter(r => r.rowId !== targetRowId).reduce((s, r) => s + r.amount, 0);
      const residual = Math.max(0, totalVal > 0 ? totalVal - used : sumPayers - used);
      target.amountEl.value = residual > 0 ? String(Math.round(residual)) : '';
      target.amountEl.disabled = true;
      target.amountEl.classList.add('split-custom-input--locked');
      target.amountEl.setAttribute('aria-disabled', 'true');
    }
  }

  const n = state.detailSplitAmong.length || 1;
  const displayTotal = totalVal > 0 ? totalVal : sumPayers;
  const note = document.getElementById('d-per-person');
  if (note) {
    if (state.detailSplitMode === 'custom') note.textContent = '';
    else note.textContent = displayTotal > 0 && n > 0 ? `每人 NT$${Math.round(displayTotal / n)}` : '';
  }
}

export function syncDetailAmountUi() {
  syncDetailAmountCurrencyToggleUi();
  updateCnyRateInlineDisplay();
}
