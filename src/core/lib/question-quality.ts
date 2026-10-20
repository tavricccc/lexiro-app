// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import {
  countEnglishWords,
  questionLengthRange,
  READING_SKILLS,
  PASSAGE_FORMATS,
} from "@/core/ai-contract";
import type { GeneratedQuestionKind, QuestionDifficulty } from "@/core/types";
import { isPassageKind } from "./question-formats";
import { isRecord } from "./schema";
import {
  optionTeachingIssue,
  sharedBankTeachingIssue,
} from "./question-teaching";
import { containsHan } from "./validation";
import { discourseStructureIssue } from "./question-discourse";
import { wordOccurrences } from "./question-spans";

/** Validate new prose and reading audits; existing saved and manual work stays editable. */
export function generatedQuestionQualityIssue(
  value: unknown,
  kind: GeneratedQuestionKind,
  difficulty: QuestionDifficulty,
): string | null {
  if (!isRecord(value)) return null; // Assembly reports malformed replies.
  const range = questionLengthRange(kind, difficulty);
  const check = (prose: unknown, label: string) => {
    if (typeof prose !== "string") return null;
    const count = countEnglishWords(prose);
    return count < range.min || count > range.max
      ? `${label}長度為 ${count} 個英文單字，這個題型與難度需要 ${range.min}–${range.max} 字；請重寫完整語境，不要填充重複句子`
      : null;
  };
  if (isPassageKind(kind)) {
    const lengthIssue = check(value.passage, "文章");
    if (lengthIssue) return lengthIssue;
    const evidenceIssue =
      kind === "reading"
        ? readingEvidenceIssue(value, difficulty)
        : kind === "discourse"
          ? discourseStructureIssue(value)
          : null;
    return (
      evidenceIssue ??
      teachingIssue(value, kind) ??
      sharedQuestionBankProseIssue(value, kind)
    );
  }
  if (!Array.isArray(value.items)) return null;
  for (const [index, item] of value.items.entries()) {
    if (!isRecord(item)) continue;
    const issue = check(item.sentence, `第 ${index + 1} 題`);
    if (issue) return issue;
  }
  return teachingIssue(value, kind);
}

export function sharedQuestionBankIssue(
  value: Record<string, unknown>,
  kind: GeneratedQuestionKind,
): string | null {
  if (kind !== "wordBank" && kind !== "discourse") return null;
  if (
    !Array.isArray(value.options) ||
    value.options.some((option) => typeof option !== "string" || !option.trim())
  )
    return "共用選項必須先提供完整 options";
  const bank = (value.options as string[]).map((option) => option.trim());
  if (
    bank.length !== PASSAGE_FORMATS[kind].optionCount ||
    new Set(bank.map((option) => option.toLocaleLowerCase())).size !==
      bank.length
  )
    return `共用選項必須有 ${PASSAGE_FORMATS[kind].optionCount} 個不重複選項`;
  return null;
}

/** An unused discourse sentence stays outside the prose; word-bank words may recur. */
export function sharedQuestionBankProseIssue(
  value: Record<string, unknown>,
  kind: GeneratedQuestionKind,
): string | null {
  if (kind !== "discourse") return null;
  const items = value.removals;
  if (
    typeof value.passage !== "string" ||
    !Array.isArray(items) ||
    !Array.isArray(value.options)
  )
    return null;
  const answers = new Set(
    items.filter(isRecord).flatMap((item) => {
      const answer = item.sentence;
      return typeof answer === "string" ? [answer.trim()] : [];
    }),
  );
  for (const option of value.options) {
    if (
      typeof option === "string" &&
      !answers.has(option.trim()) &&
      wordOccurrences(value.passage, option).length
    )
      return "額外誘答選項不得出現在完整文章中；請重新安排共用選項與文章，不能把錯項當成本文事實";
  }
  return null;
}

function teachingIssue(
  value: Record<string, unknown>,
  kind: GeneratedQuestionKind,
): string | null {
  const items =
    kind === "discourse"
      ? value.removals
      : kind === "cloze" || kind === "wordBank"
        ? value.blanks
        : value.items;
  if (!Array.isArray(items)) return null;
  const shared = kind === "wordBank" || kind === "discourse";
  const bankIssue = sharedQuestionBankIssue(value, kind);
  if (bankIssue) return bankIssue;
  const bank = shared
    ? (value.options as string[]).map((option) => option.trim())
    : [];
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) return `第 ${index + 1} 題資料不完整`;
    const answer = kind === "discourse" ? item.sentence : item.answer;
    if (shared && (typeof answer !== "string" || !bank.includes(answer.trim())))
      return `第 ${index + 1} 題答案必須逐字對應共用選項`;
    if (shared) {
      if (typeof item.explanation !== "string" || !item.explanation.trim())
        return `第 ${index + 1} 題缺少作答解說`;
      if (!containsHan(item.explanation))
        return `第 ${index + 1} 題作答解說必須以中文說明`;
      continue;
    }
    const distractors = Array.isArray(item.distractors)
      ? item.distractors
          .filter((option): option is string => typeof option === "string")
          .map((option) => option.trim())
      : [];
    if (distractors.length !== 3) return `第 ${index + 1} 題干擾選項不足`;
    const issue = optionTeachingIssue(item, distractors);
    if (issue) return `第 ${index + 1} 題${issue}`;
  }
  return shared ? sharedTeachingIssue(value, kind) : null;
}

/** Set-level option notes; a broken bank note needs the whole set regenerated. */
export function sharedTeachingIssue(
  value: Record<string, unknown>,
  kind: GeneratedQuestionKind,
): string | null {
  if (kind !== "wordBank" && kind !== "discourse") return null;
  const items = kind === "discourse" ? value.removals : value.blanks;
  if (!Array.isArray(items) || sharedQuestionBankIssue(value, kind))
    return null;
  const answers = items.filter(isRecord).flatMap((item) => {
    const answer = kind === "discourse" ? item.sentence : item.answer;
    return typeof answer === "string" ? [answer.trim()] : [];
  });
  return sharedBankTeachingIssue(value, kind, answers);
}

/** The evidence is a generation audit; it is not persisted as a second question model. */
function readingEvidenceIssue(
  value: Record<string, unknown>,
  difficulty: QuestionDifficulty,
  checkGroup = true,
): string | null {
  if (typeof value.passage !== "string" || !Array.isArray(value.items))
    return null;
  const passage = value.passage;
  const skills = new Set<string>();
  for (const [index, item] of value.items.entries()) {
    if (!isRecord(item)) continue;
    if (
      typeof item.skill !== "string" ||
      !(READING_SKILLS as readonly string[]).includes(item.skill)
    )
      return `閱讀第 ${index + 1} 題缺少有效的閱讀任務 skill`;
    skills.add(item.skill);
    if (
      !Array.isArray(item.evidence) ||
      !item.evidence.length ||
      item.evidence.some(
        (span) =>
          typeof span !== "string" || !span.trim() || !passage.includes(span),
      )
    )
      return `閱讀第 ${index + 1} 題 evidence 必須逐字引用文章的作答依據`;
    if (item.skill !== "inference") continue;
    const spans = [...new Set(item.evidence as string[])];
    const positions = spans
      .map((span) => ({
        at: passage.indexOf(span),
        end: passage.indexOf(span) + span.length,
      }))
      .sort((a, b) => a.at - b.at);
    const independent = positions.some((first, i) =>
      positions
        .slice(i + 1)
        .some(
          (second) =>
            first.end <= second.at &&
            /[.!?](?:\s|$)/.test(passage.slice(first.at, second.at)),
        ),
    );
    if (!independent)
      return `閱讀第 ${index + 1} 題推論需要兩處不同句子的原文依據；不能將原句查找標成 inference`;
  }
  if (!checkGroup) return null;
  if (!skills.has("mainIdea")) return "閱讀測驗至少需要一題全篇主旨題 mainIdea";
  if (skills.size < 2) return "閱讀測驗至少需要兩種不同的閱讀任務";
  if (difficulty >= 2 && !skills.has("inference"))
    return "中等與進階閱讀至少需要一題結合兩處線索的推論題 inference";
  return null;
}

export function generatedQuestionItemIssue(
  value: Record<string, unknown>,
  kind: GeneratedQuestionKind,
  difficulty: QuestionDifficulty,
  index: number,
): string | null {
  const field =
    kind === "cloze" || kind === "wordBank"
      ? "blanks"
      : kind === "discourse"
        ? "removals"
        : "items";
  const items = value[field];
  if (!Array.isArray(items) || !isRecord(items[index])) return "子題資料不完整";
  const isolated = { ...value, [field]: [items[index]] };
  return (
    (kind === "reading"
      ? readingEvidenceIssue(isolated, difficulty, false)
      : null) ?? teachingIssue(isolated, kind)
  );
}
