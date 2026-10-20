// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  LibraryQuestion,
  LibraryState,
  WordEntry,
  WordKey,
} from "@/core/types";
import { parseSenseKey, senseKey } from "@/core/lib/library";
import { questionBelongsToMemberships } from "@/core/lib/question-ownership";

/** A saved question keeps the set that owns all of its sources. */
export function questionSourceSetId(
  state: LibraryState,
  question: LibraryQuestion,
): string | undefined {
  return state.sets.find((set) =>
    questionBelongsToMemberships(question, state.memberships[set.id] ?? []),
  )?.id;
}

/** Retain only the selected set's words and membership senses. */
export function questionSourceWords(
  state: LibraryState,
  setId: string,
): Record<WordKey, WordEntry> {
  return Object.fromEntries(
    (state.memberships[setId] ?? []).flatMap((membership) => {
      const word = state.words[membership.wordKey];
      if (!word) return [];
      const senses = word.senses.filter((sense) =>
        membership.senseIds.includes(sense.id),
      );
      return senses.length ? [[word.wordKey, { ...word, senses }]] : [];
    }),
  );
}

export function questionSourceOptions(words: Record<WordKey, WordEntry>) {
  return Object.values(words).flatMap((word) =>
    word.senses.map((sense) => ({
      label: `${word.word} · ${sense.pos} ${sense.meaningZh}`,
      value: senseKey(word.wordKey, sense.id),
    })),
  );
}

/** Older manual drafts can recover a set only from their actual source keys. */
export function draftSourceSetId(
  state: LibraryState,
  sources: string[],
): string | undefined {
  const selected = sources.filter(Boolean);
  if (!selected.length) return undefined;
  const parsed = selected.map((source) => parseSenseKey(source, state.words));
  if (parsed.some((source) => !source)) return undefined;
  return state.sets.find((set) =>
    parsed.every((source) =>
      (state.memberships[set.id] ?? []).some(
        (membership) =>
          membership.wordKey === source!.wordKey &&
          membership.senseIds.includes(source!.senseId),
      ),
    ),
  )?.id;
}
