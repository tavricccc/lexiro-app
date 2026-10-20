// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
const WORD_CHAR = /[A-Za-z0-9]/;

/** Whole-word occurrences, including complete multiword answer spans. */
export function wordOccurrences(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const found: number[] = [];
  const lowerHay = haystack.toLocaleLowerCase();
  const lowerNeedle = needle.toLocaleLowerCase();
  let from = 0;
  for (;;) {
    const at = lowerHay.indexOf(lowerNeedle, from);
    if (at === -1) return found;
    const before = at === 0 ? "" : haystack[at - 1];
    const after = haystack[at + needle.length] ?? "";
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) found.push(at);
    from = at + 1;
  }
}

/** The supplied usage anchors the answer; prose outside it may repeat a word. */
export function locateUsageAnswer(
  prose: string,
  usage: string,
  answer: string,
): { at: number } | { issue: string } {
  if (!usage.trim()) return { issue: "缺少目標用法 usage" };
  const usages = wordOccurrences(prose, usage);
  if (usages.length !== 1) return { issue: "目標用法必須在原文恰好出現一次" };
  const answers = wordOccurrences(usage, answer);
  if (answers.length !== 1)
    return {
      issue: answers.length
        ? `答案在目標用法中出現 ${answers.length} 次，必須恰好一次`
        : "答案必須位於目標用法內且不超出範圍",
    };
  return { at: usages[0] + answers[0] };
}
