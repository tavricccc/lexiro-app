// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isSameLocalDay(first: Date, second: Date): boolean {
  return localDateKey(first) === localDateKey(second);
}
