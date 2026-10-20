// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  PracticeSessionSnapshot,
  WorkspaceQuestionDifficulty,
} from "@/core/types";
import { isPracticeTask, orderPracticeTasks } from "../constants/practice";
import { asSenseId } from "./library";
import { isRecord } from "./schema";

const DIFFICULTIES = new Set<WorkspaceQuestionDifficulty>([
  "all",
  "1",
  "2",
  "3",
]);

/** A 文意選填 bank runs to ten options, so a stored choice can reach index 9. */
const MAX_OPTION_INDEX = 9;

function isIntegerArray(value: unknown, upperBound: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => Number.isInteger(item) && item >= 0 && item < upperBound,
    ) &&
    new Set(value).size === value.length
  );
}

/**
 * Reads back an interrupted session.
 *
 * Version 3 queues migrate self-rated cards to local meaning questions.
 * Version 4 also saves meaning choices so a library update cannot reshuffle
 * an interrupted question. Earlier single-mode drafts have no queue to migrate.
 */
export function parsePracticeSession(
  raw: string | null,
  retiredEntryIds: ReadonlySet<string> = new Set(),
): PracticeSessionSnapshot | null {
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion === 3 &&
    Array.isArray(value.tasks) &&
    Array.isArray(value.entryIds)
  ) {
    const wasCard =
      typeof value.entryIds[Number(value.index)] === "string" &&
      value.entryIds[Number(value.index)].startsWith("card:");
    Object.assign(value, {
      schemaVersion: 4,
      tasks: value.tasks.map((task) =>
        task === "flashcard" ? "meaning" : task,
      ),
      entryIds: value.entryIds.map((id) =>
        typeof id === "string"
          ? id.replace(/^card:flashcard:/, "meaning:")
          : id,
      ),
      meaningChoices: {},
      ...(wasCard ? { selected: null, revealed: false } : {}),
    });
  }
  const migrating = value.schemaVersion === 4;
  if (!migrating && value.schemaVersion !== 5) return null;

  const entryIds = value.entryIds;
  const rawTasks = value.tasks;
  const difficulty = value.difficulty;
  if (
    !Array.isArray(entryIds) ||
    entryIds.length === 0 ||
    !entryIds.every((item) => typeof item === "string" && item.trim()) ||
    new Set(entryIds).size !== entryIds.length ||
    !Array.isArray(rawTasks) ||
    rawTasks.length === 0 ||
    !rawTasks.every(
      (task) =>
        isPracticeTask(task) ||
        (migrating && (task === "spelling" || task === "grammar")),
    ) ||
    typeof difficulty !== "string" ||
    !DIFFICULTIES.has(difficulty as WorkspaceQuestionDifficulty) ||
    !readSetIds(value) ||
    !Number.isInteger(value.amount) ||
    Number(value.amount) < 1 ||
    !Number.isInteger(value.index) ||
    Number(value.index) < 0 ||
    Number(value.index) >= entryIds.length ||
    !Number.isInteger(value.correct) ||
    Number(value.correct) < 0 ||
    Number(value.correct) >
      Number(value.index) + (value.selected === null ? 0 : 1) ||
    (value.selected !== null &&
      (!Number.isInteger(value.selected) ||
        Number(value.selected) < 0 ||
        Number(value.selected) > MAX_OPTION_INDEX)) ||
    typeof value.revealed !== "boolean" ||
    typeof value.retrying !== "boolean" ||
    !Array.isArray(value.failedSenseIds) ||
    !value.failedSenseIds.every(
      (item) => typeof item === "string" && item.trim(),
    ) ||
    new Set(value.failedSenseIds).size !== value.failedSenseIds.length ||
    !isIntegerArray(value.wrong, entryIds.length) ||
    !isIntegerArray(value.skipped, entryIds.length) ||
    !isIntegerArray(value.marked, entryIds.length)
  ) {
    return null;
  }

  const rawAnswerChoices = value.answerChoices;
  if (
    rawAnswerChoices !== undefined &&
    (!Array.isArray(rawAnswerChoices) ||
      rawAnswerChoices.length > entryIds.length ||
      rawAnswerChoices.some(
        (item) =>
          item !== null &&
          (!Number.isInteger(item) || item < 0 || item > MAX_OPTION_INDEX),
      ))
  ) {
    return null;
  }

  const meaningChoices = value.meaningChoices;
  if (
    !isRecord(meaningChoices) ||
    Object.entries(meaningChoices).some(
      ([id, choices]) =>
        !entryIds.includes(id) ||
        !isRecord(choices) ||
        !Array.isArray(choices.options) ||
        (id.startsWith("meaning:") || id.startsWith("reverse:")
          ? choices.options.length !== 4
          : choices.options.length < 2 || choices.options.length > 10) ||
        !choices.options.every(
          (option) => typeof option === "string" && option.trim(),
        ) ||
        !Number.isInteger(choices.answerIndex) ||
        Number(choices.answerIndex) < 0 ||
        Number(choices.answerIndex) >= choices.options.length,
    )
  )
    return null;
  const snapshot: PracticeSessionSnapshot = {
    schemaVersion: 5,
    meaningChoices: meaningChoices as PracticeSessionSnapshot["meaningChoices"],
    tasks: orderPracticeTasks(rawTasks.filter(isPracticeTask)),
    setIds: readSetIds(value)!,
    amount: Number(value.amount),
    index: Number(value.index),
    correct: Number(value.correct),
    wrong: value.wrong,
    skipped: value.skipped,
    marked: value.marked,
    selected: value.selected === null ? null : Number(value.selected),
    revealed: value.revealed,
    difficulty: difficulty as WorkspaceQuestionDifficulty,
    entryIds,
    failedSenseIds: value.failedSenseIds.map(asSenseId),
    retrying: value.retrying,
    answerChoices: entryIds.map((_, position) =>
      Array.isArray(rawAnswerChoices)
        ? (rawAnswerChoices[position] ?? null)
        : null,
    ),
  };
  return migrating ? removeRetiredEntries(snapshot, retiredEntryIds) : snapshot;
}

/** Preserve saved answers and positions while removing retired tasks once. */
function removeRetiredEntries(
  snapshot: PracticeSessionSnapshot,
  retired: ReadonlySet<string>,
): PracticeSessionSnapshot | null {
  const kept = snapshot.entryIds.flatMap((id, index) =>
    id.startsWith("card:spelling:") || retired.has(id) ? [] : [index],
  );
  const index = kept.filter((oldIndex) => oldIndex < snapshot.index).length;
  if (!snapshot.tasks.length || index >= kept.length) return null;
  const positions = new Map(kept.map((oldIndex, next) => [oldIndex, next]));
  const remap = (values: number[]) =>
    values.flatMap((oldIndex) =>
      positions.has(oldIndex) ? [positions.get(oldIndex)!] : [],
    );
  const currentKept = positions.has(snapshot.index);
  const selected = currentKept ? snapshot.selected : null;
  const wrong = remap(snapshot.wrong);
  const entryIds = kept.map((oldIndex) => snapshot.entryIds[oldIndex]);
  return {
    ...snapshot,
    index,
    entryIds,
    selected,
    revealed: currentKept && snapshot.revealed,
    correct: index + (selected === null ? 0 : 1) - wrong.length,
    wrong,
    skipped: remap(snapshot.skipped),
    marked: remap(snapshot.marked),
    answerChoices: kept.map((oldIndex) => snapshot.answerChoices[oldIndex]),
    meaningChoices: Object.fromEntries(
      Object.entries(snapshot.meaningChoices).filter(([id]) =>
        entryIds.includes(id),
      ),
    ),
  };
}

/** Sessions saved before multi-set scopes stored one `setId`, empty for all. */
function readSetIds(value: Record<string, unknown>): string[] | null {
  if (value.setIds === undefined)
    return typeof value.setId === "string"
      ? value.setId
        ? [value.setId]
        : []
      : null;
  return Array.isArray(value.setIds) &&
    value.setIds.every((id) => typeof id === "string" && id) &&
    new Set(value.setIds).size === value.setIds.length
    ? [...value.setIds]
    : null;
}

/**
 * A session started inside one set is only offered back on that set's route,
 * so opening a different set does not resume somebody else's queue.
 */
export function canRestorePracticeSession(
  snapshot: PracticeSessionSnapshot,
  initialSet: string,
): boolean {
  return initialSet
    ? snapshot.setIds.length === 1 && snapshot.setIds[0] === initialSet
    : true;
}
