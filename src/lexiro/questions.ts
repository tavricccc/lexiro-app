import type { SenseId, StudyWord, WordKey } from "./types";

// Ported from lexiro/components/practice/{practice-content,meaning-questions}.ts
// so the web and native apps build the same 英選中 / 中選英 items.

export type WordTask = "meaning" | "reverse";

export interface QuestionItem {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  wordKey: WordKey;
  senseId: SenseId;
  type: WordTask;
  meaning: string;
  acceptedMeanings?: string[];
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
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

export function normalizeWord(word: string): string {
  return word.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function meaningKey(meaning: string): string {
  return meaning.normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "");
}

function meaningParts(meaning: string): string[] {
  return meaning
    .split(/[，、；;／/]|(?:\s+或\s+)/u)
    .map(meaningKey)
    .filter(Boolean);
}

/** 英選中: every sense may supply the answer, but none may be a distractor. */
export function buildMeaningQuestions(
  targets: readonly StudyWord[],
  pool: readonly StudyWord[],
): QuestionItem[] {
  const bySpelling = new Map<string, { meanings: string[]; parts: Set<string> }>();
  for (const word of pool) {
    const spelling = normalizeWord(word.word);
    const entry = bySpelling.get(spelling) ?? { meanings: [], parts: new Set<string>() };
    entry.meanings.push(word.meaning.trim());
    meaningParts(word.meaning).forEach((part) => entry.parts.add(part));
    bySpelling.set(spelling, entry);
  }
  return targets.flatMap((word) => {
    const spelling = normalizeWord(word.word);
    const own = bySpelling.get(spelling) ?? {
      meanings: [word.meaning.trim()],
      parts: new Set(meaningParts(word.meaning)),
    };
    const acceptedMeanings = [...new Set(own.meanings)];
    const seen = new Set<string>();
    const distractors = seededShuffle([...pool], `meaning:${word.id}:distractors`)
      .filter((other) => {
        if (normalizeWord(other.word) === spelling) return false;
        const key = meaningKey(other.meaning);
        const parts = meaningParts(other.meaning);
        if (
          !key ||
          !parts.length ||
          parts.some((part) => own.parts.has(part)) ||
          seen.has(key)
        )
          return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3)
      .map((other) => other.meaning.trim());
    if (distractors.length !== 3) return [];
    const id = `meaning:${word.id}`;
    const options = seededShuffle([word.meaning.trim(), ...distractors], id);
    return [
      {
        id,
        prompt: word.word,
        options,
        answerIndex: options.indexOf(word.meaning.trim()),
        wordKey: word.wordKey,
        senseId: word.id,
        type: "meaning" as const,
        meaning: acceptedMeanings.join("；"),
        acceptedMeanings,
      },
    ];
  });
}

/** 中選英: the Chinese meaning asks for one of four English words. */
export function buildReverseQuestions(
  targets: readonly StudyWord[],
  pool: readonly StudyWord[],
): QuestionItem[] {
  return targets.flatMap((word) => {
    const answer = word.word.trim();
    const spelling = normalizeWord(word.word);
    const parts = new Set(meaningParts(word.meaning));
    if (!answer || !parts.size) return [];
    const seen = new Set<string>([spelling]);
    const distractors = seededShuffle([...pool], `reverse:${word.id}:distractors`)
      .filter((other) => {
        const key = normalizeWord(other.word);
        if (!key || seen.has(key)) return false;
        // A synonym would be a second right answer.
        if (meaningParts(other.meaning).some((part) => parts.has(part)))
          return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3)
      .map((other) => other.word.trim());
    if (distractors.length !== 3) return [];
    const id = `reverse:${word.id}`;
    const options = seededShuffle([answer, ...distractors], id);
    return [
      {
        id,
        prompt: word.meaning.trim(),
        options,
        answerIndex: options.indexOf(answer),
        wordKey: word.wordKey,
        senseId: word.id,
        type: "reverse" as const,
        meaning: word.meaning.trim(),
      },
    ];
  });
}

export function isCorrectChoice(item: QuestionItem, choice: number): boolean {
  if (item.type !== "meaning") return choice === item.answerIndex;
  const option = item.options[choice];
  return (
    option !== undefined &&
    Boolean(
      item.acceptedMeanings?.some(
        (meaning) => meaningKey(meaning) === meaningKey(option),
      ),
    )
  );
}

/**
 * One session: each word appears once, the chosen tasks take turns, and the
 * options are dealt in a fresh order every time.
 */
export function buildSession(
  targets: readonly StudyWord[],
  pool: readonly StudyWord[],
  tasks: readonly WordTask[],
  amount: number,
): QuestionItem[] {
  const shuffled = seededShuffle([...targets], String(Math.random()));
  const byTask = tasks.map((task) =>
    task === "meaning"
      ? buildMeaningQuestions(shuffled, pool)
      : buildReverseQuestions(shuffled, pool),
  );
  const cursors = byTask.map(() => 0);
  const used = new Set<string>();
  const session: QuestionItem[] = [];
  let advanced = true;
  while (session.length < amount && advanced) {
    advanced = false;
    byTask.forEach((items, index) => {
      while (session.length < amount && cursors[index]! < items.length) {
        const item = items[cursors[index]!]!;
        cursors[index] = cursors[index]! + 1;
        if (used.has(item.wordKey)) continue;
        used.add(item.wordKey);
        const order = seededShuffle(
          item.options.map((_, i) => i),
          `${item.id}:${Math.random()}`,
        );
        session.push({
          ...item,
          options: order.map((i) => item.options[i]!),
          answerIndex: order.indexOf(item.answerIndex),
        });
        advanced = true;
        break;
      }
    });
  }
  return session;
}

/** How many distinct words a session could draw for these tasks. */
export function availableCount(
  targets: readonly StudyWord[],
  pool: readonly StudyWord[],
  tasks: readonly WordTask[],
): number {
  const words = new Set<string>();
  for (const task of tasks)
    for (const item of task === "meaning"
      ? buildMeaningQuestions(targets, pool)
      : buildReverseQuestions(targets, pool))
      words.add(item.wordKey);
  return words.size;
}
