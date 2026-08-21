import { appState } from './state.js';
import { showConfirm } from './dialog.js';
import {
  createNote,
  filterNotes,
  getNotes,
  sortNotes,
} from './notes-store.js';
import { esc, jqAttr, toast } from './utils.js';
import { linkifyNoteText } from './note-links.js';
import { formatPostError, postRow } from './api.js';
import { applyOptimisticPayload, restoreRowsSnapshot, snapshotRows } from './actions/shared.js';

function formatNoteTime(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (sameDay) return `今天 ${time}`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function noteCardHTML(note) {
  const noteId = jqAttr(note.id);
  const title = note.title || '未命名記事';
  const body = note.body
    ? `<div class="note-card-body">${linkifyNoteText(note.body)}</div>`
    : '<div class="note-card-body note-card-body--empty">只有標題</div>';
  return `<article class="note-card${note.pinned ? ' is-pinned' : ''}" data-note-id="${esc(note.id)}">
    <div class="note-card-topline">
      <div class="note-card-heading">
        ${note.pinned ? '<span class="note-pinned-badge">置頂</span>' : ''}
        ${note._pendingSync ? '<span class="note-pending-badge">待同步</span>' : ''}
        <h2 class="note-card-title">${esc(title)}</h2>
      </div>
      <div class="note-card-actions">
        <button type="button" class="note-icon-btn${note.pinned ? ' active' : ''}" onclick="toggleNotePin(${noteId})" title="${note.pinned ? '取消置頂' : '置頂'}" aria-label="${note.pinned ? '取消置頂' : '置頂'}" aria-pressed="${note.pinned}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z"/></svg>
        </button>
        <button type="button" class="note-icon-btn" onclick="editNote(${noteId})" title="編輯記事" aria-label="編輯記事">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button type="button" class="note-icon-btn note-icon-btn--danger" onclick="deleteNote(${noteId})" title="刪除記事" aria-label="刪除記事">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm3.46-7.12 1.41-1.41L12 11.59l1.12-1.12 1.41 1.41L13.41 13l1.12 1.12-1.41 1.41L12 14.41l-1.12 1.12-1.41-1.41L10.59 13l-1.13-1.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </div>
    <div class="note-card-content">
      ${body}
      <span class="note-card-time">更新於 ${esc(formatNoteTime(note.updatedAt))}</span>
    </div>
  </article>`;
}

function emptyNotesHTML(hasNotes, query, filter) {
  const title = hasNotes ? '找不到符合的記事' : '還沒有記事';
  const subtitle = query
    ? '換個關鍵字再找找看'
    : filter === 'pinned'
      ? '置頂重要記事後會顯示在這裡'
      : '點右上角新增第一則記事';
  return `<div class="card notes-empty">
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm1 15H7v-2h8v2zm2-4H7v-2h10v2zm-4-4V3.5L18.5 9H13z"/></svg>
      </div>
      <div class="empty-title">${title}</div>
      <div class="empty-sub">${subtitle}</div>
    </div>
  </div>`;
}

function renderNotesList() {
  const list = document.getElementById('notes-list');
  if (!list) return;
  const allNotes = sortNotes(getNotes());
  const searched = filterNotes(allNotes, appState.notesSearchQuery);
  const visibleNotes =
    appState.notesFilter === 'pinned' ? searched.filter(note => note.pinned) : searched;
  list.innerHTML = visibleNotes.length
    ? visibleNotes.map(noteCardHTML).join('')
    : emptyNotesHTML(allNotes.length > 0, appState.notesSearchQuery, appState.notesFilter);

  const count = document.getElementById('notes-count');
  if (count) count.textContent = `${allNotes.length} 則`;
  const clear = document.getElementById('notes-search-clear');
  if (clear) clear.hidden = !appState.notesSearchQuery;
  const allButton = document.getElementById('notes-filter-all');
  const pinnedButton = document.getElementById('notes-filter-pinned');
  const allActive = appState.notesFilter === 'all';
  allButton?.classList.toggle('active', allActive);
  allButton?.setAttribute('aria-pressed', String(allActive));
  pinnedButton?.classList.toggle('active', !allActive);
  pinnedButton?.setAttribute('aria-pressed', String(!allActive));
}

function syncNoteEditor() {
  const card = document.getElementById('note-editor-card');
  if (!card) return;
  card.hidden = !appState.noteEditorOpen;
  if (!appState.noteEditorOpen) return;
  const note = appState.editingNoteId
    ? getNotes().find(item => item.id === appState.editingNoteId)
    : null;
  if (appState.editingNoteId && !note) {
    appState.editingNoteId = null;
  }
  const title = document.getElementById('note-title-input');
  const body = document.getElementById('note-body-input');
  const pinned = document.getElementById('note-pinned-input');
  const editorTitle = document.getElementById('note-editor-title');
  if (title) title.value = note?.title || '';
  if (body) body.value = note?.body || '';
  if (pinned) pinned.checked = Boolean(note?.pinned);
  if (editorTitle) {
    const icon = editorTitle.querySelector('svg')?.outerHTML || '';
    editorTitle.innerHTML = `${icon}${note ? '編輯記事' : '新增記事'}`;
  }
}

export function renderNotes() {
  const search = document.getElementById('notes-search-input');
  if (search && search !== document.activeElement) search.value = appState.notesSearchQuery;
  syncNoteEditor();
  renderNotesList();
}

export function openNewNoteEditor() {
  appState.editingNoteId = null;
  appState.noteEditorOpen = true;
  renderNotes();
  requestAnimationFrame(() => document.getElementById('note-title-input')?.focus());
}

export function editNote(id) {
  if (!getNotes().some(note => note.id === id)) return;
  appState.editingNoteId = id;
  appState.noteEditorOpen = true;
  renderNotes();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  requestAnimationFrame(() => document.getElementById('note-title-input')?.focus());
}

export function closeNoteEditor() {
  appState.noteEditorOpen = false;
  appState.editingNoteId = null;
  syncNoteEditor();
}

export async function saveNote() {
  const title = document.getElementById('note-title-input')?.value || '';
  const body = document.getElementById('note-body-input')?.value || '';
  const pinned = Boolean(document.getElementById('note-pinned-input')?.checked);
  if (!title.trim() && !body.trim()) {
    toast('請輸入標題或內容');
    document.getElementById('note-title-input')?.focus();
    return;
  }

  const editing = Boolean(appState.editingNoteId);
  const editingId = appState.editingNoteId;
  const payload = editing
    ? {
        type: 'note',
        action: 'edit',
        id: editingId,
        title: title.trim(),
        body: body.trim(),
        pinned,
        updatedAt: Date.now(),
      }
    : createNote({ title, body, pinned });
  const snapshot = snapshotRows();
  applyOptimisticPayload(payload);
  appState.noteEditorOpen = false;
  appState.editingNoteId = null;
  renderNotes();
  try {
    const syncTarget = appState.allRows.find(row => row && row.type === 'note' && row.id === payload.id) || null;
    const result = await postRow(payload, { syncTarget });
    renderNotesList();
    toast(
      result.status === 'queued'
        ? '記事已暫存，連線後會自動同步'
        : editing
          ? '記事已更新'
          : '記事已儲存',
    );
  } catch (error) {
    restoreRowsSnapshot(snapshot);
    appState.noteEditorOpen = true;
    appState.editingNoteId = editingId;
    renderNotes();
    toast(formatPostError(error));
  }
}

export function saveNoteFromShortcut(event) {
  if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return;
  event.preventDefault();
  saveNote();
}

export async function deleteNote(id) {
  const note = getNotes().find(item => item.id === id);
  if (!note) return;
  const ok = await showConfirm('刪除記事？', `「${note.title || '未命名記事'}」刪除後無法復原。`);
  if (!ok) return;
  const snapshot = snapshotRows();
  const payload = { type: 'note', action: 'delete', id };
  applyOptimisticPayload(payload);
  if (appState.editingNoteId === id) {
    appState.noteEditorOpen = false;
    appState.editingNoteId = null;
  }
  renderNotes();
  try {
    const result = await postRow(payload, { syncTarget: null });
    toast(result.status === 'queued' ? '刪除已暫存，連線後會自動同步' : '記事已刪除');
  } catch (error) {
    restoreRowsSnapshot(snapshot);
    renderNotes();
    toast(formatPostError(error));
  }
}

export async function toggleNotePin(id) {
  const note = getNotes().find(item => item.id === id);
  if (!note) return;
  const snapshot = snapshotRows();
  const payload = {
    type: 'note',
    action: 'edit',
    id,
    pinned: !note.pinned,
    updatedAt: Date.now(),
  };
  applyOptimisticPayload(payload);
  renderNotesList();
  try {
    const syncTarget = appState.allRows.find(row => row && row.type === 'note' && row.id === id) || null;
    const result = await postRow(payload, { syncTarget });
    renderNotesList();
    if (result.status === 'queued') toast('置頂狀態會在連線後同步');
  } catch (error) {
    restoreRowsSnapshot(snapshot);
    renderNotesList();
    toast(formatPostError(error));
  }
}

export function setNotesSearch(value) {
  appState.notesSearchQuery = String(value || '');
  renderNotesList();
}

export function clearNotesSearch() {
  appState.notesSearchQuery = '';
  const input = document.getElementById('notes-search-input');
  if (input) {
    input.value = '';
    input.focus();
  }
  renderNotesList();
}

export function setNotesFilter(filter) {
  appState.notesFilter = filter === 'pinned' ? 'pinned' : 'all';
  renderNotesList();
}
