// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
declare const brand: unique symbol

/**
 * Marks a primitive as a specific kind of value. The mark exists only in the
 * type system, so a branded value is the primitive at runtime, but a plain
 * string can no longer be passed — or used as a key — where a specific kind of
 * id is expected.
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B }
