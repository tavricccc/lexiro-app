// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { StudyWord } from "@/core/types";
import { normalizeWordKey } from "@/core/lib/library";
import {
  seededRandom,
  seededShuffle,
  type QuestionItem,
} from "./practice-content";

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

/**
 * Each sense with its spelling and meaning split once, so choosing a
 * question's distractors costs a few lookups instead of a pass over the
 * whole library.
 */
interface Candidate {
  spelling: string;
  word: string;
  pos: string;
  meaning: string;
  key: string;
  parts: string[];
}

function toCandidates(words: readonly StudyWord[]): Candidate[] {
  return words.map((word) => ({
    spelling: normalizeWordKey(word.word),
    word: word.word.trim(),
    pos: word.pos.trim(),
    meaning: word.meaning.trim(),
    key: meaningKey(word.meaning),
    parts: meaningParts(word.meaning),
  }));
}

/** Random draws that usually find all three distractors. */
const QUICK_DRAWS = 24;

/**
 * Three distractors in a seeded random order: a few random draws first, then
 * one walk round the pool from a random start for whatever is still missing,
 * so a pool that has three acceptable distractors always yields them.
 */
function pickDistractors(
  candidates: readonly Candidate[],
  seed: string,
  accept: (candidate: Candidate) => boolean,
): Candidate[] {
  const random = seededRandom(seed);
  const picked: Candidate[] = [];
  const tried = new Set<number>();
  const consider = (index: number) => {
    if (tried.has(index)) return;
    tried.add(index);
    const candidate = candidates[index]!;
    if (accept(candidate)) picked.push(candidate);
  };
  for (let draw = 0; draw < QUICK_DRAWS && picked.length < 3; draw += 1)
    consider(Math.floor(random() * candidates.length));
  const start = Math.floor(random() * candidates.length);
  for (let step = 0; step < candidates.length && picked.length < 3; step += 1)
    consider((start + step) % candidates.length);
  return picked;
}

/**
 * What the answer reveals: the sense's textbook notes, and what each wrong
 * option means, so a miss shows the word you mixed it up with.
 */
function revealed(
  word: StudyWord,
  distractors: readonly Candidate[],
  gloss: (other: Candidate) => [option: string, note: string],
): Pick<QuestionItem, "explanation" | "whyWrong"> {
  const explanation = word.description.trim();
  return {
    ...(explanation ? { explanation } : {}),
    whyWrong: Object.fromEntries(distractors.map(gloss)),
  };
}

/** Every sense may supply the answer, but none may appear as a distractor. */
export function buildMeaningQuestionGroups(
  words: readonly StudyWord[],
): QuestionItem[][] {
  const candidates = toCandidates(words);
  const byWord = new Map<string, StudyWord[]>();
  const excludedBySpelling = new Map<string, Set<string>>();
  words.forEach((word, index) => {
    const senses = byWord.get(word.wordKey) ?? [];
    senses.push(word);
    byWord.set(word.wordKey, senses);
    const { spelling, parts } = candidates[index]!;
    const excluded = excludedBySpelling.get(spelling) ?? new Set<string>();
    parts.forEach((part) => excluded.add(part));
    excludedBySpelling.set(spelling, excluded);
  });
  return words.flatMap((word, index) => {
    const senses = byWord.get(word.wordKey)!;
    const acceptedMeanings = [
      ...new Set(senses.map((sense) => sense.meaning.trim())),
    ];
    const { spelling } = candidates[index]!;
    const excluded = excludedBySpelling.get(spelling)!;
    const seen = new Set<string>();
    const distractors = pickDistractors(
      candidates,
      `meaning:${word.id}:distractors`,
      (other) => {
        if (
          other.spelling === spelling ||
          !other.key ||
          !other.parts.length ||
          other.parts.some((part) => excluded.has(part)) ||
          seen.has(other.key)
        )
          return false;
        seen.add(other.key);
        return true;
      },
    );
    if (distractors.length !== 3) return [];
    const id = `meaning:${word.id}`;
    const options = seededShuffle(
      [word.meaning.trim(), ...distractors.map((other) => other.meaning)],
      id,
    );
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
          ...revealed(word, distractors, (other) => [other.meaning, other.word]),
        },
      ],
    ];
  });
}

/** 中選英: the Chinese meaning asks for one of four English words. */
export function buildReverseQuestionGroups(
  words: readonly StudyWord[],
): QuestionItem[][] {
  const candidates = toCandidates(words);
  return words.flatMap((word, index) => {
    const answer = word.word.trim();
    const { spelling } = candidates[index]!;
    const parts = new Set(candidates[index]!.parts);
    if (!answer || !parts.size) return [];
    const seen = new Set<string>([spelling]);
    const distractors = pickDistractors(
      candidates,
      `reverse:${word.id}:distractors`,
      (other) => {
        if (!other.spelling || seen.has(other.spelling)) return false;
        // A synonym would be a second right answer.
        if (other.parts.some((part) => parts.has(part))) return false;
        seen.add(other.spelling);
        return true;
      },
    );
    if (distractors.length !== 3) return [];
    const id = `reverse:${word.id}`;
    const options = seededShuffle(
      [answer, ...distractors.map((other) => other.word)],
      id,
    );
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
          ...revealed(word, distractors, (other) => [
            other.word,
            [other.pos, other.meaning].filter(Boolean).join(" "),
          ]),
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
