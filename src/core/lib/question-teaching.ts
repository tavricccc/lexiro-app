// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { isRecord } from "./schema";
import { containsHan } from "./validation";
import { z } from "zod";

const agentTeaching = z.object({
  explanation: z.string().optional(),
  whyWrong: z
    .union([
      z.array(z.object({ option: z.string(), reason: z.string() })),
      z.record(z.string(), z.string()),
    ])
    .optional(),
});

/** Agent-authored explanations may be partial and follow the user's language. */
export function assembleAgentTeaching(item: Record<string, unknown>) {
  const parsed = agentTeaching.parse(item);
  return {
    ...(parsed.explanation !== undefined
      ? { explanation: parsed.explanation }
      : {}),
    ...(parsed.whyWrong !== undefined
      ? {
          whyWrong: Array.isArray(parsed.whyWrong)
            ? Object.fromEntries(
                parsed.whyWrong.map(({ option, reason }) => [option, reason]),
              )
            : parsed.whyWrong,
        }
      : {}),
  };
}

/** Model explanations name the actual option; display shuffling is independent. */
export function optionTeachingIssue(
  item: Record<string, unknown>,
  distractors: string[],
): string | null {
  if (typeof item.explanation !== "string" || !item.explanation.trim())
    return "缺少作答解說";
  if (!containsHan(item.explanation)) return "作答解說必須以中文說明";
  if (
    !Array.isArray(item.whyWrong) ||
    item.whyWrong.length !== distractors.length
  )
    return `必須逐一說明 ${distractors.length} 個干擾選項為何不成立`;
  const expected = new Set(distractors);
  const explained = new Set<string>();
  for (const reason of item.whyWrong) {
    if (
      !isRecord(reason) ||
      typeof reason.option !== "string" ||
      typeof reason.reason !== "string" ||
      !reason.reason.trim()
    )
      return "錯項解說必須包含實際選項 option 與理由 reason";
    const option = reason.option.trim();
    if (!containsHan(reason.reason))
      return `錯項「${option}」必須以中文說明理由`;
    if (!expected.has(option))
      return `錯項解說引用了不屬於本題干擾選項的「${option}」`;
    if (explained.has(option)) return `錯項「${option}」的解說重複`;
    explained.add(option);
  }
  return null;
}

/**
 * Shared banks explain each blank once. A word bank glosses every option at the
 * set level; a discourse set only explains why its unused sentence fits nowhere.
 */
export function sharedBankTeachingIssue(
  value: Record<string, unknown>,
  kind: "wordBank" | "discourse",
  answers: string[],
): string | null {
  const bank = (value.options as string[]).map((option) => option.trim());
  if (kind === "discourse") {
    if (bank.every((option) => answers.includes(option))) return null;
    return typeof value.unusedReason === "string" &&
      containsHan(value.unusedReason)
      ? null
      : "篇章結構需要以中文 unusedReason 說明未使用的句子為何不適合任何空格";
  }
  if (
    !Array.isArray(value.optionMeanings) ||
    value.optionMeanings.length !== bank.length
  )
    return `文意選填需要 optionMeanings 逐一提供 ${bank.length} 個選項的中文詞義`;
  const seen = new Set<string>();
  for (const entry of value.optionMeanings) {
    if (
      !isRecord(entry) ||
      typeof entry.option !== "string" ||
      typeof entry.meaning !== "string"
    )
      return "optionMeanings 必須包含實際選項 option 與詞義 meaning";
    const option = entry.option.trim();
    if (!bank.includes(option))
      return `optionMeanings 引用了不屬於共用選項的「${option}」`;
    if (seen.has(option)) return `optionMeanings 的「${option}」重複`;
    if (!containsHan(entry.meaning)) return `選項「${option}」必須提供中文詞義`;
    seen.add(option);
  }
  return null;
}

/** Per-blank teaching for a shared bank: its explanation plus the set-level notes. */
export function assembleSharedBankTeaching(
  item: Record<string, unknown>,
  value: Record<string, unknown>,
  kind: "wordBank" | "discourse",
  answer: string,
  answers: string[],
): { explanation?: string; whyWrong?: Record<string, string> } {
  const explanation =
    typeof item.explanation === "string" && item.explanation.trim()
      ? { explanation: item.explanation.trim() }
      : {};
  if (kind === "wordBank") {
    if (!Array.isArray(value.optionMeanings)) return explanation;
    const meanings = value.optionMeanings
      .filter(isRecord)
      .flatMap((entry) =>
        typeof entry.option === "string" &&
        typeof entry.meaning === "string" &&
        entry.option.trim() !== answer &&
        entry.meaning.trim()
          ? [[entry.option.trim(), entry.meaning.trim()] as const]
          : [],
      );
    return { ...explanation, whyWrong: Object.fromEntries(meanings) };
  }
  const unused = (value.options as string[])
    .map((option) => option.trim())
    .filter((option) => !answers.includes(option));
  if (
    typeof value.unusedReason !== "string" ||
    !value.unusedReason.trim() ||
    !unused.length
  )
    return explanation;
  const reason = value.unusedReason.trim();
  return {
    ...explanation,
    whyWrong: Object.fromEntries(unused.map((option) => [option, reason])),
  };
}

export function assembleOptionTeaching(
  item: Record<string, unknown> | undefined,
  distractors: string[],
): { explanation?: string; whyWrong?: Record<string, string> } {
  // Assembly can also build bare structural fixtures; generated admission checks teaching.
  if (!item || (item.explanation === undefined && item.whyWrong === undefined))
    return {};
  const issue = optionTeachingIssue(item, distractors);
  if (issue) throw new Error(issue);
  return {
    explanation: (item.explanation as string).trim(),
    whyWrong: Object.fromEntries(
      (item.whyWrong as Array<{ option: string; reason: string }>).map(
        ({ option, reason }) => [option.trim(), reason.trim()],
      ),
    ),
  };
}
