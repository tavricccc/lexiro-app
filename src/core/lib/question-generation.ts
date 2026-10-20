// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { QuestionSourceRefs } from "./library-import";
import type {
  GeneratedQuestionKind,
  LibraryQuestion,
  QuestionDifficulty,
  SetMembership,
  WordEntry,
} from "@/core/types";
import { senseKey } from "./library";
import { createSourceRef } from "./source-ref";
import { extractJsonText } from "./ai/json";
import { assembleGeneratedQuestions } from "./question-assembly";
import { generatedQuestionQualityIssue } from "./question-quality";
import {
  isPassageKind,
  READING_MIN_QUESTIONS,
  READING_MAX_QUESTIONS,
  PASSAGE_FORMATS,
  sensesPerRequest,
} from "./question-formats";

export type { GeneratedQuestionKind };
export type GeneratedQuestionDifficulty = QuestionDifficulty;

const QUESTION_BATCH_SIZE = 4;

export function getSetGenerationWords(
  words: WordEntry[],
  memberships: SetMembership[],
): WordEntry[] {
  const selected = new Map(
    memberships.map((entry) => [entry.wordKey, new Set(entry.senseIds)]),
  );
  return words
    .map((word) => ({
      ...word,
      senses: word.senses.filter((sense) =>
        selected.get(word.wordKey)?.has(sense.id),
      ),
    }))
    .filter((word) => word.senses.length > 0);
}

export function getQuestionSourceRefs(words: WordEntry[]): QuestionSourceRefs {
  return Object.fromEntries(
    words.flatMap((word, wordIndex) => [
      [
        createSourceRef(wordIndex),
        { wordKey: word.wordKey, senseId: word.senses[0].id },
      ],
      ...word.senses.map((sense, senseIndex) => [
        createSourceRef(wordIndex, senseIndex),
        { wordKey: word.wordKey, senseId: sense.id },
      ]),
    ]),
  );
}

/**
 * Independent questions target four sources. Passage formats generate a
 * complete, indivisible question group per request, so their group size remains
 * defined by the format (for example, five cloze blanks or one reading passage).
 */
export function questionBatchSize(kind: GeneratedQuestionKind): number {
  return isPassageKind(kind) ? sensesPerRequest(kind) : QUESTION_BATCH_SIZE;
}

export function splitGenerationBatches(
  words: WordEntry[],
  kind: GeneratedQuestionKind,
): WordEntry[][] {
  const size = questionBatchSize(kind);

  if (isPassageKind(kind)) {
    // Keep different senses of the same spelling in separate passages,
    // and count senses rather than word entries.
    if (words.every((word) => word.senses.length === 1)) {
      const packs: WordEntry[][] = [];
      for (let index = 0; index < words.length; index += size)
        packs.push(words.slice(index, index + size));
      return packs;
    }
    const count = words.reduce((sum, word) => sum + word.senses.length, 0);
    const packCount = Math.max(
      Math.ceil(count / size),
      ...words.map((word) => word.senses.length),
      0,
    );
    const packs: WordEntry[][] = Array.from({ length: packCount }, () => []);
    const ordered = [...words].sort(
      (a, b) => b.senses.length - a.senses.length,
    );
    for (const word of ordered)
      for (const sense of word.senses) {
        const pack = packs
          .filter(
            (candidate) =>
              candidate.length < size &&
              candidate.every((entry) => entry.wordKey !== word.wordKey),
          )
          .sort((a, b) => a.length - b.length)[0];
        if (!pack) throw new Error("無法安排不重複詞義的題組");
        pack.push({ ...word, senses: [sense] });
      }
    const sourceOrder = new Map(
      words
        .flatMap((word) =>
          word.senses.map((sense) => senseKey(word.wordKey, sense.id)),
        )
        .map((key, index) => [key, index]),
    );
    return packs
      .filter((pack) => pack.length)
      .map((pack) =>
        pack.sort(
          (a, b) =>
            sourceOrder.get(senseKey(a.wordKey, a.senses[0].id))! -
            sourceOrder.get(senseKey(b.wordKey, b.senses[0].id))!,
        ),
      );
  }

  const batches: WordEntry[][] = [];
  let batch: WordEntry[] = [];
  let senseCount = 0;
  for (const word of words) {
    const wordSenseCount = word.senses.length;
    if (batch.length && senseCount + wordSenseCount > size) {
      batches.push(batch);
      batch = [];
      senseCount = 0;
    }
    if (wordSenseCount > size) {
      for (let index = 0; index < word.senses.length; index += size) {
        const senses = word.senses.slice(index, index + size);
        if (batch.length) {
          batches.push(batch);
          batch = [];
          senseCount = 0;
        }
        batches.push([{ ...word, senses }]);
      }
      continue;
    }
    batch.push(word);
    senseCount += wordSenseCount;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

/**
 * Parses the model's reply and assembles finished questions from it.
 *
 * Require context-specific model distractors and the shared editorial length.
 */
export function normalizeQuestionGenerationJson(
  responseText: string,
  kind: GeneratedQuestionKind,
  difficulty: GeneratedQuestionDifficulty,
  words: WordEntry[],
): string {
  let value: unknown;
  try {
    value = JSON.parse(extractJsonText(responseText)) as unknown;
  } catch {
    throw new Error("AI 題目回覆不是有效 JSON");
  }
  const qualityIssue = generatedQuestionQualityIssue(value, kind, difficulty);
  if (qualityIssue) throw new Error(qualityIssue);
  const assembled = assembleGeneratedQuestions(value, kind, difficulty, words);
  if (assembled.dropped.length) throw new Error(assembled.dropped.join("；"));
  return JSON.stringify(assembled.payload);
}

export function generatedQuestionCoverageIssue(
  questions: LibraryQuestion[],
  words: WordEntry[],
  kind: GeneratedQuestionKind,
): string | null {
  if (isPassageKind(kind)) {
    if (questions.length !== 1 || questions[0]?.kind !== "reading")
      return "這個題型每批只能產生一個題組";
    const pack = questions[0];
    if (pack.format !== kind) return "題組的格式與所選題型不符";
    if (kind === "reading" && pack.questions.length < READING_MIN_QUESTIONS)
      return `閱讀測驗至少要有 ${READING_MIN_QUESTIONS} 個子題`;
    if (kind === "reading" && pack.questions.length > READING_MAX_QUESTIONS)
      return `閱讀測驗最多 ${READING_MAX_QUESTIONS} 個子題`;
    if (
      kind === "discourse" &&
      pack.questions.length !== PASSAGE_FORMATS.discourse.blanks
    )
      return `篇章結構必須有 ${PASSAGE_FORMATS.discourse.blanks} 個空格`;
    const expectedSenseKeys = new Set(
      words.flatMap((word) =>
        word.senses.map((sense) => senseKey(word.wordKey, sense.id)),
      ),
    );
    const actualSenseKeys = pack.questions.map((question) =>
      senseKey(question.wordKey, question.senseId),
    );
    if (actualSenseKeys.some((key) => !expectedSenseKeys.has(key)))
      return "子題必須對應本批輸入的詞義";
    if (
      (kind === "cloze" || kind === "wordBank") &&
      (actualSenseKeys.length !== expectedSenseKeys.size ||
        new Set(actualSenseKeys).size !== expectedSenseKeys.size)
    )
      return "每個指定詞義都必須對應一個空格，不可遺漏或重複";
    return null;
  }

  const expectedSenseKeys = new Set(
    words.flatMap((word) =>
      word.senses.map((sense) => senseKey(word.wordKey, sense.id)),
    ),
  );
  const actualSenseKeys = questions.flatMap((question) =>
    question.kind === "reading"
      ? []
      : [senseKey(question.wordKey, question.senseId)],
  );
  if (
    new Set(actualSenseKeys).size !== actualSenseKeys.length ||
    actualSenseKeys.some((key) => !expectedSenseKeys.has(key))
  )
    return "每個詞義最多只能生成一題";
  return null;
}
