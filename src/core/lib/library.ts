// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  EditorItem,
  LibraryQuestion,
  MultipleChoiceQuestion,
  ReadingPack,
  SenseId,
  StudyWord,
  WordEntry,
  WordKey,
  WordSense,
} from "@/core/types";
import { canonicalHash } from "./hash";
import { randomUUID } from "./id";

import { normalizePartOfSpeech } from "@/core/ai-contract";
export { normalizePartOfSpeech } from "@/core/ai-contract";

/** Normalized spelling for drafts and legacy material; persisted keys use the set owner. */
export function normalizeWordKey(word: string): WordKey {
  return word.trim().toLocaleLowerCase().replace(/\s+/g, " ") as WordKey;
}

const wordCollator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

/** A to Z by spelling, case and accents aside; sets always list words this way. */
export function compareWords(a: string, b: string): number {
  return wordCollator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Persisted words belong to one set; spelling is only the within-set lookup key. */
export function buildSetWordKey(setId: string, word: string): WordKey {
  return `word-${canonicalHash({ setId, word: normalizeWordKey(word) })}` as WordKey;
}

export function isSetWordKey(wordKey: string): boolean {
  return /^word-[0-9a-f]{32}$/u.test(wordKey);
}

/**
 * Accepts a sense id that has already been checked against the senses it must
 * belong to. Call this only where such a check has just happened — parsing an
 * import file, reading a stored record — never to silence a type error.
 */
export function asSenseId(value: string): SenseId {
  return value as SenseId;
}

export function buildSenseId(
  wordKey: WordKey,
  pos: string,
  meaningZh: string,
): SenseId {
  return `sense-${canonicalHash({ wordKey, pos: normalizePartOfSpeech(pos) || pos.trim().toLocaleLowerCase(), meaningZh: meaningZh.trim() })}` as SenseId;
}

type QuestionContent =
  | Omit<
      MultipleChoiceQuestion,
      "id" | "fingerprint" | "createdAt" | "updatedAt"
    >
  | Omit<ReadingPack, "id" | "fingerprint" | "createdAt" | "updatedAt">;

export function buildQuestionFingerprint(question: QuestionContent): string {
  const content =
    question.kind === "reading"
      ? {
          ...question,
          questions: question.questions.map(({ id: _id, ...child }) => child),
        }
      : question;
  return `fingerprint-${canonicalHash(content)}`;
}

export function buildQuestionId(sourceId?: string): string {
  const normalized = sourceId?.trim();
  if (normalized) return normalized;
  return `question-${randomUUID()}`;
}

export function canonicalizeQuestion(
  question: LibraryQuestion,
): LibraryQuestion {
  const {
    id: rawId,
    fingerprint: _rawFingerprint,
    createdAt: rawCreatedAt,
    updatedAt: rawUpdatedAt,
    ...rawContent
  } = question;
  const now = new Date().toISOString();
  const createdAt = rawCreatedAt || now;
  const updatedAt = rawUpdatedAt || createdAt;
  const content = rawContent as QuestionContent;
  return {
    ...content,
    id: buildQuestionId(rawId),
    fingerprint: buildQuestionFingerprint(content),
    createdAt,
    updatedAt,
  } as LibraryQuestion;
}

export function mergeUniqueStrings(
  first: string[] = [],
  second: string[] = [],
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of [...first, ...second]) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result;
}

/** A sense stores its description only when there is one. */
export function senseDescription(value: string | undefined): {
  description?: string;
} {
  const description = value?.trim();
  return description ? { description } : {};
}

/**
 * A description holds one point per line. Bullets or numbers someone typed
 * at the start of a line are dropped so the screens can add their own.
 */
export function descriptionPoints(value: string | undefined): string[] {
  return (value ?? "")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*(?:(?:[•・①-⑳]|\d+、)\s*|(?:[*-]|\d+[.)])\s+)/u, "")
        .trim(),
    )
    .filter(Boolean);
}

function mergeSense(
  existing: WordSense | undefined,
  incoming: WordSense,
): WordSense {
  if (!existing) return incoming;
  const nextExamples = mergeUniqueStrings(existing.examples, incoming.examples);
  const changed =
    canonicalHash(nextExamples) !== canonicalHash(existing.examples);
  if (!changed) return existing;
  return {
    ...existing,
    examples: nextExamples,
  };
}

export function mergeWord(
  existing: WordEntry | undefined,
  incoming: WordEntry,
): WordEntry {
  if (!existing) return incoming;
  const senses = [...existing.senses];
  for (const incomingSense of incoming.senses) {
    const index = senses.findIndex(
      (sense) =>
        sense.id === incomingSense.id ||
        (normalizePartOfSpeech(sense.pos) ===
          normalizePartOfSpeech(incomingSense.pos) &&
          sense.meaningZh.trim() === incomingSense.meaningZh.trim()),
    );
    if (index === -1) senses.push(incomingSense);
    else senses[index] = mergeSense(senses[index], incomingSense);
  }
  const next: WordEntry = {
    ...existing,
    word: existing.word,
    senses,
    updatedAt: new Date().toISOString(),
  };
  const comparableNext = { ...next, updatedAt: existing.updatedAt };
  if (canonicalHash(comparableNext) === canonicalHash(existing))
    return existing;
  return next;
}

export function itemToWordEntry(
  item: Pick<EditorItem, "word" | "senses">,
): WordEntry {
  const wordKey = normalizeWordKey(item.word);
  const senses = item.senses
    .map((sense) => {
      const pos = normalizePartOfSpeech(sense.pos);
      const meaningZh = sense.meaning.trim();
      if (!pos || !meaningZh) return null;
      return {
        id: buildSenseId(wordKey, pos, meaningZh),
        pos,
        meaningZh,
        examples: mergeUniqueStrings(sense.examples),
        supplementary: sense.supplementary,
        ...senseDescription(sense.description),
      };
    })
    .filter((sense): sense is WordSense => Boolean(sense));
  if (!wordKey || !senses.length)
    throw new Error(
      "每個單字至少需要一個有效詞義；詞性請使用標準縮寫或英文全名",
    );
  return {
    wordKey,
    word: item.word.trim(),
    senses,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * A word key and a sense id joined into one value, for places that must carry
 * the pair through a single string — a select option, a generation batch key.
 */
export function senseKey(wordKey: WordKey, senseId: SenseId): string {
  return `${wordKey}::${senseId}`;
}

/**
 * Splits a sense key and checks the pair against the Library. Returning the
 * branded ids only after that check is what keeps a composite key from being
 * mistaken for a sense id.
 */
export function parseSenseKey(
  value: string,
  words: Record<WordKey, WordEntry>,
): { wordKey: WordKey; senseId: SenseId } | null {
  const separator = value.indexOf("::");
  if (separator < 0) return null;
  const wordKey = normalizeWordKey(value.slice(0, separator));
  const senseId = asSenseId(value.slice(separator + 2));
  const word = words[wordKey];
  if (!word || !word.senses.some((sense) => sense.id === senseId)) return null;
  return { wordKey, senseId };
}

export function senseToStudyWord(word: WordEntry, sense: WordSense): StudyWord {
  return {
    id: sense.id,
    wordKey: word.wordKey,
    word: word.word,
    pos: sense.pos,
    meaning: sense.meaningZh,
    examples: [...sense.examples],
    example: sense.examples[0] ?? "",
    supplementary: sense.supplementary,
    description: sense.description ?? "",
  };
}
