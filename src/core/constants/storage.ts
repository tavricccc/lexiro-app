// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
export const AI_PREFERENCES_STORAGE_KEY = "lexiro_ai_preferences";
export const SYNC_JOURNAL_STORAGE_KEY = "lexiro_sync_journal";
export const CLOUD_SYNC_PENDING_EVENT = "lexiro:sync-pending";
export const PRACTICE_SESSION_STORAGE_KEY = "lexiro-practice-session-v3";
/** Fired when another device's practice session replaced this device's draft. */
export const PRACTICE_DRAFT_REMOTE_EVENT = "lexiro:practice-draft-remote";

/**
 * Keys whose value belongs to one signed-in account. They are read through
 * `resolveKey` in `persist.ts`, which prefixes them with the active namespace so
 * switching accounts cannot mix two people's data.
 */
export const NAMESPACE_SCOPED_KEYS: readonly string[] = [
  AI_PREFERENCES_STORAGE_KEY,
  SYNC_JOURNAL_STORAGE_KEY,
];
