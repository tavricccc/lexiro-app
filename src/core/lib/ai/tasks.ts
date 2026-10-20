// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  LibraryQuestion,
  WordDraft,
  WordEntry,
  GeneratedQuestionKind,
  QuestionDifficulty,
} from "@/core/types";
import type { AiTask, AiTaskStep } from "@/core/types/ai";
import {
  parseSupplementaryJson,
  parseWordGenerationJson,
  type SupplementSource,
  type WordGenerationSource,
} from "../word-generation";
import {
  normalizeQuestionGenerationJson,
  getQuestionSourceRefs,
  splitGenerationBatches,
  generatedQuestionCoverageIssue,
} from "../question-generation";
import { parseLibraryImport } from "../library-import";
import { isPassageKind } from "../question-formats";
import { senseKey } from "../library";
import { extractJsonText } from "./json";
import { t } from "@/core/lib/i18n";
import { isRecord } from "../schema";
import { passageRepairs } from "./passage-repair";
import { LIMITS } from "@/core/ai-contract";

export function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}
const WORD_BATCH_SIZE = 30;
function wordBatches(sources: WordGenerationSource[]) {
  const batches: WordGenerationSource[][] = [];
  let batch: WordGenerationSource[] = [],
    characters = 0;
  for (const source of sources) {
    if (
      batch.length &&
      (batch.length === WORD_BATCH_SIZE ||
        characters + source.raw.length + 1 > LIMITS.input)
    ) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
    characters += source.raw.length + (batch.length ? 1 : 0);
    batch.push(source);
  }
  if (batch.length) batches.push(batch);
  return batches;
}
const wordInput = (sources: WordGenerationSource[]) =>
  JSON.stringify({
    kind: "words",
    raw: sources.map((source) => source.raw).join("\n"),
  });

export function wordTask(sources: WordGenerationSource[]): AiTask<WordDraft> {
  const make = (batch: WordGenerationSource[]): AiTaskStep<WordDraft> => ({
    id: batch.map((s) => s.sourceRef).join(","),
    count: batch.length,
    retryInvalid: batch.length === 1,
    context: wordInput(batch),
    prompt: wordInput(batch),
    parse: (text) => {
      return parseWordGenerationJson(text, batch);
    },
    recover: (text) => {
      const data: unknown = JSON.parse(extractJsonText(text));
      if (!isRecord(data) || !Array.isArray(data.items)) return null;
      const rawItems = data.items;
      const items: WordDraft[] = [],
        remaining: WordGenerationSource[] = [];
      batch.forEach((source, index) => {
        try {
          const item = rawItems[index];
          if (!item) throw new Error();
          const single = { items: [item] };
          items.push(
            ...parseWordGenerationJson(JSON.stringify(single), [source]),
          );
        } catch {
          remaining.push(source);
        }
      });
      return batch.length > 1 && remaining.length
        ? {
            items,
            completed: batch.length - remaining.length,
            remaining: remaining.map((source) => make([source])),
          }
        : null;
    },
    ...(batch.length > 1
      ? { split: () => chunks(batch, Math.ceil(batch.length / 2)).map(make) }
      : {}),
  });
  return {
    id: "words",
    kind: "words",
    billableCount: sources.length,
    context: wordInput(sources),
    steps: wordBatches(sources).map(make),
  };
}

const SUPPLEMENT_BATCH_SIZE = 10;

/**
 * Asking for the meanings a word does not have yet.
 *
 * The unit is the word, not the meaning: a word is asked about once and paid
 * for once, and coming back with nothing is a complete answer rather than a
 * failed one.
 */
export function supplementTask(
  sources: SupplementSource[],
  limit: 1 | 2 | 3,
): AiTask<WordDraft> {
  const input = (batch: SupplementSource[]) =>
    JSON.stringify({
      kind: "senses",
      limit,
      sources: batch.flatMap((entry, index) =>
        entry.existing.map((sense) => ({
          ref: `s${index + 1}`,
          word: entry.word,
          pos: sense.pos,
          meaningZh: sense.meaningZh,
        })),
      ),
    });
  const make = (batch: SupplementSource[]): AiTaskStep<WordDraft> => ({
    id: batch.map((entry) => entry.word).join(","),
    count: batch.length,
    context: input(batch),
    prompt: input(batch),
    parse: (text) => parseSupplementaryJson(text, batch, limit),
    ...(batch.length > 1
      ? { split: () => chunks(batch, Math.ceil(batch.length / 2)).map(make) }
      : {}),
  });
  return {
    id: "senses",
    kind: "senses",
    billableCount: sources.length,
    context: input(sources),
    steps: chunks(sources, SUPPLEMENT_BATCH_SIZE).map(make),
  };
}

export function questionTask(
  words: WordEntry[],
  kind: GeneratedQuestionKind,
  difficulty: QuestionDifficulty,
): AiTask<LibraryQuestion> {
  return createQuestionTask(
    words,
    kind,
    difficulty,
    splitGenerationBatches(words, kind),
  );
}

function createQuestionTask(
  words: WordEntry[],
  kind: GeneratedQuestionKind,
  difficulty: QuestionDifficulty,
  batches: WordEntry[][],
): AiTask<LibraryQuestion> {
  const globalRefs = new Map(
    words
      .flatMap((w) => w.senses.map((s) => senseKey(w.wordKey, s.id)))
      .map((key, i) => [key, `s${i + 1}`]),
  );
  const input = (batch: WordEntry[]) => {
    // WordBank refs belong to one passage; the task's step IDs remain global.
    let sourceIndex = 0;
    return JSON.stringify({
      kind,
      difficulty,
      sources: batch.flatMap((word) =>
        word.senses.map((sense) => ({
          ref:
            kind === "wordBank"
              ? `s${++sourceIndex}`
              : globalRefs.get(senseKey(word.wordKey, sense.id))!,
          word: word.word,
          pos: sense.pos,
          meaningZh: sense.meaningZh,
          ...(sense.examples.length ? { knownExample: sense.examples[0] } : {}),
        })),
      ),
    });
  };
  const make = (batch: WordEntry[]): AiTaskStep<LibraryQuestion> => {
    const refs = batch.flatMap((w) =>
      w.senses.map((s) => globalRefs.get(senseKey(w.wordKey, s.id))!),
    );
    const passage = isPassageKind(kind);
    const step: AiTaskStep<LibraryQuestion> = {
      id: refs.join(","),
      count: passage ? 1 : refs.length,
      retryInvalid: !passage && refs.length === 1,
      context: input(batch),
      prompt: input(batch),
      parse: (text) => {
        const data: unknown = JSON.parse(extractJsonText(text));
        const normalized = normalizeQuestionGenerationJson(
          JSON.stringify(data),
          kind,
          difficulty,
          batch,
        );
        const parsed = parseLibraryImport(normalized, {
          allowedDifficulty: difficulty,
          expectedQuestionKind: passage ? "reading" : "multipleChoice",
          expectedQuestionStyle: passage ? undefined : kind,
          questionSources: getQuestionSourceRefs(batch),
          requireEnglish: true,
        });
        if (!parsed.valid) throw new Error(parsed.error);
        if (parsed.data.kind !== "questions")
          throw new Error(t("ai.invalidReply"));
        const questions = parsed.data.questions;
        const issue = generatedQuestionCoverageIssue(questions, batch, kind);
        if (issue || (!passage && questions.length !== refs.length))
          throw new Error(issue || t("ai.missingItems"));
        return questions;
      },
      ...(!passage && refs.length > 1
        ? {
            split: () => {
              const units = batch.flatMap((w) =>
                w.senses.map((s) => ({ ...w, senses: [s] })),
              );
              return chunks(units, Math.ceil(units.length / 2)).map(make);
            },
          }
        : {}),
    };
    if (passage)
      step.recover = (text) =>
        passageRepairs({
          text,
          kind,
          difficulty,
          words: batch,
          input: JSON.parse(
            input(batch),
          ) as import("@/core/ai-contract").GenerationInput,
          parentId: step.id,
          parse: step.parse,
        });
    else
      step.recover = (text) => {
        const data: unknown = JSON.parse(extractJsonText(text));
        if (!isRecord(data) || !Array.isArray(data.items)) return null;
        const rawItems = data.items;
        const units = batch.flatMap((w) =>
          w.senses.map((s) => ({ ...w, senses: [s] })),
        );
        const items: LibraryQuestion[] = [],
          remaining: WordEntry[] = [];
        units.forEach((unit, i) => {
          try {
            const item = rawItems[i];
            if (!isRecord(item)) throw new Error();
            items.push(
              ...make([unit]).parse(JSON.stringify({ items: [item] })),
            );
          } catch {
            remaining.push(unit);
          }
        });
        return units.length > 1 && remaining.length
          ? {
              items,
              completed: units.length - remaining.length,
              remaining: remaining.map((unit) => make([unit])),
            }
          : null;
      };
    return step;
  };
  const context = input(words);
  return {
    id: `questions-${kind}`,
    kind,
    billableCount:
      kind === "discourse" || kind === "reading"
        ? batches.length
        : globalRefs.size,
    context,
    steps: batches.map(make),
    key: (q) => q.fingerprint || q.id,
  };
}
