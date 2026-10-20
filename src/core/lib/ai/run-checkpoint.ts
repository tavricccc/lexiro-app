// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import {
  QUESTION_GENERATION_CONTRACT,
  QUESTION_KINDS,
} from "@/core/ai-contract";
import type { AiSession, AiTask, AiTaskStep } from "@/core/types/ai";
import type { AiRun } from "./runner";
import type { ParallelRunState } from "./parallel-runner";

type StepOrigin = { root: string } | { group: Derivation; index: number };
type StoredOrigin = { root: string } | { group: string; index: number };
interface Derivation {
  id: string;
  parent: StepOrigin;
  kind: "split" | "recover";
  text?: string;
  attempts: Array<{ index: number; text: string }>;
}
interface StoredDerivation extends Omit<Derivation, "parent"> {
  parent: StoredOrigin;
}
interface StoredRun<T> {
  session: AiSession;
  pending: StoredOrigin[];
  items: T[];
  completed: number;
  total: number;
  segments: number;
  repair?: AiRun<T>["repair"];
  parallel?: {
    base: ParallelRunState<T>["base"];
    warmed: boolean;
    lanes: Array<[string, StoredRun<T>]>;
  };
}
export interface AiRunCheckpoint<T> {
  schemaVersion: 1;
  contract: string;
  accountId: string;
  taskId: string;
  context: string;
  groups: StoredDerivation[];
  run: StoredRun<T>;
}

const origins = new WeakMap<object, StepOrigin>();
export const GENERATION_LIFETIME_MS = 30 * 60 * 1000;
function taskContract<T>(task: AiTask<T>) {
  return (QUESTION_KINDS as readonly string[]).includes(task.kind)
    ? QUESTION_GENERATION_CONTRACT
    : "run-v1";
}

export function generationRunExpired<T>(run: AiRun<T>): boolean {
  return (
    Boolean(
      run.session.pendingTurn &&
      Date.now() - run.session.pendingTurn.createdAt >= GENERATION_LIFETIME_MS,
    ) ||
    Boolean(
      run.parallel &&
      [...run.parallel.lanes.values()].some(generationRunExpired),
    )
  );
}

export function registerTaskSteps<T>(task: AiTask<T>) {
  for (const step of task.steps) origins.set(step, { root: step.id });
}

/** Keep the recipe for a derived parser, including shared mutable repair state. */
export function registerDerivedSteps<T>(
  parent: AiTaskStep<T>,
  children: AiTaskStep<T>[],
  kind: Derivation["kind"],
  text?: string,
) {
  const origin = origins.get(parent);
  if (!origin) return;
  const group: Derivation = {
    id: crypto.randomUUID(),
    parent: origin,
    kind,
    text,
    attempts: [],
  };
  children.forEach((step, index) => origins.set(step, { group, index }));
}

/** Repair siblings share a draft; replaying these attempts restores that draft. */
export function recordStepParse<T>(step: AiTaskStep<T>, text: string) {
  const origin = origins.get(step);
  if (origin && "group" in origin)
    origin.group.attempts.push({ index: origin.index, text });
}

export function checkpointRun<T>(
  run: AiRun<T>,
  accountId: string,
): AiRunCheckpoint<T> {
  const groups = new Map<string, StoredDerivation>();
  const storeOrigin = (origin: StepOrigin): StoredOrigin => {
    if ("root" in origin) return origin;
    const group = origin.group;
    if (!groups.has(group.id)) {
      groups.set(group.id, {
        id: group.id,
        parent: storeOrigin(group.parent),
        kind: group.kind,
        text: group.text,
        attempts: group.attempts.map((attempt) => ({ ...attempt })),
      });
    }
    return { group: group.id, index: origin.index };
  };
  const storeRun = (current: AiRun<T>): StoredRun<T> => ({
    session: structuredClone(current.session),
    pending: current.pending.map((step) => storeOrigin(origins.get(step)!)),
    items: [...current.items],
    completed: current.completed,
    total: current.total,
    segments: current.segments,
    repair: current.repair,
    ...(current.parallel
      ? {
          parallel: {
            base: structuredClone(current.parallel.base),
            warmed: current.parallel.warmed,
            lanes: [...current.parallel.lanes].map(([id, lane]) => [
              id,
              storeRun(lane),
            ]),
          },
        }
      : {}),
  });
  const saved = storeRun(run);
  return {
    schemaVersion: 1,
    contract: taskContract(run.task),
    accountId,
    taskId: run.task.id,
    context: run.task.context,
    groups: [...groups.values()],
    run: saved,
  };
}

export function restoreRunCheckpoint<T>(
  checkpoint: AiRunCheckpoint<T>,
  task: AiTask<T>,
  accountId: string,
): { run?: AiRun<T>; reason?: "changed" | "expired" } {
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.contract !== taskContract(task) ||
    checkpoint.accountId !== accountId ||
    checkpoint.taskId !== task.id ||
    checkpoint.context !== task.context
  )
    return { reason: "changed" };
  const expired = (run: StoredRun<T>): boolean =>
    Boolean(
      run.session.pendingTurn &&
      Date.now() - run.session.pendingTurn.createdAt >= GENERATION_LIFETIME_MS,
    ) || Boolean(run.parallel?.lanes.some(([, lane]) => expired(lane)));
  if (expired(checkpoint.run)) return { reason: "expired" };
  registerTaskSteps(task);
  const groups = new Map(checkpoint.groups.map((group) => [group.id, group]));
  const restoredGroups = new Map<string, AiTaskStep<T>[]>();
  const restoreOrigin = (origin: StoredOrigin): AiTaskStep<T> => {
    if ("root" in origin) {
      const step = task.steps.find((step) => step.id === origin.root);
      if (!step) throw new Error("Generation source changed");
      return step;
    }
    let children = restoredGroups.get(origin.group);
    if (!children) {
      const stored = groups.get(origin.group)!;
      const parent = restoreOrigin(stored.parent);
      children =
        stored.kind === "split"
          ? parent.split!()
          : parent.recover!(stored.text!)!.remaining;
      const group: Derivation = {
        ...stored,
        parent: origins.get(parent)!,
        attempts: [...stored.attempts],
      };
      children.forEach((step, index) => origins.set(step, { group, index }));
      restoredGroups.set(stored.id, children);
      for (const attempt of stored.attempts) {
        try {
          children[attempt.index].parse(attempt.text);
        } catch {
          /* A failed parse may still update the shared repair draft. */
        }
      }
    }
    return children[origin.index];
  };
  const restoreRun = (stored: StoredRun<T>): AiRun<T> => ({
    ...stored,
    task,
    session: structuredClone(stored.session),
    pending: stored.pending.map(restoreOrigin),
    ...(stored.parallel
      ? {
          parallel: {
            base: structuredClone(stored.parallel.base),
            warmed: stored.parallel.warmed,
            lanes: new Map(
              stored.parallel.lanes.map(([id, lane]) => [id, restoreRun(lane)]),
            ),
            updates: new Map(),
          },
        }
      : { parallel: undefined }),
  });
  try {
    return { run: restoreRun(checkpoint.run) };
  } catch {
    return { reason: "changed" };
  }
}
