import { applyQueuedPayloadsToCurrentState } from '../current-state.js';

/**
 * 以 GAS 回傳為準；只保留「仍在 POST 佇列」且伺服端尚無同一事件的本機列（離線未送出）。
 * 無佇列背書的 _pendingSync 一律丟棄，避免本機與試算表不一致時還蓋過 GAS。
 *
 * @param {import('../model.js').LedgerRow[]} localSnapshot
 * @param {import('../model.js').LedgerRow[]} freshNormalized
 * @param {object[]} outboxPayloads
 */
export function mergeFreshWithOutboxBackedPending(localSnapshot, freshNormalized, outboxPayloads) {
  void localSnapshot;
  return applyQueuedPayloadsToCurrentState(freshNormalized, outboxPayloads);
}
