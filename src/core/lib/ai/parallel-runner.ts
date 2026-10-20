// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { AiRun, AiRunUpdate } from "./runner";
import { MAX_PARALLEL_GENERATIONS, type TokenUsage } from "@/core/ai-contract";
import { addUsage } from "@/core/lib/managed-client";
import { savedStreamCounts } from "./stream-progress";

export interface ParallelRunState<T> {
  base: {
    items: T[];
    completed: number;
    segments: number;
    usage: TokenUsage;
    notices: string[];
  };
  lanes: Map<string, AiRun<T>>;
  updates: Map<string, AiRunUpdate<T>>;
  warmed: boolean;
}
type Options<T> = Parameters<typeof import("./runner").runTask<T>>[1];
type RunSingle<T> = (run: AiRun<T>, options: Options<T>) => Promise<void>;

/** Editing accepted results rebases the coordinator while retaining unfinished job IDs. */
export function replaceRunItems<T>(run: AiRun<T>, items: T[]) {
  run.items = [...items];
  const state = run.parallel;
  if (!state) return;
  state.base = {
    items: [...items],
    completed: run.completed,
    segments: run.segments,
    usage: { ...run.session.usage },
    notices: [...run.session.notices],
  };
  state.updates.clear();
  for (const lane of state.lanes.values()) {
    lane.total -= lane.completed;
    lane.items = [];
    lane.completed = 0;
    lane.segments = 0;
    lane.session.usage = {};
    lane.session.notices = [];
  }
}

/** First productive batch warms the shared prefix; then independent lanes share one bound. */
export async function runParallelTask<T>(
  run: AiRun<T>,
  options: Options<T>,
  single: RunSingle<T>,
) {
  const state = (run.parallel ??= {
    base: {
      items: [...run.items],
      completed: run.completed,
      segments: run.segments,
      usage: { ...run.session.usage },
      notices: [...run.session.notices],
    },
    lanes: new Map(),
    updates: new Map(),
    warmed: false,
  });
  const active = new Set<string>();
  const report = () => {
    const lanes = [...state.lanes.values()];
    const combined = [
      ...state.base.items,
      ...lanes.flatMap((lane) => lane.items),
    ];
    run.items = options.merge ? options.merge(combined) : combined;
    run.completed =
      state.base.completed +
      lanes.reduce((sum, lane) => sum + lane.completed, 0);
    run.segments =
      state.base.segments + lanes.reduce((sum, lane) => sum + lane.segments, 0);
    run.session.usage = {
      ...state.base.usage,
      ...(state.base.usage.parts ? { parts: [...state.base.usage.parts] } : {}),
    };
    for (const lane of lanes)
      if (lane.session.usage.parts?.length)
        addUsage(run.session.usage, lane.session.usage);
    run.session.notices = [
      ...new Set([
        ...state.base.notices,
        ...lanes.flatMap((lane) => lane.session.notices),
      ]),
    ];
    const baseCounts = savedStreamCounts(state.base.items, run.task.kind);
    const updates = [...state.updates.values()];
    const batches = [...active].flatMap((id) => {
      const update = state.updates.get(id);
      return update
        ? [
            {
              id,
              order: run.task.steps.findIndex((step) => step.id === id) + 1,
              startedAt: update.batchStartedAt,
              tokens: update.tokens,
              phase: update.phase,
            },
          ]
        : [];
    });
    const current = batches[0];
    options.onUpdate({
      phase: current?.phase ?? "validating",
      characters: updates.reduce((sum, update) => sum + update.characters, 0),
      tokens: current?.tokens ?? 0,
      batchStartedAt: current?.startedAt ?? Date.now(),
      batches,
      receivedUnits: Math.min(
        run.total,
        state.base.completed +
          updates.reduce((sum, update) => sum + update.receivedUnits, 0),
      ),
      parsedSenses:
        baseCounts.senses +
        updates.reduce((sum, update) => sum + update.parsedSenses, 0),
      parsedQuestions:
        baseCounts.questions +
        updates.reduce((sum, update) => sum + update.parsedQuestions, 0),
      items: [...run.items],
      completed: run.completed,
      total: run.total,
      segments: run.segments,
      notices: [...run.session.notices],
      usage: { ...run.session.usage },
    });
  };
  const execute = async (id: string) => {
    const step = run.pending.find((step) => step.id === id)!;
    let lane = state.lanes.get(id);
    if (!lane) {
      lane = {
        task: run.task,
        session: {
          ...run.session,
          usage: {},
          notices: [],
          pendingTurn:
            id === run.pending[0].id ? run.session.pendingTurn : undefined,
        },
        pending: [step],
        items: [],
        completed: 0,
        total: step.count,
        segments: 0,
        ...(run.repair?.stepId === id ? { repair: run.repair } : {}),
      };
      run.session.pendingTurn = undefined;
      run.repair = undefined;
      state.lanes.set(id, lane);
    }
    active.add(id);
    try {
      await single(lane, {
        ...options,
        onUpdate: (update) => {
          state.updates.set(id, update);
          report();
        },
      });
      run.pending.splice(
        run.pending.findIndex((step) => step.id === id),
        1,
      );
      options.onCheckpoint?.();
    } finally {
      active.delete(id);
      report();
    }
  };
  if (!state.warmed && run.pending.length) {
    await execute(run.pending[0].id);
    state.warmed = true;
  }
  let failure: unknown;
  const worker = async () => {
    while (!failure && run.pending.length) {
      const step = run.pending.find((step) => !active.has(step.id));
      if (!step) return;
      try {
        await execute(step.id);
      } catch (reason) {
        failure ??= reason;
      }
    }
  };
  await Promise.all(Array.from({ length: MAX_PARALLEL_GENERATIONS }, worker));
  if (failure) throw failure;
  run.parallel = undefined;
}
