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

export function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
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
