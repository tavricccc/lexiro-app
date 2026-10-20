// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
export const CLOUD_SCHEMA_VERSION = 9 as const;
/** Records read per query. One page covers a typical Library in a single round trip. */
export const CLOUD_RECORD_PAGE_SIZE = 400;
/** Rows are encoded as one JSON binding and applied by one atomic SQL batch. */
export const CLOUD_WRITE_BATCH_SIZE = 400;

