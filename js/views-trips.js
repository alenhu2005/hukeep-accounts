import { getTrips, getTripColor, TRIP_COLORS } from './data.js';
import { esc, jq } from './utils.js';
import { emptyHTML } from './views-shared.js';

function tripCardHTML(t, listIndex = 0) {
  const color = getTripColor(t.id);
  const deleteBtn = t._closed
    ? ''
    : `<button class="btn btn-ghost btn-icon btn-danger-ghost" title="刪除" onclick='event.stopPropagation();deleteTripAction(${jq(t.id)})' aria-label="刪除行程 ${esc(t.name)}">
      <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
    </button>`;
  const closedBadge = t._closed
    ? `<span class="badge" style="background:var(--bg-tertiary);color:var(--text-muted);font-size:10px">已結束</span>`
    : '';
  const colorDots = TRIP_COLORS.map(c =>
    `<button type="button" class="trip-color-dot${c.id === color.id ? ' active' : ''}" style="background:${c.fg}" onclick='event.stopPropagation();setTripColor(${jq(t.id)},${jq(c.id)})'></button>`
  ).join('');
  return `<div class="trip-card-wrap" data-trip-id="${esc(t.id)}">
  <div class="trip-card${t._closed ? ' is-voided' : ''}" style="--trip-i:${listIndex}" role="button" tabindex="0" aria-label="查看行程 ${esc(t.name)}" onclick='navigate("tripDetail",${jq(t.id)})' onkeydown='if(event.key==="Enter"||event.key===" "){event.preventDefault();navigate("tripDetail",${jq(t.id)})}'>
    <button type="button" class="trip-icon" style="background:${color.bg};${t._closed ? 'opacity:.45' : ''}" onclick='event.stopPropagation();toggleTripColorPicker(${jq(t.id)})' title="更換顏色">
      <svg viewBox="0 0 24 24" fill="${color.fg}"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
    </button>
    <div class="trip-info">
      <div class="trip-name" style="${t._closed ? 'color:var(--text-muted)' : ''}"><span>${esc(t.name)}</span>${closedBadge}</div>
      <div class="trip-members">${esc(t.members.join('、'))}</div>
    </div>
    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
      ${deleteBtn}
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:var(--text-muted);flex-shrink:0" aria-hidden="true"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
    </div>
  </div>
  <div class="trip-color-picker" id="tcp-${esc(t.id)}" style="display:none">${colorDots}</div>
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
  let i = 0;
  if (active.length > 0) {
    html += active.map(t => tripCardHTML(t, i++)).join('');
  }
  if (closed.length > 0) {
    html += `<div class="trip-section-label">已結束行程</div>`;
    html += closed.map(t => tripCardHTML(t, i++)).join('');
  }
  el.innerHTML = html;
}
