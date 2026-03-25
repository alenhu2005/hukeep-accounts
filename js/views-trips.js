import { getTrips } from './data.js';
import { esc, jq } from './utils.js';
import { emptyHTML } from './views-shared.js';

function tripCardHTML(t) {
  const deleteBtn = t._closed
    ? ''
    : `<button class="btn btn-ghost btn-icon btn-danger-ghost" title="刪除" onclick='event.stopPropagation();deleteTripAction(${jq(t.id)})'>
      <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
    </button>`;
  const closedBadge = t._closed
    ? `<span class="badge" style="background:var(--bg-tertiary);color:var(--text-muted);font-size:10px">已結束</span>`
    : '';
  return `<div class="trip-card${t._closed ? ' is-voided' : ''}" onclick='navigate("tripDetail",${jq(t.id)})'>
    <div class="trip-icon" style="${t._closed ? 'opacity:.45' : ''}"><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>
    <div class="trip-info">
      <div class="trip-name" style="${t._closed ? 'color:var(--text-muted)' : ''}"><span>${esc(t.name)}</span>${closedBadge}</div>
      <div class="trip-members">${esc(t.members.join('、'))}</div>
    </div>
    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
      ${deleteBtn}
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:var(--text-muted);flex-shrink:0"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
    </div>
  </div>`;
}

export function renderTrips() {
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
