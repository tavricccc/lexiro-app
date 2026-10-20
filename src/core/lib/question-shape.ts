// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { PassageFormat, QuestionStyle } from "@/core/types";
import {
  PASSAGE_FORMATS,
  blankTokenNumbers,
  countBlankTokens,
} from "./question-formats";

export function isValidAnswerIndex(
  optionCount: number,
  answerIndex: number,
): boolean {
  return (
    Number.isInteger(answerIndex) &&
    answerIndex >= 0 &&
    answerIndex < optionCount
  );
}

export type QuestionPromptIssue = "blank" | null;

/**
 * Both sentence formats are one sentence with exactly one blank -- that is what
 * 詞彙題 and 文法題 look like on a Taiwanese paper, and it is also what makes a
 * question answerable by picking one option.
 */
export function questionPromptIssue(
  _questionStyle: QuestionStyle,
  prompt: string,
): QuestionPromptIssue {
  const blankRuns = prompt.match(/_+/gu) ?? [];
  return blankRuns.length === 1 && blankRuns[0] === "_____" ? null : "blank";
}

/**
 * Checks a passage against the format it claims to be: the right number of
 * blanks, numbered 1..n once each, and none at all for a reading passage.
 */
export function passageBlankIssue(
  format: PassageFormat,
  passage: string,
  childCount: number,
): string | null {
  const spec = PASSAGE_FORMATS[format];
  if (format === "reading")
    return countBlankTokens(passage) === 0 ? null : "閱讀測驗的文章不可有空格";
  const numbers = blankTokenNumbers(passage);
  if (numbers.length !== childCount)
    return `文章的空格數（${numbers.length}）與題數（${childCount}）不一致`;
  const expected = Array.from({ length: childCount }, (_, index) => index + 1);
  if (numbers.some((value, index) => value !== expected[index]))
    return "文章的空格必須從 __1__ 依序編號且不重複";
  if (spec.sharedBank && childCount > spec.optionCount)
    return `${format} 的空格數不可超過選項數`;
  return null;
}
