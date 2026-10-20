// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { SetMembership, WordEntry, WordKey } from "@/core/types";

export function sanitizeMemberships(
  memberships: SetMembership[],
  words: Record<WordKey, WordEntry>,
): SetMembership[] {
  const byWord = new Map<WordKey, SetMembership>();
  for (const membership of memberships) {
    const wordKey = membership.wordKey;
    const word = words[wordKey];
    if (
      !word ||
      !Array.isArray(word.senses) ||
      !Array.isArray(membership.senseIds)
    )
      continue;
    const senseIds = Array.from(new Set(membership.senseIds)).filter(
      (senseId) => word.senses.some((sense) => sense.id === senseId),
    );
    if (!senseIds.length) continue;
    const existing = byWord.get(wordKey);
    byWord.set(
      wordKey,
      existing
        ? {
            wordKey,
            senseIds: Array.from(new Set([...existing.senseIds, ...senseIds])),
          }
        : { wordKey, senseIds },
    );
  }
  return Array.from(byWord.values());
}
