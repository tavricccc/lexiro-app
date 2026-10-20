// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiModel, Tier, TokenUsage } from "@/core/ai-contract";
import type { AiTask, AiPhase, AiBatchProgress } from "@/core/types/ai";
import { createAiSession, resetConversation } from "@/core/lib/ai/session";
import { runTask, type AiRun } from "@/core/lib/ai/runner";
import { replaceRunItems } from "@/core/lib/ai/parallel-runner";
import { AiRequestError, AiValidationError } from "@/core/lib/ai/errors";
import { useCloudStore } from "@/core/stores/cloud-store";
import { t } from "@/core/lib/i18n";
import {
  checkpointRun,
  generationRunExpired,
  registerTaskSteps,
  restoreRunCheckpoint,
  type AiRunCheckpoint,
} from "@/core/lib/ai/run-checkpoint";

type AiRunStatus = "idle" | "running" | "done" | "error" | "cancelled";

/**
 * Hands a finished run to the step that reviews it, once per run.
 *
 * Watching the status alone is not enough: coming back from the review step to
 * change a tier leaves the status at "done", and the flow would bounce forward
 * again before the user could press anything. Each new run re-arms the handover.
 */
export function useReviewHandoff(status: AiRunStatus, onDone: () => void) {
  const handed = useRef(false);
  const latest = useRef(onDone);
  latest.current = onDone;
  useEffect(() => {
    if (status === "running") handed.current = false;
    else if (status === "done" && !handed.current) {
      handed.current = true;
      latest.current();
    }
  }, [status]);
}
export interface AiRunState<T> {
  model?: AiModel;
  status: AiRunStatus;
  phase: AiPhase;
  characters: number;
  tokens?: number;
  receivedUnits?: number;
  parsedSenses?: number;
  parsedQuestions?: number;
  batchStartedAt?: number;
  batches?: AiBatchProgress[];
  completed: number;
  total: number;
  segments: number;
  error: string;
  items: T[];
  notices: string[];
  startedAt: number | null;
  elapsedMs: number;
  remaining: number;
  usage: TokenUsage;
  diagnostic: {
    request?: string;
    response: string;
    responseId?: string;
  } | null;
  resumeUnavailable?: "changed" | "expired" | "legacy";
}
export interface AiGenerationSnapshot<T> {
  state: AiRunState<T>;
  tier: Tier;
  checkpoint?: AiRunCheckpoint<T>;
}
const initialState = <T>(): AiRunState<T> => ({
  status: "idle",
  phase: "connecting",
  characters: 0,
  completed: 0,
  total: 0,
  segments: 0,
  error: "",
  items: [],
  notices: [],
  startedAt: null,
  elapsedMs: 0,
  remaining: 0,
  usage: {},
  diagnostic: null,
});

function restoreGeneration<T>(
  snapshot: AiGenerationSnapshot<T> | undefined,
  task: AiTask<T> | undefined,
  accountId: string,
) {
  if (!snapshot) return { state: initialState<T>(), run: undefined };
  const previous = snapshot.state;
  const restored: {
    run?: AiRun<T>;
    reason?: "changed" | "expired" | "legacy";
  } =
    snapshot.checkpoint && task
      ? restoreRunCheckpoint(snapshot.checkpoint, task, accountId)
      : { reason: previous.remaining ? ("legacy" as const) : undefined };
  const run = restored.run;
  const remaining = run?.pending.length ?? previous.remaining;
  const done = previous.status === "done" && remaining === 0;
  const state: AiRunState<T> = {
    ...previous,
    ...(run
      ? {
          items: run.items,
          completed: run.completed,
          total: run.total,
          segments: run.segments,
        }
      : {}),
    status: done
      ? "done"
      : previous.status === "error"
        ? "error"
        : previous.status === "idle"
          ? "idle"
          : "cancelled",
    startedAt: null,
    diagnostic: null,
    remaining,
    receivedUnits: run?.completed ?? previous.completed,
    batches: undefined,
    resumeUnavailable: remaining
      ? (previous.resumeUnavailable ?? restored.reason)
      : undefined,
  };
  return { state, run };
}

export function useAiGeneration<T>({
  initialSnapshot,
  merge,
  onSnapshotChange,
  task,
}: {
  initialSnapshot?: AiGenerationSnapshot<T>;
  merge?: (items: T[]) => T[];
  onSnapshotChange?: (snapshot: AiGenerationSnapshot<T>) => void;
  task?: AiTask<T>;
} = {}) {
  const ready = useCloudStore((store) => store.ready);
  const uid = useCloudStore((store) => store.user?.uid);
  const [restored] = useState(() =>
    restoreGeneration(initialSnapshot, task, uid ?? "local"),
  );
  const [state, setState] = useState<AiRunState<T>>(restored.state);
  const [tier, setTier] = useState<Tier>(initialSnapshot?.tier ?? "lite");
  const [itemsRevision, setItemsRevision] = useState(0);
  const abortRef = useRef<AbortController | null>(null),
    runRef = useRef<AiRun<T> | null>(restored.run ?? null),
    generationId = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const uidRef = useRef(uid);
  uidRef.current = uid;
  const tierRef = useRef(tier);
  tierRef.current = tier;
  const mergeRef = useRef(merge);
  mergeRef.current = merge;
  const onSnapshotRef = useRef(onSnapshotChange);
  onSnapshotRef.current = onSnapshotChange;
  const firstSnapshot = useRef(true);
  useEffect(() => {
    if (firstSnapshot.current) {
      firstSnapshot.current = false;
      return;
    }
    onSnapshotRef.current?.({
      state: { ...state, diagnostic: null, startedAt: null },
      tier,
      ...(runRef.current
        ? {
            checkpoint: checkpointRun(
              runRef.current,
              uidRef.current ?? "local",
            ),
          }
        : {}),
    });
  }, [state.status, state.completed, state.segments, tier, itemsRevision]);
  const previousUid = useRef(uid);
  useEffect(() => {
    if (previousUid.current === uid) return;
    previousUid.current = uid;
    generationId.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    runRef.current = null;
    setState(initialState<T>());
  }, [uid]);
  useEffect(
    () => () => {
      generationId.current++;
      abortRef.current?.abort();
    },
    [],
  );
  const execute = useCallback(async (run: AiRun<T>) => {
    abortRef.current?.abort();
    const controller = new AbortController(),
      id = ++generationId.current,
      start = Date.now();
    abortRef.current = controller;
    setState((s) => ({
      ...s,
      status: "running",
      model: run.session.model,
      error: "",
      diagnostic: null,
      startedAt: start,
      items: [...run.items],
      completed: run.completed,
      total: run.total,
      remaining: run.pending.length,
    }));
    try {
      await runTask(run, {
        signal: controller.signal,
        merge: mergeRef.current,
        onCheckpoint: () => {
          if (id !== generationId.current) return;
          onSnapshotRef.current?.({
            state: {
              ...stateRef.current,
              status: "running",
              startedAt: null,
              diagnostic: null,
              items: [...run.items],
              completed: run.completed,
              total: run.total,
              segments: run.segments,
              remaining: run.pending.length,
            },
            tier: tierRef.current,
            checkpoint: checkpointRun(run, uidRef.current ?? "local"),
          });
        },
        onUpdate: (update) => {
          if (id === generationId.current)
            setState((s) => ({
              ...s,
              ...update,
              remaining: run.pending.length,
            }));
        },
      });
      if (id === generationId.current)
        setState((s) => ({
          ...s,
          status: "done",
          startedAt: null,
          elapsedMs: s.elapsedMs + Date.now() - start,
          remaining: 0,
        }));
    } catch (reason) {
      if (id === generationId.current) {
        const diagnostic = controller.signal.aborted
          ? null
          : reason instanceof AiValidationError
            ? {
                request: reason.request,
                response: reason.response,
                responseId: reason.responseId,
              }
            : reason instanceof AiRequestError
              ? {
                  response:
                    reason.debugMessage ??
                    JSON.stringify({
                      code: reason.code,
                      status: reason.status,
                      message: reason.message,
                    }),
                }
              : {
                  response:
                    reason instanceof Error ? reason.message : String(reason),
                };
        setState((s) => ({
          ...s,
          status: controller.signal.aborted ? "cancelled" : "error",
          startedAt: null,
          elapsedMs: s.elapsedMs + Date.now() - start,
          remaining: run.pending.length,
          usage: { ...run.session.usage },
          error: controller.signal.aborted
            ? ""
            : reason instanceof Error
              ? reason.message
              : t("ai.invalidReply"),
          diagnostic,
          resumeUnavailable:
            reason instanceof AiRequestError &&
            reason.code === "generation_expired"
              ? "expired"
              : reason instanceof AiRequestError &&
                  [
                    "generation_update_required",
                    "question_update_required",
                  ].includes(reason.code ?? "")
                ? "changed"
                : undefined,
        }));
      }
    } finally {
      if (id === generationId.current) abortRef.current = null;
    }
  }, []);
  const start = useCallback(
    (task: AiTask<T>, seed: T[] = []) => {
      if (abortRef.current) return;
      if (!ready || (task.steps.length && !uid)) {
        setState((s) => ({
          ...s,
          status: "error",
          error: t("managed.signInRequired"),
        }));
        return;
      }
      const run: AiRun<T> = {
        task,
        session: createAiSession(tier, task.context),
        pending: [...task.steps],
        items: [...seed],
        completed: seed.length,
        total: seed.length + task.steps.reduce((n, s) => n + s.count, 0),
        segments: 0,
      };
      runRef.current = run;
      registerTaskSteps(task);
      setState(initialState<T>());
      void execute(run);
    },
    [execute, ready, uid, tier],
  );
  const resume = useCallback(() => {
    const run = runRef.current;
    if (
      abortRef.current ||
      !run?.pending.length ||
      stateRef.current.resumeUnavailable
    )
      return;
    if (generationRunExpired(run)) {
      setState((previous) => ({
        ...previous,
        status: "cancelled",
        error: "",
        resumeUnavailable: "expired",
      }));
      return;
    }
    void execute(run);
  }, [execute]);
  const append = useCallback(
    (task?: AiTask<T>) => {
      const run = runRef.current;
      if (!run || abortRef.current || run.pending.length) return;
      if (task) run.task = task;
      registerTaskSteps(run.task);
      if (run.session.context !== run.task.context || run.session.tier !== tier)
        resetConversation(run.session);
      run.session.context = run.task.context;
      run.session.tier = tier;
      run.session.sessionId = crypto.randomUUID();
      run.session.append = true;
      run.pending = [...run.task.steps];
      run.total += run.pending.reduce((n, s) => n + s.count, 0);
      void execute(run);
    },
    [execute, tier],
  );
  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => {
    generationId.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    runRef.current = null;
    setState(initialState<T>());
  }, []);
  const setItems = useCallback((items: T[]) => {
    if (runRef.current) replaceRunItems(runRef.current, items);
    setState((s) => ({ ...s, items }));
    setItemsRevision((value) => value + 1);
  }, []);
  return {
    state,
    ready,
    configured: Boolean(uid && process.env.NEXT_PUBLIC_AI_WORKER_URL),
    canResume: Boolean(
      runRef.current?.pending.length && !state.resumeUnavailable,
    ),
    canAppend: Boolean(runRef.current && !runRef.current.pending.length),
    tier,
    setTier,
    start,
    resume,
    append,
    cancel,
    reset,
    setItems,
  };
}
