// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
/** Clone JSON-safe data before crossing persistence or worker boundaries. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
