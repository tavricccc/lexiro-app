// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
export function extractJsonText(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fenced?.[1]) return fenced[1].trim();
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  for (const [open, close] of [
    ["{", "}"],
    ["[", "]"],
  ]) {
    const start = text.indexOf(open),
      end = text.lastIndexOf(close);
    if (start >= 0 && end > start) return text.slice(start, end + 1);
  }
  return trimmed;
}
