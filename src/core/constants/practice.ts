// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { PracticeQuestionTask, PracticeTask } from "../types/session";
import { QUESTION_KINDS } from "@/core/ai-contract";

/** Question formats, in 學測 paper order. */
export const PRACTICE_QUESTION_TASKS: PracticeQuestionTask[] = [
  "meaning",
  "reverse",
  ...QUESTION_KINDS,
];

export const PRACTICE_TASKS: PracticeTask[] = [...PRACTICE_QUESTION_TASKS];

export const DEFAULT_CARD_TASKS: PracticeTask[] = ["meaning"];
export const DEFAULT_QUESTION_TASKS: PracticeQuestionTask[] = [
  ...QUESTION_KINDS,
];

export function isPracticeTask(value: unknown): value is PracticeTask {
  return (
    typeof value === "string" && PRACTICE_TASKS.includes(value as PracticeTask)
  );
}

/** Keeps a task list in the canonical order, de-duplicated. */
export function orderPracticeTasks(
  tasks: readonly PracticeTask[],
): PracticeTask[] {
  return PRACTICE_TASKS.filter((task) => tasks.includes(task));
}
