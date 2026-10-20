// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
export * from "./words";
export * from "./formats";
export * from "./question-quality";

export const AI_MODELS = ["gpt-5.6-luna", "gpt-6-luna"] as const;
export type AiModel = (typeof AI_MODELS)[number];
export const DEFAULT_AI_MODEL: AiModel = "gpt-6-luna";
export const PRO_AI_MODEL = "gpt-6.1-sol";
export const LONG_CONTEXT_MODELS: readonly string[] = [...AI_MODELS, PRO_AI_MODEL];
export function generationModel(model: AiModel, tier: Tier): string {
  return tier === "pro" ? PRO_AI_MODEL : model;
}
/** Estimate at the largest token-price ratio; settlement uses actual usage. */
const MODEL_ESTIMATE_FACTOR: Record<AiModel, number> = {
  "gpt-5.6-luna": 2.4,
  "gpt-6-luna": 1,
};

export const TIERS = ["lite", "thinking", "pro"] as const;
export type Tier = (typeof TIERS)[number];
/** Pro uses Sol at low effort; estimate at its largest price ratio to Luna. */
export const MULTIPLIER: Record<Tier, number> = {
  lite: 1,
  thinking: 2,
  pro: 20,
};
export const QUESTION_KINDS = [
  "vocabulary",
  "cloze",
  "wordBank",
  "discourse",
  "reading",
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
/** One generation supplies questions and per-choice teaching. */
export const QUESTION_GENERATION_CONTRACT = "single-pass-v3";
/** Warm the first productive batch, then share this bound across client and leases. */
export const MAX_PARALLEL_GENERATIONS = 4;
/**
 * `senses` supplements a word that is already in the Library with meanings it
 * does not have yet. It is priced per word rather than per meaning returned:
 * paying by the meaning would pay a model to pad, which is the one thing the
 * job must not do — returning nothing is a correct answer for most words.
 */
export type JobKind =
  | QuestionKind
  | "words"
  | "senses"
  | "organizeText"
  | "organizeImage"
  | "explain";
export interface QuestionSource {
  ref: string;
  word: string;
  pos: string;
  meaningZh: string;
  knownExample?: string;
}
export interface GenerationInput {
  kind: JobKind;
  raw?: string;
  sources?: QuestionSource[];
  difficulty?: 1 | 2 | 3;
  /** For `senses`, the most meanings one word may gain. Fewer is a valid answer. */
  limit?: 1 | 2 | 3;
  itemRepair?: { index: number; passage: string; items: unknown[]; extraOptions?: string[] };
}
export interface GenerationRequest extends GenerationInput {
  model: AiModel;
  session: string;
  tier: Tier;
  cursor?: string;
  repair?: string;
}
export interface AccountInfo {
  points: number;
  monthly: number;
  renews_at: number | null;
  /** Administrators run against the provider directly and are never charged. */
  admin: boolean;
}
export interface AdminAccount {
  version: number;
  uid: string;
  email: string;
  points: number;
  monthly: number;
  renews_at: number;
  note: string | null;
}
export interface AdminAccountAdjustment {
  /** Snapshot reviewed by the administrator; stale edits never overwrite it. */
  expected: Pick<AdminAccount, "version" | "points" | "monthly" | "renews_at" | "note">;
  addPoints?: number;
  monthly?: number;
  note?: string;
}
export interface AdminSettingsValue {
  version: number;
  freeTrial: boolean;
  defaultInitial: number;
  defaultMonthly: number;
}
export interface AdminSettingsAdjustment extends Partial<Omit<AdminSettingsValue, "version">> {
  expected: AdminSettingsValue;
}
export interface TokenUsage {
  /** Provider responses priced individually before combining a reviewed turn. */
  parts?: TokenUsage[];
  model?: string;
  input?: number;
  cached?: number;
  cacheWrite?: number;
  output?: number;
  reasoning?: number;
  credits?: number;
  costUsd?: number;
  uncachedCostUsd?: number;
}
export interface AdminUsageEntry {
  id: string;
  uid: string;
  email: string | null;
  model: string;
  points: number;
  credits: number | null;
  costUsd: number | null;
  input: number | null;
  cached: number | null;
  cacheWrite: number | null;
  output: number | null;
  created_at: number;
  status: string;
  usageState: "reported" | "pending" | "unavailable";
  assessedPoints: number | null;
  debitVerified: 0 | 1;
}
/**
 * One kind of work at one tier, over a month of runs.
 *
 * `credits / units` is cost per billable unit, which is the quantity `rate`
 * names in half-points — so `rate(kind, tier) / 2` beside it says whether the
 * price is above or below what the work costs.
 */
export interface AdminKindUsage {
  model: string;
  kind: JobKind;
  tier: Tier;
  runs: number;
  units: number;
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
  credits: number | null;
  costUsd: number | null;
  points: number;
}
/** One account's month of runs on one model: provider cost and points charged. */
export interface AdminUserUsage {
  uid: string;
  email: string | null;
  model: string;
  runs: number;
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
  credits: number | null;
  costUsd: number | null;
  points: number;
}
export interface AdminAccountsPage {
  accounts: AdminAccount[];
  nextCursor: string | null;
}
export interface AdminUsageReport {
  entries: AdminUsageEntry[];
  nextCursor: string | null;
  pendingUsage: number;
  unavailableUsage: number;
  unverifiedDebits: number;
  models: {
    model: string;
    runs: number;
    input: number;
    cached: number;
    cacheWrite: number;
    output: number;
    credits: number | null;
    costUsd: number | null;
  }[];
  users: AdminUserUsage[];
  kinds: AdminKindUsage[];
}
export interface AdminUsageTotals {
  runs: number;
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
  cost: number;
}

/**
 * Published provider Standard prices in USD per million tokens. Cached reads
 * cost 0.1x and cache writes cost 1.25x the
 * uncached input rate. Only an administrator sees money, so this is an
 * operating estimate rather than a price anyone is quoted.
 */
export const MODEL_PRICES: Record<
  string,
  { input: number; cached: number; cacheWrite: number; output: number }
> = {
  "gpt-5.6-luna": { input: 0.2, cached: 0.02, cacheWrite: 0.25, output: 1.2 },
  "gpt-6-luna": { input: 0.1, cached: 0.01, cacheWrite: 0.125, output: 0.5 },
  "gpt-5.6-terra": { input: 2, cached: 0.2, cacheWrite: 2.5, output: 12 },
  "gpt-6.1-sol": { input: 2, cached: 0.1, cacheWrite: 2.5, output: 10 },
};
export const LONG_CONTEXT_INPUT_THRESHOLD = 272_000;
export function estimateCost(usage: TokenUsage): number | null {
  const price = usage.model ? MODEL_PRICES[usage.model] : undefined;
  if (!price || usage.input === undefined || usage.output === undefined) return null;
  const cached = usage.cached ?? 0;
  const cacheWrite = usage.cacheWrite ?? 0;
  if (cached + cacheWrite > usage.input) return null;
  const fresh = usage.input - cached - cacheWrite;
  return (
    (fresh * price.input +
      cached * price.cached +
      cacheWrite * price.cacheWrite +
      usage.output * price.output) /
    1_000_000
  );
}
/** Price one provider response, including GPT-6 Luna's long-context tier. */
export function responseCost(usage: TokenUsage): number | null {
  if (usage.parts) {
    const costs = usage.parts.map(responseCost);
    return costs.some((cost) => cost === null)
      ? null
      : costs.reduce<number>((sum, cost) => sum + cost!, 0);
  }
  const ordinary = estimateCost(usage);
  const input = usage.input;
  const output = usage.output;
  if (
    ordinary === null ||
    input === undefined ||
    output === undefined ||
    usage.model === undefined ||
    !LONG_CONTEXT_MODELS.includes(usage.model) ||
    input <= LONG_CONTEXT_INPUT_THRESHOLD
  ) return ordinary;
  const outputCost = (output * MODEL_PRICES[usage.model].output) / 1_000_000;
  return 2 * (ordinary - outputCost) + 1.5 * outputCost;
}
export const LIMITS = {
  input: 5000,
  source: 200,
  sources: 30,
  outputTokens: 8192,
  imageBytes: 1_500_000,
  imageEdge: 1800,
  images: 10,
  // Ten base64-encoded 1.5 MB images, separated by nine newlines.
  bodyBytes: 20_000_009,
} as const;

/**
 * Rates are half-points so all intermediate arithmetic stays integral.
 *
 * Calibrated against measured runs, one unit being one source word except for
 * discourse and reading, which are one document however many words went in.
 * Question estimates include the single drafting and teaching response. These are planning
 * estimates; actual reasoning, teaching text and cache use determine settlement.
 */
export function rate(kind: JobKind, tier: Tier, model: AiModel = DEFAULT_AI_MODEL): number {
  const effectiveTier = kind === "explain" ? "lite" : tier;
  const factor = effectiveTier === "pro" ? 1 : MODEL_ESTIMATE_FACTOR[model];
  const base = kind === "organizeImage" ? 12 * MULTIPLIER[effectiveTier] : kind === "organizeText" ? 10 * MULTIPLIER[effectiveTier] : kind === "explain" ? 10 : (
    {
      words: 2,
      senses: 2,
      vocabulary: 1,
      wordBank: 2,
      cloze: 3,
      discourse: 24,
      reading: 30,
    }[kind] * MULTIPLIER[tier]
  );
  return Math.ceil(base * factor);
}
export function estimatePoints(
  kind: JobKind,
  count: number,
  tier: Tier,
  model: AiModel = DEFAULT_AI_MODEL,
): { min: number; max: number } {
  const max = Math.ceil((rate(kind, tier, model) * count) / 2);
  return { min: kind === "reading" ? Math.ceil(count * 9 * MULTIPLIER[tier] * (tier === "pro" ? 1 : MODEL_ESTIMATE_FACTOR[model])) : max, max };
}
