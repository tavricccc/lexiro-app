// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { LibraryQuestion, LibraryState, WordEntry } from "@/core/types";

/** Callers supply the displayed senses and a trimmed, lowercase needle. */
export function wordMatchesQuery(
  word: Pick<WordEntry, "word" | "senses">,
  needle: string,
) {
  return (
    word.word.toLocaleLowerCase().includes(needle) ||
    word.senses.some(
      (sense) =>
        sense.meaningZh.toLocaleLowerCase().includes(needle) ||
        sense.examples.some((example) =>
          example.toLocaleLowerCase().includes(needle),
        ),
    )
  );
}

/** Search the whole question or pack, including child and shared options. */
export function questionMatchesQuery(
  question: LibraryQuestion,
  needle: string,
) {
  if (!needle) return true;
  const texts =
    question.kind === "reading"
      ? [
          question.title,
          question.passage,
          ...(question.optionBank ?? []),
          ...question.questions.flatMap((child) => [
            child.prompt,
            ...child.options,
          ]),
        ]
      : [question.prompt, ...question.options];
  return texts.some((text) => text.toLocaleLowerCase().includes(needle));
}

/** Search only the senses that a set actually displays and exports. */
export function setMatchesQuery(
  state: LibraryState,
  setId: string,
  needle: string,
) {
  return (state.memberships[setId] ?? []).some((membership) => {
    const word = state.words[membership.wordKey];
    return word
      ? wordMatchesQuery(
          {
            word: word.word,
            senses: word.senses.filter((sense) =>
              membership.senseIds.includes(sense.id),
            ),
          },
          needle,
        )
      : false;
  });
}
