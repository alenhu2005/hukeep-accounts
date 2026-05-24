import { USER_A, USER_B } from './config.js';
import {
  getAvatarUrlByMemberName,
  getMemberColor,
  isHiddenMemberColorId,
  getHiddenMemberStyleKey,
} from './data.js';
import { categoryBadgeHTML } from './category.js';
import { esc, jq, jqAttr } from './utils.js';
import { nextDailyLedgerBalance } from './finance.js';

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

export function buildRunningBalanceMap(orderedOldestFirst) {
  let running = 0;
  const balanceMap = {};
  for (const r of orderedOldestFirst) {
    running = nextDailyLedgerBalance(running, r);
    balanceMap[r.id] = running;
  }
  return balanceMap;
}

export function dailyRecordHTML(r, runBal, recordIndex = 0) {
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
