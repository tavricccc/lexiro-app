// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
/**
 * What the sync indicator can say. Six further states used to be declared here
 * — preparing, downloading, reconciling, uploading, retrying, verifying — that
 * nothing ever set; the indicator matched on them and they never arrived.
 */
export type SyncStatus =
  | "disabled"
  | "signed-out"
  | "connecting"
  | "syncing"
  | "synced"
  | "offline"
  | "error";
