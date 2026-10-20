// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { createMutationQueue } from "./mutation-queue";

/** Account changes and operations spanning both stores must finish in order. */
const queue = createMutationQueue();
export const serializeAccountDataAction = queue.serial;
export const flushAccountDataActions = queue.flush;
