import type { SenseId, StudyWord, WordKey } from "@/core/types";

// Ported from lexiro/components/practice/{practice-content,meaning-questions}.ts
// so the web and native apps build the same kinds of 英選中 / 中選英 items.

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

/**
 * The pool with every spelling and meaning split once, so building a question
 * costs a few lookups instead of a pass over the whole library.
 */
interface PoolEntry {
  spelling: string;
  english: string;
  meaning: string;
  key: string;
  parts: string[];
}

interface PreparedPool {
  entries: PoolEntry[];
  bySpelling: Map<string, { meanings: string[]; parts: Set<string> }>;
}

const prepared = new WeakMap<readonly StudyWord[], PreparedPool>();

function preparePool(pool: readonly StudyWord[]): PreparedPool {
  const cached = prepared.get(pool);
  if (cached) return cached;
  const entries = pool.map((word) => ({
    spelling: normalizeWord(word.word),
    english: word.word.trim(),
    meaning: word.meaning.trim(),
    key: meaningKey(word.meaning),
    parts: meaningParts(word.meaning),
  }));
  const bySpelling = new Map<
    string,
    { meanings: string[]; parts: Set<string> }
  >();
  for (const entry of entries) {
    const own = bySpelling.get(entry.spelling) ?? {
      meanings: [],
      parts: new Set<string>(),
    };
    own.meanings.push(entry.meaning);
    entry.parts.forEach((part) => own.parts.add(part));
    bySpelling.set(entry.spelling, own);
  }
  const value = { entries, bySpelling };
  prepared.set(pool, value);
  return value;
}

/** Random draws that usually find all three distractors. */
const QUICK_DRAWS = 24;

/**
 * Three distractors in a seeded random order: a few random draws first, then
 * one walk round the pool from a random start for whatever is still missing.
 */
function pickDistractors(
  entries: PoolEntry[],
  seed: string,
  accept: (entry: PoolEntry) => boolean,
): PoolEntry[] {
  const random = seededRandom(seed);
  const picked: PoolEntry[] = [];
  const tried = new Set<number>();
  const tryIndex = (index: number) => {
    if (tried.has(index)) return;
    tried.add(index);
    const entry = entries[index]!;
    if (accept(entry)) picked.push(entry);
  };
  for (let draw = 0; draw < QUICK_DRAWS && picked.length < 3; draw += 1)
    tryIndex(Math.floor(random() * entries.length));
  const offset = Math.floor(random() * entries.length);
  for (let step = 0; step < entries.length && picked.length < 3; step += 1)
    tryIndex((offset + step) % entries.length);
  return picked;
}

function dealOptions(id: string, answer: string, distractors: string[]) {
  const options = seededShuffle([answer, ...distractors], id);
  return { options, answerIndex: options.indexOf(answer) };
}

/** 英選中: every sense may supply the answer, but none may be a distractor. */
function meaningQuestion(
  word: StudyWord,
  pool: PreparedPool,
): QuestionItem | null {
  const spelling = normalizeWord(word.word);
  const own = pool.bySpelling.get(spelling) ?? {
    meanings: [word.meaning.trim()],
    parts: new Set(meaningParts(word.meaning)),
  };
  const seen = new Set<string>();
  const distractors = pickDistractors(
    pool.entries,
    `meaning:${word.id}:distractors`,
    (other) => {
      if (
        other.spelling === spelling ||
        !other.key ||
        !other.parts.length ||
        seen.has(other.key)
      )
        return false;
      if (other.parts.some((part) => own.parts.has(part))) return false;
      seen.add(other.key);
      return true;
    },
  );
  if (distractors.length !== 3) return null;
  const acceptedMeanings = [...new Set(own.meanings)];
  const id = `meaning:${word.id}`;
  return {
    id,
    prompt: word.word,
    ...dealOptions(
      id,
      word.meaning.trim(),
      distractors.map((other) => other.meaning),
    ),
    wordKey: word.wordKey,
    senseId: word.id,
    type: "meaning",
    meaning: acceptedMeanings.join("；"),
    acceptedMeanings,
  };
}

/** 中選英: the Chinese meaning asks for one of four English words. */
function reverseQuestion(
  word: StudyWord,
  pool: PreparedPool,
): QuestionItem | null {
  const answer = word.word.trim();
  const parts = new Set(meaningParts(word.meaning));
  if (!answer || !parts.size) return null;
  const seen = new Set<string>([normalizeWord(word.word)]);
  const distractors = pickDistractors(
    pool.entries,
    `reverse:${word.id}:distractors`,
    (other) => {
      if (!other.spelling || seen.has(other.spelling)) return false;
      // A synonym would be a second right answer.
      if (other.parts.some((part) => parts.has(part))) return false;
      seen.add(other.spelling);
      return true;
    },
  );
  if (distractors.length !== 3) return null;
  const id = `reverse:${word.id}`;
  return {
    id,
    prompt: word.meaning.trim(),
    ...dealOptions(
      id,
      answer,
      distractors.map((other) => other.english),
    ),
    wordKey: word.wordKey,
    senseId: word.id,
    type: "reverse",
    meaning: word.meaning.trim(),
  };
}

function buildQuestion(task: WordTask, word: StudyWord, pool: PreparedPool) {
  return task === "meaning"
    ? meaningQuestion(word, pool)
    : reverseQuestion(word, pool);
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
 * options are dealt in a fresh order every time. Only the questions the
 * session uses are built, so a large set starts as fast as a small one.
 */
export function buildSession(
  targets: readonly StudyWord[],
  pool: readonly StudyWord[],
  tasks: readonly WordTask[],
  amount: number,
): QuestionItem[] {
  if (!tasks.length) return [];
  const ready = preparePool(pool);
  const used = new Set<string>();
  const session: QuestionItem[] = [];
  let turn = 0;
  for (const word of seededShuffle([...targets], String(Math.random()))) {
    if (session.length >= amount) break;
    if (used.has(word.wordKey)) continue;
    // The word takes the next task in turn, or another task it can make.
    let item: QuestionItem | null = null;
    for (let offset = 0; offset < tasks.length && !item; offset += 1)
      item = buildQuestion(tasks[(turn + offset) % tasks.length]!, word, ready);
    if (!item) continue;
    used.add(word.wordKey);
    turn += 1;
    const order = seededShuffle(
      item.options.map((_, i) => i),
      `${item.id}:${Math.random()}`,
    );
    session.push({
      ...item,
      options: order.map((i) => item.options[i]!),
      answerIndex: order.indexOf(item.answerIndex),
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
  const ready = preparePool(pool);
  const words = new Set<string>();
  for (const word of targets)
    if (
      !words.has(word.wordKey) &&
      tasks.some((task) => buildQuestion(task, word, ready))
    )
      words.add(word.wordKey);
  return words.size;
}
