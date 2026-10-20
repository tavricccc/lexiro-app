// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { QuestionKind } from "./index";

type Difficulty = 1 | 2 | 3;

export const READING_SKILLS = [
  "mainIdea",
  "detail",
  "inference",
  "reference",
  "vocabulary",
] as const;

export interface QuestionLengthRange {
  min: number;
  max: number;
}

/**
 * Lexiro's editorial ranges, informed by CEEC's 180–400-word passage guidance.
 * Sentence ranges and the per-level subdivisions are product choices, not
 * official exam limits. Count the complete text before cutting answer blanks.
 */
const QUESTION_LENGTHS: Record<
  QuestionKind,
  Record<Difficulty, QuestionLengthRange>
> = {
  vocabulary: {
    1: { min: 18, max: 32 },
    2: { min: 24, max: 40 },
    3: { min: 28, max: 48 },
  },
  cloze: {
    1: { min: 180, max: 220 },
    2: { min: 200, max: 260 },
    3: { min: 230, max: 300 },
  },
  wordBank: {
    1: { min: 200, max: 260 },
    2: { min: 240, max: 320 },
    3: { min: 280, max: 360 },
  },
  discourse: {
    1: { min: 220, max: 280 },
    2: { min: 260, max: 340 },
    3: { min: 300, max: 400 },
  },
  reading: {
    1: { min: 180, max: 240 },
    2: { min: 240, max: 320 },
    3: { min: 300, max: 400 },
  },
};

export function questionLengthRange(
  kind: QuestionKind,
  difficulty: Difficulty,
): QuestionLengthRange {
  return QUESTION_LENGTHS[kind][difficulty];
}

/** Contractions and hyphenated forms count once; blank labels do not count. */
export function countEnglishWords(value: string): number {
  return (
    value
      .replace(/__\d+__|_____/g, "")
      .match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) ?? []
  ).length;
}
