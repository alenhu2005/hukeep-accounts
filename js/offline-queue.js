export { mergeFreshWithOutboxBackedPending } from './sync/merge.js';
export { pendingEventIdentity, clearPendingSyncForPayload } from './sync/pending.js';
export {
  readPostOutbox,
  writePostOutbox,
  postOutboxLength,
  clonePayloadForOutbox,
  enqueuePostOutbox,
  dequeuePostOutboxHead,
  peekPostOutboxHead,
} from './sync/outbox-storage.js';

import { pruneStalePendingSyncFlags as pruneStalePendingSyncFlagsBase } from './sync/pending.js';
import { readPostOutbox } from './sync/outbox-storage.js';

export function pruneStalePendingSyncFlags(allRows) {
  return pruneStalePendingSyncFlagsBase(allRows, readPostOutbox());
}
