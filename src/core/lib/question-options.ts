// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { GeneratedQuestionKind, PassageFormat } from "@/core/types";

import { t, type TranslationKey } from "@/core/lib/i18n";

/**
 * The question type and difficulty lists are read on five screens: practice
 * setup, the questions filter bar, both editors and the generator. They live
 * here so the same format never shows up as "詞彙題" on one screen and
 * "英文四選一" on the next, and so adding a format is a one-line change.
 *
 * The names are the ones a Taiwanese student sees on a real paper, and the
 * order follows the 學測 paper: 詞彙題, 綜合測驗, 文意選填, 篇章結構, 閱讀測驗,
 */

interface LabelledOption {
  label: string;
  value: string;
  description?: string;
}

const DIFFICULTY_KEYS = [
  "questions.difficultyEasy",
  "questions.difficultyMedium",
  "questions.difficultyHard",
] as const satisfies readonly TranslationKey[];

/** Paper order, with the label and the one-line explanation of each format. */
const FORMAT_KEYS = {
  vocabulary: ["questions.vocabulary", "questions.vocabularyHint"],
  cloze: ["questions.cloze", "questions.clozeHint"],
  wordBank: ["questions.wordBank", "questions.wordBankHint"],
  discourse: ["questions.discourse", "questions.discourseHint"],
  reading: ["questions.reading", "questions.readingHint"],
} as const satisfies Record<
  GeneratedQuestionKind,
  readonly [TranslationKey, TranslationKey]
>;

export const SENTENCE_STYLES = ["vocabulary"] as const;
export const PASSAGE_FORMAT_VALUES: PassageFormat[] = [
  "cloze",
  "wordBank",
  "discourse",
  "reading",
];

export function difficultyLabel(level: number): string {
  const key = DIFFICULTY_KEYS[level - 1];
  return key ? t(key) : t("practice.difficulty");
}

export function questionFormatLabel(format: string): string {
  if (format === "grammar") return t("questions.retiredGrammar");
  if (format === "meaning") return t("practice.taskMeaning");
  if (format === "reverse") return t("practice.taskReverse");
  const entry = FORMAT_KEYS[format as GeneratedQuestionKind];
  return entry ? t(entry[0]) : format;
}

export function questionFormatHint(format: GeneratedQuestionKind): string {
  return t(FORMAT_KEYS[format][1]);
}

/** The work the AI does that is not a question format, named the same way. */
const JOB_KEYS = {
  words: "jobs.words",
  organizeText: "jobs.organizeText",
  organizeImage: "jobs.organizeImage",
  explain: "jobs.explain",
} as const satisfies Record<string, TranslationKey>;

/**
 * Every kind of billable AI work under one name, questions included.
 *
 * The administrator's cost report lists question formats beside word
 * generation and list tidying, and they should read as the same kind of thing
 * there, because to the ledger they are.
 */
export function jobKindLabel(kind: string): string {
  const job = JOB_KEYS[kind as keyof typeof JOB_KEYS];
  return job ? t(job) : questionFormatLabel(kind);
}

export function difficultyOptions(allLabel?: string): LabelledOption[] {
  const options = DIFFICULTY_KEYS.map((key, index) => ({
    label: t(key),
    value: String(index + 1),
  }));
  return allLabel ? [{ label: allLabel, value: "all" }, ...options] : options;
}

function formatOptions(
  values: readonly GeneratedQuestionKind[],
): LabelledOption[] {
  return values.map((value) => ({
    description: questionFormatHint(value),
    label: questionFormatLabel(value),
    value,
  }));
}

/**
 * The formats worth offering as a filter.
 *
 * A filter is a way of narrowing what is in front of you, so a format nothing
 * in range was written in is not a choice — it is a dead end that always
 * returns nothing. `present` is the set of formats actually held by whatever is
 * being filtered; omit it to list every format, which is what the generator
 * needs, since it is creating the material rather than narrowing it.
 */
export function questionFormatOptions(
  allLabel?: string,
  present?: ReadonlySet<string>,
): LabelledOption[] {
  const values = [...SENTENCE_STYLES, ...PASSAGE_FORMAT_VALUES].filter(
    (format) => !present || present.has(format),
  );
  const options = formatOptions(values);
  return allLabel ? [{ label: allLabel, value: "all" }, ...options] : options;
}
