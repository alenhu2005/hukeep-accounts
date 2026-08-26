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
import { formatPostError, postRow, saveCache } from './api.js';
import {
  applyOptimisticPayload,
  fileToJpegDataUrl,
  restoreRowsSnapshot,
  snapshotRows,
} from './actions/shared.js';

const MAX_NOTE_PHOTO_BYTES = 8_000_000;
const MAX_NOTE_PHOTO_UPLOAD_BYTES = 4_000_000;
const NOTE_EXPAND_DURATION_MS = 440;
const noteCardAnimations = new WeakMap();
let notePhotoPendingChange = null;

function dataUrlByteLength(dataUrl) {
  const comma = String(dataUrl || '').indexOf(',');
  if (comma < 0) return 0;
  const base64 = dataUrl.slice(comma + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

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
  const forceExpanded = Boolean(note.forceExpanded);
  const expanded = forceExpanded || appState.expandedNoteId === note.id;
  const body = note.body
    ? `<div class="note-card-body">${linkifyNoteText(note.body)}</div>`
    : '<div class="note-card-body note-card-body--empty">只有標題</div>';
  const photo = note.photoUrl
    ? `<button type="button" class="note-card-photo-button" onclick="event.stopPropagation();openPhotoLightbox(${jqAttr(note.photoUrl)})" aria-label="放大記事圖片">
        <img class="note-card-photo" src="${esc(note.photoUrl)}" alt="${esc(title)}的圖片" loading="lazy">
      </button>`
    : '';
  const interactionAttributes = forceExpanded
    ? `aria-expanded="true" aria-label="固定展開記事：${esc(title)}"`
    : `tabindex="0" aria-expanded="${expanded}" aria-label="${expanded ? '收合' : '展開完整'}記事：${esc(title)}" onclick="if(!this.classList.contains('is-editing')&&!event.target.closest('button,a,input,textarea,label,.note-editor-card'))toggleNoteExpanded(${noteId})" onkeydown="handleNoteCardKey(event,${noteId})"`;
  return `<article class="note-card${note.pinned ? ' is-pinned' : ''}${forceExpanded ? ' is-force-expanded' : ''}${expanded ? ' is-expanded' : ''}" data-note-id="${esc(note.id)}" ${interactionAttributes}>
    <div class="note-card-topline">
      <div class="note-card-heading">
        ${note.pinned ? '<span class="note-pinned-badge">置頂</span>' : ''}
        ${note._pendingSync ? '<span class="note-pending-badge">待同步</span>' : ''}
        <h2 class="note-card-title">${esc(title)}</h2>
      </div>
      <div class="note-card-actions">
        <button type="button" class="note-icon-btn${note.pinned ? ' active' : ''}" onclick="event.stopPropagation();toggleNotePin(${noteId})" title="${note.pinned ? '取消置頂' : '置頂'}" aria-label="${note.pinned ? '取消置頂' : '置頂'}" aria-pressed="${note.pinned}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z"/></svg>
        </button>
        <button type="button" class="note-icon-btn" onclick="event.stopPropagation();editNote(${noteId})" title="編輯記事" aria-label="編輯記事">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button type="button" class="note-icon-btn note-icon-btn--danger" onclick="event.stopPropagation();deleteNote(${noteId})" title="刪除記事" aria-label="刪除記事">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm3.46-7.12 1.41-1.41L12 11.59l1.12-1.12 1.41 1.41L13.41 13l1.12 1.12-1.41 1.41L12 14.41l-1.12 1.12-1.41-1.41L10.59 13l-1.13-1.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </div>
    <div class="note-card-content${photo ? ' has-photo' : ''}">
      <div class="note-card-content-main">
        ${body}
        <span class="note-card-time">更新於 ${esc(formatNoteTime(note.updatedAt))}</span>
      </div>
      ${photo}
    </div>
  </article>`;
}

function restoreNoteEditorHome() {
  const editor = document.getElementById('note-editor-card');
  const toolbar = document.querySelector('#page-notes .notes-toolbar');
  const host = editor?.closest('.note-card');
  host?.classList.remove('is-editing');
  editor?.classList.remove('note-editor-card--inline');
  editor?.classList.add('card');
  if (editor && toolbar && editor.nextElementSibling !== toolbar) toolbar.before(editor);
}

function positionNoteEditor() {
  const editor = document.getElementById('note-editor-card');
  if (!editor) return;
  if (!appState.noteEditorOpen || !appState.editingNoteId) {
    restoreNoteEditorHome();
    return;
  }
  const card = Array.from(document.querySelectorAll('#notes-list .note-card')).find(
    element => element.dataset.noteId === appState.editingNoteId,
  );
  if (card) {
    document.querySelectorAll('#notes-list .note-card.is-editing').forEach(element => {
      if (element !== card) element.classList.remove('is-editing');
    });
    editor.classList.remove('card');
    editor.classList.add('note-editor-card--inline');
    card.classList.add('is-editing');
    card.append(editor);
  }
  else restoreNoteEditorHome();
}

function restoreScrollTop(scrollTop) {
  const root = document.documentElement;
  const inlineBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo({ top: scrollTop, behavior: 'auto' });
  root.style.scrollBehavior = inlineBehavior;
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
  restoreNoteEditorHome();
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
  positionNoteEditor();
}

function editingNote() {
  if (!appState.editingNoteId) return null;
  return getNotes().find(note => note.id === appState.editingNoteId) || null;
}

function editorPhotoUrl(note) {
  if (notePhotoPendingChange?.kind === 'replace') return notePhotoPendingChange.dataUrl;
  if (notePhotoPendingChange?.kind === 'remove') return '';
  return note?.photoUrl || '';
}

function syncNotePhotoEditor(note) {
  const previewWrap = document.getElementById('note-photo-preview-wrap');
  const preview = document.getElementById('note-photo-preview');
  const actionLabel = document.getElementById('note-photo-action-label');
  const photoUrl = editorPhotoUrl(note);
  if (preview) {
    if (photoUrl) preview.src = photoUrl;
    else preview.removeAttribute('src');
  }
  if (previewWrap) previewWrap.hidden = !photoUrl;
  if (actionLabel) actionLabel.textContent = photoUrl ? '更換圖片' : '加入圖片';
}

function resetNotePhotoDraft() {
  notePhotoPendingChange = null;
  const input = document.getElementById('note-photo-input');
  if (input) input.value = '';
}

export function autoResizeNoteBody(input = document.getElementById('note-body-input')) {
  if (!(input instanceof HTMLTextAreaElement)) return;
  input.style.height = 'auto';
  const style = getComputedStyle(input);
  const minHeight = Number.parseFloat(style.minHeight) || 132;
  const borderHeight =
    (Number.parseFloat(style.borderTopWidth) || 0) +
    (Number.parseFloat(style.borderBottomWidth) || 0);
  input.style.height = `${Math.max(minHeight, input.scrollHeight + borderHeight)}px`;
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
  const forceExpanded = document.getElementById('note-force-expanded-input');
  const editorTitle = document.getElementById('note-editor-title');
  if (title) title.value = note?.title || '';
  if (body) body.value = note?.body || '';
  if (pinned) pinned.checked = Boolean(note?.pinned);
  if (forceExpanded) forceExpanded.checked = Boolean(note?.forceExpanded);
  syncNotePhotoEditor(note);
  if (editorTitle) {
    const icon = editorTitle.querySelector('svg')?.outerHTML || '';
    editorTitle.innerHTML = `${icon}${note ? '編輯記事' : '新增記事'}`;
  }
  autoResizeNoteBody(body);
  requestAnimationFrame(() => autoResizeNoteBody(body));
}

export function renderNotes() {
  const search = document.getElementById('notes-search-input');
  if (search && search !== document.activeElement) search.value = appState.notesSearchQuery;
  syncNoteEditor();
  renderNotesList();
}

export function openNewNoteEditor() {
  resetNotePhotoDraft();
  appState.expandedNoteId = null;
  appState.editingNoteId = null;
  appState.noteEditorOpen = true;
  renderNotes();
  requestAnimationFrame(() => document.getElementById('note-title-input')?.focus());
}

export function editNote(id) {
  if (!getNotes().some(note => note.id === id)) return;
  const initialScrollTop = window.scrollY;
  const targetCard = Array.from(document.querySelectorAll('#notes-list .note-card')).find(
    element => element.dataset.noteId === id,
  );
  const startHeight = targetCard?.getBoundingClientRect().height || 0;
  resetNotePhotoDraft();
  appState.expandedNoteId = null;
  appState.editingNoteId = id;
  appState.noteEditorOpen = true;
  syncExpandedNoteCards({ animate: true });
  syncNoteEditor();
  positionNoteEditor();
  autoResizeNoteBody(document.getElementById('note-body-input'));
  const editor = document.getElementById('note-editor-card');
  if (targetCard && editor && startHeight > 0) {
    const endHeight = targetCard.getBoundingClientRect().height;
    animateNoteCardHeight(targetCard, startHeight, endHeight);
    if (shouldAnimateNoteCards()) {
      editor.animate(
        [
          { opacity: 0, transform: 'translateY(-10px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration: 520,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      );
    }
  }
  requestAnimationFrame(() => {
    document.getElementById('note-title-input')?.focus({ preventScroll: true });
    restoreScrollTop(initialScrollTop);
    const input = document.getElementById('note-title-input');
    const rect = input?.getBoundingClientRect();
    if (!rect || (rect.top >= 12 && rect.bottom <= window.innerHeight - 12)) return;
    input.scrollIntoView({ behavior: shouldAnimateNoteCards() ? 'smooth' : 'auto', block: 'center' });
  });
}

async function fadeInlineNoteEditorOut() {
  const editor = document.getElementById('note-editor-card');
  const card = editor?.closest('.note-card.is-editing');
  if (!editor || !card) return null;
  const snapshot = { id: card.dataset.noteId, height: card.getBoundingClientRect().height };
  if (!shouldAnimateNoteCards()) return snapshot;
  try {
    await editor.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-8px)' },
      ],
      {
        duration: 240,
        easing: 'cubic-bezier(0.4, 0, 1, 1)',
        fill: 'forwards',
      },
    ).finished;
  } catch {
    /* A replacement render can cancel this enhancement. */
  }
  return snapshot;
}

function animateNoteCardRestore(snapshot) {
  if (!snapshot) return;
  const card = Array.from(document.querySelectorAll('#notes-list .note-card')).find(
    element => element.dataset.noteId === snapshot.id,
  );
  if (!card) return;
  animateNoteCardHeight(card, snapshot.height, card.getBoundingClientRect().height);
  if (!shouldAnimateNoteCards()) return;
  card.querySelector('.note-card-content')?.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 380,
    delay: 80,
    easing: 'ease-out',
  });
}

export function closeNoteEditor() {
  const editor = document.getElementById('note-editor-card');
  const host = editor?.closest('.note-card.is-editing');
  const transitionSnapshot = host
    ? { id: host.dataset.noteId, height: host.getBoundingClientRect().height }
    : null;
  appState.noteEditorOpen = false;
  appState.editingNoteId = null;
  resetNotePhotoDraft();
  syncNoteEditor();
  restoreNoteEditorHome();
  animateNoteCardRestore(transitionSnapshot);
}

export function openNotePhotoPicker() {
  document.getElementById('note-photo-input')?.click();
}

export async function handleNotePhotoSelected(event) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    toast('離線狀態無法上傳圖片，請連上網路後再試');
    return;
  }
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return;
  if (!String(file.type || '').startsWith('image/')) {
    toast('請選擇圖片檔');
    input.value = '';
    return;
  }
  if (file.size > MAX_NOTE_PHOTO_BYTES) {
    toast('圖片檔案過大，請改選較小的照片');
    input.value = '';
    return;
  }

  try {
    const dataUrl = await fileToJpegDataUrl(file, { maxDim: 1600, quality: 0.82 });
    if (dataUrlByteLength(dataUrl) > MAX_NOTE_PHOTO_UPLOAD_BYTES) {
      toast('圖片壓縮後仍過大，請改選較小的照片');
      return;
    }
    notePhotoPendingChange = { kind: 'replace', dataUrl };
    syncNotePhotoEditor(editingNote());
  } catch {
    toast('圖片讀取失敗，請再試一次');
  } finally {
    input.value = '';
  }
}

export function removeNotePhoto() {
  notePhotoPendingChange = editingNote()?.photoUrl ? { kind: 'remove' } : null;
  syncNotePhotoEditor(editingNote());
}

function shouldAnimateNoteCards() {
  return (
    typeof window !== 'undefined' &&
    typeof Element !== 'undefined' &&
    typeof Element.prototype.animate === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function animateNoteCardHeight(card, startHeight, endHeight) {
  if (!shouldAnimateNoteCards() || Math.abs(endHeight - startHeight) < 1) return;
  const previous = noteCardAnimations.get(card);
  previous?.cancel();
  const animation = card.animate(
    [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
    {
      duration: NOTE_EXPAND_DURATION_MS,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  );
  noteCardAnimations.set(card, animation);
  const clear = () => {
    if (noteCardAnimations.get(card) === animation) noteCardAnimations.delete(card);
  };
  animation.addEventListener('finish', clear, { once: true });
  animation.addEventListener('cancel', clear, { once: true });
}

function syncExpandedNoteCards({ animate = false } = {}) {
  const notes = getNotes();
  const noteById = new Map(notes.map(note => [note.id, note]));
  const cards = Array.from(
    document.querySelectorAll('#notes-list .note-card[data-note-id]'),
  ).map(card => {
    const startHeight = card.getBoundingClientRect().height;
    const wasExpanded = card.classList.contains('is-expanded');
    noteCardAnimations.get(card)?.cancel();
    card.querySelector('.note-card-content')?.getAnimations().forEach(animation => {
      animation.cancel();
    });
    return {
      card,
      startHeight,
      wasExpanded,
      expanded:
        Boolean(noteById.get(card.dataset.noteId)?.forceExpanded) ||
        card.dataset.noteId === appState.expandedNoteId,
    };
  });

  for (const { card, expanded } of cards) {
    const note = noteById.get(card.dataset.noteId);
    const forceExpanded = Boolean(note?.forceExpanded);
    card.classList.toggle('is-expanded', expanded);
    card.classList.toggle('is-force-expanded', forceExpanded);
    card.setAttribute('aria-expanded', String(expanded));
    card.setAttribute(
      'aria-label',
      forceExpanded
        ? `固定展開記事：${note?.title || '未命名記事'}`
        : `${expanded ? '收合' : '展開完整'}記事：${note?.title || '未命名記事'}`,
    );
    if (forceExpanded) card.removeAttribute('tabindex');
    else card.setAttribute('tabindex', '0');
  }

  if (!animate || !shouldAnimateNoteCards()) return;
  for (const { card, startHeight, wasExpanded, expanded } of cards) {
    if (wasExpanded === expanded) continue;
    const endHeight = card.getBoundingClientRect().height;
    if (Math.abs(endHeight - startHeight) < 1) continue;
    animateNoteCardHeight(card, startHeight, endHeight);
  }
}

export function toggleNoteExpanded(id) {
  const note = getNotes().find(item => item.id === id);
  if (!note || note.forceExpanded) return;
  appState.expandedNoteId = appState.expandedNoteId === id ? null : id;
  syncExpandedNoteCards({ animate: true });
}

export function handleNoteCardKey(event, id) {
  if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  toggleNoteExpanded(id);
}

function pendingNotePhotoFields() {
  if (notePhotoPendingChange?.kind === 'replace') {
    return { photoDataUrl: notePhotoPendingChange.dataUrl, photoFileId: '' };
  }
  if (notePhotoPendingChange?.kind === 'remove') {
    return { photoDataUrl: '', photoFileId: '' };
  }
  return {};
}

function patchSyncedNotePhoto(id, photoUrl, photoFileId) {
  applyOptimisticPayload(
    {
      type: 'note',
      action: 'edit',
      id,
      photoUrl: photoUrl || '',
      photoFileId: photoFileId || '',
    },
    { pending: false },
  );
  saveCache();
}

export async function saveNote() {
  const title = document.getElementById('note-title-input')?.value || '';
  const body = document.getElementById('note-body-input')?.value || '';
  const pinned = Boolean(document.getElementById('note-pinned-input')?.checked);
  const forceExpanded = Boolean(document.getElementById('note-force-expanded-input')?.checked);
  if (!title.trim() && !body.trim()) {
    toast('請輸入標題或內容');
    document.getElementById('note-title-input')?.focus();
    return;
  }

  const editing = Boolean(appState.editingNoteId);
  const editingId = appState.editingNoteId;
  const hasPhotoChange = Boolean(notePhotoPendingChange);
  if (hasPhotoChange && typeof navigator !== 'undefined' && navigator.onLine === false) {
    toast('離線狀態無法上傳圖片，請連上網路後再試');
    return;
  }
  const basePayload = editing
    ? {
        type: 'note',
        action: 'edit',
        id: editingId,
        title: title.trim(),
        body: body.trim(),
        pinned,
        forceExpanded,
        updatedAt: Date.now(),
      }
    : createNote({ title, body, pinned, forceExpanded });
  const payload = { ...basePayload, ...pendingNotePhotoFields() };
  const snapshot = snapshotRows();
  const originalNote = snapshot.find(row => row?.type === 'note' && row.id === payload.id);
  const saveButton = document.getElementById('save-note-btn');
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = hasPhotoChange ? '上傳中…' : '儲存中…';
  }
  const transitionSnapshot = await fadeInlineNoteEditorOut();
  applyOptimisticPayload(payload);
  appState.noteEditorOpen = false;
  appState.editingNoteId = null;
  renderNotes();
  animateNoteCardRestore(transitionSnapshot);
  try {
    const syncTarget = appState.allRows.find(row => row && row.type === 'note' && row.id === payload.id) || null;
    const result = await postRow(payload, { syncTarget, allowQueue: !hasPhotoChange });
    if (hasPhotoChange && result.status === 'sent') {
      if (!result.media || !Object.prototype.hasOwnProperty.call(result.media, 'photoUrl')) {
        patchSyncedNotePhoto(payload.id, originalNote?.photoUrl, originalNote?.photoFileId);
        resetNotePhotoDraft();
        renderNotesList();
        toast('記事文字已儲存，但圖片需要先更新 GAS 後再試');
        return;
      }
      patchSyncedNotePhoto(payload.id, result.media.photoUrl, result.media.photoFileId);
    }
    resetNotePhotoDraft();
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
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = '儲存';
    }
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
  if (appState.expandedNoteId === id) appState.expandedNoteId = null;
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
