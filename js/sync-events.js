export const LEDGER_ROWS_SYNCED_EVENT = 'ledger:rows-synced';

export function emitRowsSynced(previousRows, freshRows) {
  if (
    typeof window === 'undefined' ||
    typeof window.dispatchEvent !== 'function' ||
    typeof CustomEvent === 'undefined'
  ) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(LEDGER_ROWS_SYNCED_EVENT, {
      detail: { previousRows, freshRows },
    }),
  );
}
