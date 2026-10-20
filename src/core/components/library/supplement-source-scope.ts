// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { WordEntry, WordKey } from "@/core/types";
import { normalizeWordKey } from "@/core/lib/library";

/** Old supplement selections used spelling keys; aliases belong only to this set. */
export function rebindSupplementSources(
  chosen: WordKey[],
  words: Pick<WordEntry, "wordKey" | "word">[],
) {
  const aliases = new Map<WordKey, WordKey>(
    words.flatMap((word) => [
      [word.wordKey, word.wordKey],
      [normalizeWordKey(word.word), word.wordKey],
    ]),
  );
  const missing = chosen.filter((key) => !aliases.has(key));
  const selected = [
    ...new Set(
      chosen.flatMap((key) => {
        const scoped = aliases.get(key);
        return scoped ? [scoped] : [];
      }),
    ),
  ];
  return { selected, missing };
}
