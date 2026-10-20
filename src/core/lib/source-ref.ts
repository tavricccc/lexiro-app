// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
export function createSourceRef(index: number, childIndex?: number): string {
  const sourceRef = `source-${index + 1}`;
  return childIndex === undefined
    ? sourceRef
    : `${sourceRef}-${childIndex + 1}`;
}
