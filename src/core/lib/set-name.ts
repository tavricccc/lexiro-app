// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
export function createUniqueSetName(
  baseName: string,
  existingNames: Iterable<string>,
): string {
  const usedNames = new Set(
    Array.from(existingNames, (name) => name.trim().toLocaleLowerCase()),
  );
  const normalizedBaseName = baseName.trim();
  if (!usedNames.has(normalizedBaseName.toLocaleLowerCase()))
    return normalizedBaseName;

  let index = 2;
  while (usedNames.has(`${normalizedBaseName} (${index})`.toLocaleLowerCase()))
    index += 1;
  return `${normalizedBaseName} (${index})`;
}
