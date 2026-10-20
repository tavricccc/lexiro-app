// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { QuestionKind as GeneratedQuestionKind } from "./index";
type PassageFormat = Exclude<GeneratedQuestionKind, "vocabulary">;
type QuestionStyle = "vocabulary";

/**
 * The shapes Lexiro generates, modelled on the papers a Taiwanese senior high
 * student actually sits: the five 學測 selection formats.
 *
 * Everything downstream reads this table rather than hard-coding counts — the
 * prompt builder, the response validator, the practice runtime and the UI — so
 * "how many blanks does 篇章結構 have" has exactly one answer in the codebase.
 *
 * Counts follow the 115 學年度 paper. A final batch with fewer source senses
 * may have fewer blanks; it keeps the passage length and full option bank:
 *
 *  - 詞彙題      一句一格，四選一。學測 10 題。
 *  - 綜合測驗    一篇短文數格，每格自己的四個選項。學測每篇 5 格。
 *  - 文意選填    一篇短文十格，共用一組選項，每個選項只能用一次。
 *  - 篇章結構    一篇短文四格，五個「整句」選項擇四（115 學年度起改為五選四）。
 *  - 閱讀測驗    一篇文章，數題理解題。
 */

export interface SentenceFormatSpec {
  /** Every sentence-level format is one sentence with a single blank. */
  optionCount: 4;
  style: QuestionStyle;
}

export interface PassageFormatSpec {
  format: PassageFormat;
  /** Blanks cut into the passage. `reading` asks about the passage instead. */
  blanks: number;
  /** Options offered per blank, or the size of the shared bank. */
  optionCount: number;
  /**
   * A shared bank means one option list for the whole passage, each option
   * used at most once — 文意選填 and 篇章結構 work this way, 綜合測驗 does not.
   */
  sharedBank: boolean;
  /** Whole sentences rather than words or phrases. */
  sentenceOptions: boolean;
}

export const SENTENCE_FORMATS: Record<
  "vocabulary",
  SentenceFormatSpec
> = {
  vocabulary: { optionCount: 4, style: "vocabulary" },
};

export const PASSAGE_FORMATS: Record<PassageFormat, PassageFormatSpec> = {
  reading: {
    format: "reading",
    blanks: 0,
    optionCount: 4,
    sharedBank: false,
    sentenceOptions: false,
  },
  cloze: {
    format: "cloze",
    blanks: 5,
    optionCount: 4,
    sharedBank: false,
    sentenceOptions: false,
  },
  wordBank: {
    format: "wordBank",
    blanks: 10,
    optionCount: 10,
    sharedBank: true,
    sentenceOptions: false,
  },
  discourse: {
    format: "discourse",
    blanks: 4,
    optionCount: 5,
    sharedBank: true,
    sentenceOptions: true,
  },
};

/** Reading packs ask between this many and `READING_MAX_QUESTIONS` questions. */
export const READING_MIN_QUESTIONS = 3;
export const READING_MAX_QUESTIONS = 5;

export const PASSAGE_KINDS = [
  "cloze",
  "wordBank",
  "discourse",
  "reading",
] as const;
export const SENTENCE_KINDS = ["vocabulary"] as const;

export function isPassageKind(
  kind: GeneratedQuestionKind,
): kind is PassageFormat {
  return (PASSAGE_KINDS as readonly string[]).includes(kind);
}

export function passageSpec(
  kind: GeneratedQuestionKind,
): PassageFormatSpec | null {
  return isPassageKind(kind) ? PASSAGE_FORMATS[kind] : null;
}

/** How many senses one request should cover, given what the format can absorb. */
export function sensesPerRequest(kind: GeneratedQuestionKind): number {
  const spec = passageSpec(kind);
  if (!spec) return 8;
  return spec.format === "reading" ? READING_MAX_QUESTIONS : spec.blanks;
}

/** The blank marker written into a passage: `__1__`, `__2__`, … */
export function blankToken(index: number): string {
  return `__${index + 1}__`;
}

export const BLANK_TOKEN_PATTERN = /__(\d+)__/g;

/** The single-sentence blank marker. Kept distinct from passage numbering. */
export const SENTENCE_BLANK = "_____";

export function countBlankTokens(passage: string): number {
  return [...passage.matchAll(BLANK_TOKEN_PATTERN)].length;
}

/** Blank numbers found in a passage, in the order they appear. */
export function blankTokenNumbers(passage: string): number[] {
  return [...passage.matchAll(BLANK_TOKEN_PATTERN)].map((match) =>
    Number(match[1]),
  );
}
