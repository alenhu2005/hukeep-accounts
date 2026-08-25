import { appState } from './state.js';

function cleanText(value) {
  return String(value ?? '').trim();
}

function validTimestamp(value, fallback = 0) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : fallback;
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  const normalized = cleanText(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
}

export function normalizeNote(value) {
  if (!value || typeof value !== 'object') return null;
  const id = cleanText(value.id);
  const title = cleanText(value.title);
  const body = cleanText(value.body);
  const photoUrl = cleanText(value.photoUrl);
  const photoFileId = cleanText(value.photoFileId);
  if (!id || (!title && !body)) return null;
  const createdAt = validTimestamp(value.createdAt);
  const updatedAt = validTimestamp(value.updatedAt, createdAt);
  return {
    type: 'note',
    action: 'add',
    id,
    title,
    body,
    pinned: toBool(value.pinned),
    createdAt,
    updatedAt,
    ...(photoUrl ? { photoUrl, photoFileId } : {}),
    ...(value._pendingSync ? { _pendingSync: true } : {}),
  };
}

function defaultIdFactory() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createNote(input, options = {}) {
  const title = cleanText(input?.title);
  const body = cleanText(input?.body);
  if (!title && !body) throw new Error('EMPTY_NOTE');
  const now = validTimestamp(options.now ?? Date.now());
  const idFactory = options.idFactory || defaultIdFactory;
  return {
    type: 'note',
    action: 'add',
    id: cleanText(idFactory()),
    title,
    body,
    pinned: Boolean(input?.pinned),
    createdAt: now,
    updatedAt: now,
  };
}

export function updateNote(notes, id, patch, now = Date.now()) {
  const targetId = cleanText(id);
  return notes.map(note => {
    if (note.id !== targetId) return { ...note };
    const title = 'title' in patch ? cleanText(patch.title) : note.title;
    const body = 'body' in patch ? cleanText(patch.body) : note.body;
    if (!title && !body) throw new Error('EMPTY_NOTE');
    return {
      ...note,
      title,
      body,
      pinned: 'pinned' in patch ? Boolean(patch.pinned) : note.pinned,
      ...('photoUrl' in patch
        ? cleanText(patch.photoUrl)
          ? { photoUrl: cleanText(patch.photoUrl), photoFileId: cleanText(patch.photoFileId) }
          : { photoUrl: '', photoFileId: '' }
        : {}),
      updatedAt: validTimestamp(now, note.updatedAt),
    };
  });
}

export function toggleNotePinned(notes, id, now = Date.now()) {
  const target = notes.find(note => note.id === id);
  if (!target) return notes.map(note => ({ ...note }));
  return updateNote(notes, id, { pinned: !target.pinned }, now);
}

export function removeNote(notes, id) {
  return notes.filter(note => note.id !== id).map(note => ({ ...note }));
}

export function sortNotes(notes) {
  return notes
    .map(note => ({ ...note }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

export function filterNotes(notes, query) {
  const normalizedQuery = cleanText(query).toLocaleLowerCase('zh-TW');
  if (!normalizedQuery) return notes.map(note => ({ ...note }));
  return notes
    .filter(note => `${note.title}\n${note.body}`.toLocaleLowerCase('zh-TW').includes(normalizedQuery))
    .map(note => ({ ...note }));
}

export function getNotesFromRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row && row.type === 'note')
    .map(normalizeNote)
    .filter(Boolean);
}

export function getNotes() {
  return getNotesFromRows(appState.allRows);
}
