// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { isRecord } from "./schema";

/** Sentence boundaries keep both sides of a discourse blank available to readers. */
export function discourseStructureIssue(
  value: Record<string, unknown>,
): string | null {
  if (typeof value.passage !== "string" || !Array.isArray(value.removals))
    return null;
  const sentences = [
    ...new Intl.Segmenter("en", { granularity: "sentence" }).segment(
      value.passage,
    ),
  ]
    .map(({ segment }) => segment.trim())
    .filter(Boolean);
  if (sentences.length < 10) return "篇章結構文章至少需要十個完整句子";
  const selected: number[] = [];
  for (const [index, removal] of value.removals.entries()) {
    if (!isRecord(removal) || typeof removal.sentence !== "string") continue;
    const at = sentences.indexOf(removal.sentence.trim());
    if (at < 0) return `篇章結構第 ${index + 1} 格必須逐字複製完整原句`;
    if (at === 0 || at === sentences.length - 1)
      return `篇章結構第 ${index + 1} 格不可移除文章首句或末句`;
    if (selected.some((previous) => Math.abs(previous - at) <= 1))
      return "篇章結構不可移除相鄰或重複句子；每格兩側須保留原文線索";
    selected.push(at);
  }
  return null;
}
