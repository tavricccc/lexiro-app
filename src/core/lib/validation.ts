// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
export function containsHan(value: string): boolean {
  return /[\u3400-\u9FFF]/u.test(value);
}
