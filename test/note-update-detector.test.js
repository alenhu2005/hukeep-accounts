import { describe, expect, it } from 'vitest';
import { createNoteUpdateDetector } from '../js/note-update-detector.js';

function note(id, title, updatedAt = 1) {
  return {
    type: 'note',
    action: 'add',
    id,
    title,
    body: '',
    pinned: false,
    forceExpanded: false,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('note update sync detector', () => {
  it('seeds an empty first sync without reporting historical notes', () => {
    const detector = createNoteUpdateDetector([]);

    expect(detector.inspect([], [note('old', '舊記事')])).toEqual([]);
    expect(
      detector
        .inspect([note('old', '舊記事')], [note('old', '舊記事'), note('new', '新記事', 2)])
        .map((item) => item.id),
    ).toEqual(['new']);
  });

  it('reports notes added to a cached local baseline on the first server sync', () => {
    const cached = [note('cached', '已看過')];
    const detector = createNoteUpdateDetector(cached);

    expect(
      detector
        .inspect(cached, [...cached, note('remote', '其他人新增', 20)])
        .map((item) => item.id),
    ).toEqual(['remote']);
  });

  it('does not report an optimistic local note that already existed before sync', () => {
    const detector = createNoteUpdateDetector([note('base', '原本')]);
    detector.inspect([note('base', '原本')], [note('base', '原本')]);
    const beforeSync = [note('base', '原本'), note('local', '自己新增', 30)];

    expect(detector.inspect(beforeSync, beforeSync)).toEqual([]);
  });

  it('reports a remote edit but suppresses the same edit when it was already applied locally', () => {
    const original = note('shared', '原標題', 10);
    const detector = createNoteUpdateDetector([original]);
    detector.inspect([original], [original]);
    const remoteEdit = note('shared', '其他人修改', 20);

    expect(detector.inspect([original], [remoteEdit]).map((item) => item.id)).toEqual(['shared']);

    const localEdit = note('shared', '自己修改', 30);
    expect(detector.inspect([localEdit], [localEdit])).toEqual([]);
  });

  it('reports a remote fixed-expansion setting change', () => {
    const original = note('shared', '共享記事', 10);
    const detector = createNoteUpdateDetector([original]);
    detector.inspect([original], [original]);
    const remoteEdit = { ...original, forceExpanded: true };

    expect(detector.inspect([original], [remoteEdit]).map(item => item.id)).toEqual(['shared']);
  });

  it('sorts multiple new notes by update time and does not report them twice', () => {
    const base = [note('base', '原本')];
    const fresh = [...base, note('older', '較早', 10), note('latest', '最新', 40)];
    const detector = createNoteUpdateDetector(base);

    expect(detector.inspect(base, fresh).map((item) => item.id)).toEqual(['latest', 'older']);
    expect(detector.inspect(fresh, fresh)).toEqual([]);
  });
});
