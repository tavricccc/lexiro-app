// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  PracticeQuestionTask,
  LibraryQuestion,
  SenseId,
  WordEntry,
  WordKey,
} from "@/core/types";

export interface QuestionItem {
  id: string;
  question: LibraryQuestion | null;
  prompt: string;
  options: string[];
  answerIndex: number;
  wordKey: WordKey;
  senseId: SenseId;
  type: PracticeQuestionTask;
  acceptedMeanings?: string[];
  /** Passage items carry the shared bank so the practice view can show it. */
  optionBank?: string[];
  blank?: number;
  difficulty: 1 | 2 | 3;
  meaning: string;
  explanation?: string;
  whyWrong?: Record<string, string>;
}

/** A revealed correct bank answer is consumed by its earlier blank. */
export function usedBlankForOption(
  item: QuestionItem,
  optionIndex: number,
  answered: Readonly<Record<number, { answer: string }>>,
): number | undefined {
  if (!item.optionBank) return undefined;
  const used = Object.entries(answered).find(
    ([blank, value]) =>
      Number(blank) !== item.blank &&
      value.answer === item.options[optionIndex],
  );
  return used ? Number(used[0]) : undefined;
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(values: T[], seed: string): T[] {
  const random = seededRandom(seed);
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function shuffleOptions(
  options: string[],
  answerIndex: number,
  seed: string,
): { options: string[]; answerIndex: number } {
  if (options.length < 2) return { options, answerIndex };
  const order = seededShuffle(
    options.map((_, index) => index),
    seed,
  );
  return {
    options: order.map((index) => options[index] ?? ""),
    answerIndex: order.indexOf(answerIndex),
  };
}

function applyOptionShuffle(item: QuestionItem): QuestionItem {
  // A shared bank is already a fixed, lettered list; reshuffling it per blank
  // would break the "each option used once" contract the format depends on.
  if (item.optionBank) return item;
  const shuffled = shuffleOptions(item.options, item.answerIndex, item.id);
  if (
    shuffled.answerIndex === item.answerIndex &&
    shuffled.options.every((option, index) => option === item.options[index])
  )
    return item;
  return {
    ...item,
    options: shuffled.options,
    answerIndex: shuffled.answerIndex,
  };
}

export function buildQuestionGroups(
  questions: LibraryQuestion[],
  words: Record<WordKey, WordEntry>,
): QuestionItem[][] {
  const meaningBySense = new Map(
    Object.values(words).flatMap((word) =>
      word.senses.map((sense) => [sense.id, sense.meaningZh] as const),
    ),
  );
  return questions.map((question): QuestionItem[] => {
    if (question.kind === "reading") {
      return question.questions.map((child): QuestionItem => {
        const base: QuestionItem = {
          id: `reading:${question.id}:${child.id}`,
          question,
          prompt: child.prompt,
          options: child.options,
          answerIndex: child.answerIndex,
          wordKey: child.wordKey,
          senseId: child.senseId,
          type: question.format,
          blank: child.blank,
          optionBank: question.optionBank,
          difficulty: question.difficulty,
          meaning: meaningBySense.get(child.senseId) ?? "",
          explanation: child.explanation,
          whyWrong: child.whyWrong,
        };
        return applyOptionShuffle(base);
      });
    }
    if (question.questionStyle !== "vocabulary") return [];
    const base: QuestionItem = {
      id: `question:${question.id}`,
      question,
      prompt: question.prompt,
      options: question.options,
      answerIndex: question.answerIndex,
      wordKey: question.wordKey,
      senseId: question.senseId,
      type: question.questionStyle,
      difficulty: question.difficulty,
      meaning: meaningBySense.get(question.senseId) ?? "",
      explanation: question.explanation,
      whyWrong: question.whyWrong,
    };
    return [applyOptionShuffle(base)];
  });
}
