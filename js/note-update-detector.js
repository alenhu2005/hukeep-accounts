import { getNotesFromRows, sortNotes } from './notes-store.js';

function noteSignature(note) {
  return JSON.stringify({
    title: note.title,
    body: note.body,
    pinned: note.pinned,
    forceExpanded: note.forceExpanded,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    photoUrl: note.photoUrl || '',
    photoFileId: note.photoFileId || '',
  });
}

function noteSignatures(rows) {
  return new Map(getNotesFromRows(rows).map((note) => [note.id, noteSignature(note)]));
}

/**
 * Tracks notes already visible on this client and returns notes introduced or
 * changed by a later server sync. The first empty baseline is seeded silently
 * so a new browser does not announce every historical note.
 */
export function createNoteUpdateDetector(initialRows = []) {
  let syncedOnce = false;
  let knownSignatures = noteSignatures(initialRows);

  return {
    inspect(previousRows, freshRows) {
      const previousSignatures = noteSignatures(previousRows);
      const freshNotes = sortNotes(getNotesFromRows(freshRows));
      const hasReliableBaseline =
        syncedOnce || previousSignatures.size > 0 || knownSignatures.size > 0;
      const changed = hasReliableBaseline
        ? freshNotes.filter((note) => {
            const freshSignature = noteSignature(note);
            return (
              freshSignature !== knownSignatures.get(note.id) &&
              freshSignature !== previousSignatures.get(note.id)
            );
          })
        : [];

      knownSignatures = new Map(freshNotes.map((note) => [note.id, noteSignature(note)]));
      syncedOnce = true;
      return changed;
    },
  };
}
