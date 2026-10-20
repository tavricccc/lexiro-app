// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
/**
 * `Object.keys` and `Object.entries` widen every key to `string`, which throws
 * away the id type of a record keyed by `WordKey` or `SenseId`. These wrappers
 * keep it, so iterating a record still produces ids rather than bare strings.
 */
export function keysOf<K extends string, V>(record: Record<K, V>): K[] {
  return Object.keys(record) as K[];
}

export function entriesOf<K extends string, V>(record: Record<K, V>): [K, V][] {
  return Object.entries(record) as [K, V][];
}
