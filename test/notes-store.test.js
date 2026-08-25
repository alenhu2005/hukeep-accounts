import { describe, expect, it } from 'vitest';
import {
  createNote,
  filterNotes,
  getNotesFromRows,
  removeNote,
  sortNotes,
  toggleNotePinned,
  updateNote,
} from '../js/notes-store.js';

describe('notes store', () => {
  it('creates a trimmed note with stable timestamps', () => {
    const note = createNote(
      { title: '  採買清單  ', body: '  牛奶\n雞蛋  ' },
      { now: 1_723_456_789_000, idFactory: () => 'note-1' },
    );

    expect(note).toEqual({
      type: 'note',
      action: 'add',
      id: 'note-1',
      title: '採買清單',
      body: '牛奶\n雞蛋',
      pinned: false,
      createdAt: 1_723_456_789_000,
      updatedAt: 1_723_456_789_000,
    });
  });

  it('rejects an empty note', () => {
    expect(() => createNote({ title: '  ', body: '\n ' })).toThrow('EMPTY_NOTE');
  });

  it('updates immutably and keeps the original creation time', () => {
    const original = createNote(
      { title: '舊標題', body: '內容' },
      { now: 100, idFactory: () => 'note-1' },
    );

    const notes = updateNote([original], 'note-1', { title: '新標題', pinned: true }, 200);

    expect(notes[0]).toMatchObject({
      title: '新標題',
      body: '內容',
      pinned: true,
      createdAt: 100,
      updatedAt: 200,
    });
    expect(original).toMatchObject({ title: '舊標題', pinned: false, updatedAt: 100 });
  });

  it('pins, removes, and sorts pinned notes before recent notes', () => {
    const notes = [
      { id: 'a', title: 'A', body: '', pinned: false, createdAt: 1, updatedAt: 30 },
      { id: 'b', title: 'B', body: '', pinned: true, createdAt: 2, updatedAt: 10 },
      { id: 'c', title: 'C', body: '', pinned: false, createdAt: 3, updatedAt: 20 },
    ];

    const pinned = toggleNotePinned(notes, 'c', 40);
    expect(sortNotes(pinned).map(note => note.id)).toEqual(['c', 'b', 'a']);
    expect(removeNote(pinned, 'b').map(note => note.id)).toEqual(['a', 'c']);
  });

  it('searches title and multiline body without case sensitivity', () => {
    const notes = [
      { id: 'a', title: 'Travel Plan', body: '東京車票', pinned: false, createdAt: 1, updatedAt: 1 },
      { id: 'b', title: '採買', body: '牛奶\n雞蛋', pinned: false, createdAt: 1, updatedAt: 1 },
    ];

    expect(filterNotes(notes, 'travel').map(note => note.id)).toEqual(['a']);
    expect(filterNotes(notes, '雞蛋').map(note => note.id)).toEqual(['b']);
  });

  it('selects valid note rows and ignores unrelated or malformed rows', () => {
    expect(getNotesFromRows([
      { type: 'note', id: 'ok', title: '保留', body: '', pinned: 1, createdAt: 10, updatedAt: 20 },
      { type: 'note', title: '沒有 id', body: '忽略' },
      { type: 'daily', id: 'daily-1', item: '不是記事' },
    ])).toEqual([
      {
        type: 'note',
        action: 'add',
        id: 'ok',
        title: '保留',
        body: '',
        pinned: true,
        createdAt: 10,
        updatedAt: 20,
      },
    ]);
  });

  it('保留同步自 GAS 的記事圖片資料', () => {
    const [note] = getNotesFromRows([
      {
        type: 'note',
        id: 'with-photo',
        title: '租屋紀錄',
        body: '客廳現況',
        photoUrl: 'https://lh3.googleusercontent.com/d/photo-1',
        photoFileId: 'photo-1',
        createdAt: 10,
        updatedAt: 20,
      },
    ]);

    expect(note).toMatchObject({
      photoUrl: 'https://lh3.googleusercontent.com/d/photo-1',
      photoFileId: 'photo-1',
    });
  });
});
