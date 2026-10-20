// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { StudyWord } from "@/core/types";
import { normalizeWordKey } from "@/core/lib/library";
import { seededShuffle, type QuestionItem } from "./practice-content";

/** Ignore presentation punctuation when comparing saved Chinese meanings. */
function meaningKey(meaning: string): string {
  return meaning.normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "");
}

function meaningParts(meaning: string): string[] {
  return meaning
    .split(/[，、；;／/]|(?:\s+或\s+)/u)
    .map(meaningKey)
    .filter(Boolean);
}

/** Every sense may supply the answer, but none may appear as a distractor. */
export function buildMeaningQuestionGroups(
  words: readonly StudyWord[],
): QuestionItem[][] {
  const byWord = new Map<string, StudyWord[]>();
  const excludedBySpelling = new Map<string, Set<string>>();
  for (const word of words) {
    const senses = byWord.get(word.wordKey) ?? [];
    senses.push(word);
    byWord.set(word.wordKey, senses);
    const spelling = normalizeWordKey(word.word);
    const excluded = excludedBySpelling.get(spelling) ?? new Set<string>();
    meaningParts(word.meaning).forEach((part) => excluded.add(part));
    excludedBySpelling.set(spelling, excluded);
  }
  return words.flatMap((word) => {
    const senses = byWord.get(word.wordKey)!;
    const acceptedMeanings = [
      ...new Set(senses.map((sense) => sense.meaning.trim())),
    ];
    const spelling = normalizeWordKey(word.word);
    const excluded = excludedBySpelling.get(spelling)!;
    const seen = new Set<string>();
    const distractors = seededShuffle(
      [...words],
      `meaning:${word.id}:distractors`,
    )
      .filter((other) => {
        if (normalizeWordKey(other.word) === spelling) return false;
        const key = meaningKey(other.meaning);
        const parts = meaningParts(other.meaning);
        if (
          !key ||
          !parts.length ||
          parts.some((part) => excluded.has(part)) ||
          seen.has(key)
        )
          return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3)
      .map((other) => other.meaning.trim());
    if (distractors.length !== 3) return [];
    const id = `meaning:${word.id}`;
    const options = seededShuffle([word.meaning.trim(), ...distractors], id);
    return [
      [
        {
          id,
          question: null,
          prompt: word.word,
          options,
          answerIndex: options.indexOf(word.meaning.trim()),
          wordKey: word.wordKey,
          senseId: word.id,
          type: "meaning" as const,
          difficulty: 1 as const,
          meaning: acceptedMeanings.join("；"),
          acceptedMeanings,
        },
      ],
    ];
  });
}

/** 中選英: the Chinese meaning asks for one of four English words. */
export function buildReverseQuestionGroups(
  words: readonly StudyWord[],
): QuestionItem[][] {
  return words.flatMap((word) => {
    const answer = word.word.trim();
    const spelling = normalizeWordKey(word.word);
    const parts = new Set(meaningParts(word.meaning));
    if (!answer || !parts.size) return [];
    const seen = new Set<string>([spelling]);
    const distractors = seededShuffle(
      [...words],
      `reverse:${word.id}:distractors`,
    )
      .filter((other) => {
        const key = normalizeWordKey(other.word);
        if (!key || seen.has(key)) return false;
        // A synonym would be a second right answer.
        if (meaningParts(other.meaning).some((part) => parts.has(part)))
          return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3)
      .map((other) => other.word.trim());
    if (distractors.length !== 3) return [];
    const id = `reverse:${word.id}`;
    const options = seededShuffle([answer, ...distractors], id);
    return [
      [
        {
          id,
          question: null,
          prompt: word.meaning.trim(),
          options,
          answerIndex: options.indexOf(answer),
          wordKey: word.wordKey,
          senseId: word.id,
          type: "reverse" as const,
          difficulty: 1 as const,
          meaning: word.meaning.trim(),
        },
      ],
    ];
  });
}

/** Local word tasks built from the library, not saved questions. */
export function isWordTask(task: string | undefined): boolean {
  return task === "meaning" || task === "reverse";
}

export function isCorrectChoice(item: QuestionItem, choice: number): boolean {
  if (item.type !== "meaning") return choice === item.answerIndex;
  const option = item.options[choice];
  return (
    option !== undefined &&
    Boolean(
      item.acceptedMeanings?.some(
        (meaning) => meaningKey(meaning) === meaningKey(option),
      ),
    )
  );
}
