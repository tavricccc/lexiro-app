// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
/** Keep each reason attached to its option position while the option text changes. */
export function remapOptionReasons(
  previousOptions: readonly string[],
  nextOptions: readonly string[],
  reasons: Record<string, string> | undefined,
  answerIndex: number,
): Record<string, string> | undefined {
  if (!reasons) return undefined;
  const previous = new Map(
    Object.entries(reasons).map(([option, reason]) => [option.trim(), reason]),
  );
  const entries = nextOptions.flatMap((option, index) => {
    const key = option.trim();
    const reason = previous.get(previousOptions[index].trim());
    return index !== answerIndex && key && reason !== undefined
      ? [[key, reason] as const]
      : [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** Save and preview only current distractors with nonempty, trimmed explanations. */
export function normalizeOptionReasons(
  options: readonly string[],
  reasons: Record<string, string> | undefined,
  answerIndex: number,
): Record<string, string> | undefined {
  const mapped = remapOptionReasons(options, options, reasons, answerIndex);
  if (!mapped) return undefined;
  const entries = Object.entries(mapped).flatMap(([option, reason]) =>
    reason.trim() ? [[option, reason.trim()] as const] : [],
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}
