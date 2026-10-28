// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

let lenientReads = 0;

/**
 * Runs a read of stored data that tolerates fields this version does not
 * know. Data written by a newer version then loses only what it added,
 * instead of failing the whole read: one unknown field on one word would
 * otherwise stop a sync or a shared set from loading at all. Input that is
 * authored now, an Agent write or an imported file, stays strict so a
 * misspelled field is reported rather than dropped.
 */
export function ignoringUnknownKeys<T>(read: () => T): T {
  lenientReads += 1;
  try {
    return read();
  } finally {
    lenientReads -= 1;
  }
}

export function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  if (lenientReads) return;
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length)
    throw new Error(`${field} 包含不支援欄位：${unknown.join("、")}`);
}

export function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`缺少 ${field}`);
  return value.trim();
}

export function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${field} 格式錯誤`);
  return value;
}

export function requiredObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`缺少 ${field}`);
  return value;
}
