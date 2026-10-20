// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { AiModel, JobKind, TokenUsage, Tier } from "@/core/ai-contract";
export type AiPhase =
  | "connecting"
  | "thinking"
  | "generating"
  | "reviewing"
  | "validating"
  | "retrying"
  | "rebuilding"
  | "reconnecting";
// A disconnected browser subscribes to the same operation rather than generating again.
export interface AiSession {
  model: AiModel;
  tier: Tier;
  sessionId: string;
  context: string;
  cursor?: string;
  pendingTurn?: {
    id: string;
    signature: string;
    started: boolean;
    createdAt: number;
  };
  /**
   * This round is an extra version of work already generated, so the model is
   * asked for different wording. A round owns its session, so a new run always
   * starts without it.
   */
  append?: boolean;
  notices: string[];
  /** Every turn of this run added together, for the administrator's readout. */
  usage: TokenUsage;
}
export interface AiTurnResult {
  text: string;
  id?: string;
  stopReason: "complete" | "truncated" | "blocked" | "unknown";
  complete: boolean;
  usage?: TokenUsage;
}
export interface AiBatchProgress {
  id: string;
  order: number;
  startedAt: number;
  tokens: number;
  phase: AiPhase;
}
export interface AiTurnOptions {
  signal?: AbortSignal;
  repair?: string;
  onCharacters?: (count: number) => void;
  onTokens?: (count: number) => void;
  onText?: (text: string) => void;
  onPhase?: (phase: AiPhase) => void;
  onBatchStartedAt?: (startedAt: number) => void;
  onCheckpoint?: () => void;
}
export interface AiTask<T> {
  id: string;
  kind: JobKind;
  billableCount: number;
  context: string;
  steps: AiTaskStep<T>[];
  key?: (item: T) => string;
}
export interface AiTaskStep<T> {
  id: string;
  context: string;
  /** Serialized generation data, never a system prompt. */
  prompt: string;
  count: number;
  stagedQuestions?: number;
  retryInvalid?: boolean;
  parse: (text: string) => T[];
  recover?: (
    text: string,
  ) => { items: T[]; completed: number; remaining: AiTaskStep<T>[] } | null;
  split?: () => AiTaskStep<T>[];
}
