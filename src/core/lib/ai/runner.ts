// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { TokenUsage } from "@/core/ai-contract";
import type {
  AiPhase,
  AiSession,
  AiTask,
  AiTaskStep,
  AiTurnResult,
} from "@/core/types/ai";
import { t } from "@/core/lib/i18n";
import { AiRequestError, AiValidationError } from "./errors";
import { commitTurn, generateTurn, resetConversation } from "./session";
import {
  createStreamProgress,
  savedStreamCounts,
  type StreamCounts,
} from "./stream-progress";
import { runParallelTask, type ParallelRunState } from "./parallel-runner";
import type { AiBatchProgress } from "@/core/types/ai";
import { recordStepParse, registerDerivedSteps } from "./run-checkpoint";

export interface AiRun<T> {
  task: AiTask<T>;
  session: AiSession;
  pending: AiTaskStep<T>[];
  items: T[];
  completed: number;
  total: number;
  segments: number;
  repair?: { stepId: string; feedback: string };
  parallel?: ParallelRunState<T>;
}
export interface AiRunUpdate<T> {
  phase: AiPhase;
  characters: number;
  tokens: number;
  receivedUnits: number;
  parsedSenses: number;
  parsedQuestions: number;
  batchStartedAt: number;
  items: T[];
  completed: number;
  total: number;
  segments: number;
  notices: string[];
  usage: TokenUsage;
  batches?: AiBatchProgress[];
}
export function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
export async function runTask<T>(
  run: AiRun<T>,
  options: {
    signal: AbortSignal;
    onUpdate: (update: AiRunUpdate<T>) => void;
    merge?: (items: T[]) => T[];
    send?: typeof generateTurn;
    wait?: typeof waitForRetry;
    onCheckpoint?: () => void;
  },
) {
  if (run.parallel || run.pending.length > 1)
    return runParallelTask(run, options, runSequentialTask);
  return runSequentialTask(run, options);
}
async function runSequentialTask<T>(
  run: AiRun<T>,
  options: {
    signal: AbortSignal;
    onUpdate: (update: AiRunUpdate<T>) => void;
    merge?: (items: T[]) => T[];
    send?: typeof generateTurn;
    wait?: typeof waitForRetry;
    onCheckpoint?: () => void;
  },
) {
  const send = options.send ?? generateTurn,
    wait = options.wait ?? waitForRetry;
  let phase: AiPhase = "connecting",
    characters = 0,
    tokens = 0;
  let batchStartedAt = Date.now();
  let streamed: StreamCounts = { units: 0, senses: 0, questions: 0 };
  const report = () =>
    options.onUpdate({
      phase,
      characters,
      tokens,
      batchStartedAt,
      receivedUnits: Math.min(run.total, run.completed + streamed.units),
      parsedSenses:
        savedStreamCounts(run.items, run.task.kind).senses + streamed.senses,
      parsedQuestions:
        savedStreamCounts(run.items, run.task.kind).questions +
        (run.pending[0]?.stagedQuestions ?? 0) +
        streamed.questions,
      items: [...run.items],
      completed: run.completed,
      total: run.total,
      segments: run.segments,
      notices: [...run.session.notices],
      usage: { ...run.session.usage },
    });
  report();
  while (run.pending.length) {
    options.signal.throwIfAborted();
    const step = run.pending[0];
    if (run.session.context !== run.task.context) {
      run.session.context = run.task.context;
      resetConversation(run.session);
    }
    let reducedContext = false;
    let reply: AiTurnResult | undefined,
      repair = run.repair?.stepId === step.id ? run.repair.feedback : "",
      parsed: T[] | undefined;
    for (let validation = 0; validation < 2; validation++) {
      const prompt = step.prompt;
      for (let attempt = 0; attempt < 3; attempt++) {
        characters = 0;
        tokens = 0;
        batchStartedAt = Date.now();
        streamed = { units: 0, senses: 0, questions: 0 };
        const parseProgress = createStreamProgress(run.task.kind);
        try {
          reply = await send(run.session, prompt, {
            signal: options.signal,
            repair,
            onCheckpoint: options.onCheckpoint,
            onPhase: (next) => {
              phase = next;
              report();
            },
            onCharacters: (count) => {
              characters = count;
              report();
            },
            onTokens: (count) => {
              tokens = count;
              report();
            },
            onText: (text) => {
              streamed = parseProgress(text);
              report();
            },
            onBatchStartedAt: (startedAt) => {
              batchStartedAt = startedAt;
              report();
            },
          });
          break;
        } catch (reason) {
          options.signal.throwIfAborted();
          if (
            reason instanceof AiRequestError &&
            reason.code === "context_limit" &&
            !reducedContext
          ) {
            reducedContext = true;
            run.session.context = step.context;
            resetConversation(run.session);
            run.session.notices.push(t("ai.contextPartitioned"));
            attempt--;
            continue;
          }
          if (
            reason instanceof AiRequestError &&
            (reason.code === "truncated" || reason.code === "context_limit") &&
            step.split
          ) {
            const smaller = step.split();
            if (smaller.length > 1) {
              registerDerivedSteps(step, smaller, "split");
              run.pending.splice(0, 1, ...smaller);
              run.session.notices.push(t("ai.smallerSegments"));
              options.onCheckpoint?.();
              break;
            }
          }
          if (
            !(reason instanceof AiRequestError) ||
            !reason.retryable ||
            attempt === 2
          )
            throw reason;
          phase = "retrying";
          report();
          await wait(
            reason.retryAfterMs ?? 1000 * 2 ** attempt + Math.random() * 500,
            options.signal,
          );
        }
      }
      if (!reply) break; // The current segment was split; restart with its first child.
      options.signal.throwIfAborted();
      phase = "validating";
      report();
      try {
        recordStepParse(step, reply.text);
        parsed = step.parse(reply.text);
        if (run.task.key) {
          const keys = new Set(run.items.map(run.task.key));
          for (const item of parsed) {
            const key = run.task.key(item);
            if (keys.has(key)) throw new Error(t("ai.duplicateOutput"));
            keys.add(key);
          }
        }
      } catch (reason) {
        let recovered: ReturnType<NonNullable<typeof step.recover>> = null;
        try {
          recovered = step.recover?.(reply.text) ?? null;
        } catch {
          /* The whole document needs repair. */
        }
        if (recovered && run.task.key) {
          const keys = new Set(run.items.map(run.task.key));
          if (recovered.items.some((item) => keys.has(run.task.key!(item))))
            recovered = null;
        }
        if (recovered) {
          registerDerivedSteps(
            step,
            recovered.remaining,
            "recover",
            reply.text,
          );
          streamed = { units: 0, senses: 0, questions: 0 };
          const combined = [...run.items, ...recovered.items];
          run.items = options.merge ? options.merge(combined) : combined;
          run.completed += recovered.completed;
          run.pending.splice(0, 1, ...recovered.remaining);
          run.repair = undefined;
          run.session.notices.push(t("ai.partialRecovered"));
          report();
          options.onCheckpoint?.();
          break;
        }
        const feedback = JSON.stringify({
          error: reason instanceof Error ? reason.message : String(reason),
          previousReply: reply.text,
        }).slice(0, 1000);
        run.repair = { stepId: step.id, feedback };
        if (validation === 1 || step.retryInvalid === false)
          throw new AiValidationError(
            reason instanceof Error ? reason.message : String(reason),
            step.prompt,
            reply.text,
            reply.id,
          );
        repair = feedback;
        reply = undefined;
        continue;
      }
      options.signal.throwIfAborted();
      const combined = [...run.items, ...parsed];
      streamed = { units: 0, senses: 0, questions: 0 };
      run.items = options.merge ? options.merge(combined) : combined;
      commitTurn(run.session, prompt, reply);
      run.pending.shift();
      run.repair = undefined;
      run.completed += step.count;
      run.segments++;
      report();
      options.onCheckpoint?.();
      break;
    }
  }
}
