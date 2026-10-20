// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { getFirebaseAuth } from "@/core/lib/firebase";
import { AiRequestError } from "@/core/lib/ai/errors";
import type { AiSession, AiTurnOptions, AiTurnResult } from "@/core/types/ai";
import {
  responseCost,
  QUESTION_KINDS,
  QUESTION_GENERATION_CONTRACT,
} from "@/core/ai-contract";
import type {
  AccountInfo,
  GenerationInput,
  TokenUsage,
} from "@/core/ai-contract";
import { t, type TranslationKey } from "./i18n";
import { resumeGeneration } from "./generation-connection";
import { appCheckHeaders } from "@/core/lib/app-check";
import { fetch as streamingFetch } from "expo/fetch";

export const MANAGED_ACCOUNT_CHANGED = "lexiro:managed-account-changed";
export function notifyManagedAccountChanged() {
  window.dispatchEvent(new Event(MANAGED_ACCOUNT_CHANGED));
}
const messages: Record<number, TranslationKey> = {
  401: "managed.signInRequired",
  402: "managed.noPoints",
  409: "managed.inProgress",
  413: "managed.inputLimit",
  429: "managed.rateLimited",
  503: "managed.unavailable",
};
const adminMessages: Record<number, TranslationKey> = {
  400: "admin.invalidInput",
  404: "admin.dataUnavailable",
  409: "admin.accountBusy",
  500: "admin.failed",
  503: "admin.unavailable",
};

export async function managedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  init = {
    ...init,
    signal: AbortSignal.any([
      ...(init.signal ? [init.signal] : []),
      AbortSignal.timeout(
        /^\/(generate|organize|generation)(\/|$)/.test(path)
          ? 660_000
          : 120_000,
      ),
    ]),
  };
  const base = process.env.NEXT_PUBLIC_AI_WORKER_URL;
  const adminRequest = path.startsWith("/admin/");
  if (!base)
    throw new AiRequestError(
      t(adminRequest ? "admin.unavailable" : "managed.unavailable"),
      { retryable: false },
    );
  const auth = getFirebaseAuth();
  if (!auth)
    throw new AiRequestError(t("managed.signInRequired"), {
      status: 401,
      retryable: false,
    });
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user)
    throw new AiRequestError(t("managed.signInRequired"), {
      status: 401,
      retryable: false,
    });
  const uid = user.uid;
  for (let attempt = 0; attempt < 2; attempt++) {
    init.signal?.throwIfAborted();
    const token = await user.getIdToken(attempt === 1);
    if (auth.currentUser?.uid !== uid)
      throw new DOMException("Account changed", "AbortError");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    for (const [name, value] of Object.entries(await appCheckHeaders()))
      headers.set(name, value);
    let response: Response;
    try {
      response = await (streamingFetch as unknown as typeof fetch)(`${base.replace(/\/$/, "")}${path}`, {
        ...init,
        headers,
      });
    } catch (reason) {
      if (init.signal?.aborted) throw init.signal.reason;
      throw new AiRequestError(
        t(adminRequest ? "admin.unavailable" : "managed.unavailable"),
        {
          retryable: true,
          code: reason instanceof TypeError ? "network" : "request_failed",
        },
      );
    }
    if (auth.currentUser?.uid !== uid) {
      await response.body?.cancel();
      throw new DOMException("Account changed", "AbortError");
    }
    if (response.status === 401 && attempt === 0) {
      await response.body?.cancel();
      continue;
    }
    if (!response.ok) {
      const responseText = await response.text();
      let code: string | undefined;
      let debugMessage = responseText;
      try {
        const body = JSON.parse(responseText);
        code =
          typeof body?.error?.code === "string" ? body.error.code : undefined;
        if (typeof body?.error?.message === "string")
          debugMessage = body.error.message;
        if (body?.error?.diagnostic)
          debugMessage = JSON.stringify(body.error.diagnostic);
      } catch {
        /* Keep the response text so the photo flow can expose it for debugging. */
      }
      const retryAfter = response.headers.get("retry-after");
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const retryAfterMs =
        retryAfter === null
          ? undefined
          : Number.isFinite(seconds)
            ? Math.max(0, seconds * 1000)
            : Math.max(0, Date.parse(retryAfter) - Date.now());
      throw new AiRequestError(
        t(
          code === "stale_account"
            ? "admin.staleAccount"
            : code === "stale_settings"
              ? "admin.staleSettings"
              : code === "account_exists"
                ? "managed.accountExists"
                : code === "retry_limit"
                  ? "managed.retryLimit"
                  : code === "generation_expired"
                    ? "ai.generationExpired"
                    : code === "generation_update_required"
                      ? "managed.questionUpdateRequired"
                      : code === "question_quality_rejected"
                        ? "managed.questionQualityRejected"
                        : code === "question_update_required"
                          ? "managed.questionUpdateRequired"
                          : adminRequest && adminMessages[response.status]
                            ? adminMessages[response.status]
                            : (messages[response.status] ??
                              (adminRequest
                                ? "admin.failed"
                                : "managed.failed")),
        ),
        {
          status: response.status,
          code,
          debugMessage,
          retryAfterMs: Number.isFinite(retryAfterMs)
            ? retryAfterMs
            : undefined,
          retryable:
            code !== "retry_limit" &&
            code !== "question_quality_rejected" &&
            (response.status === 429 || response.status >= 500),
        },
      );
    }
    return response;
  }
  throw new AiRequestError(t("managed.signInRequired"), {
    status: 401,
    retryable: false,
  });
}

export async function managedJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await managedFetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  return response.json() as Promise<T>;
}
export const getManagedAccount = () => managedJson<AccountInfo>("/me");

export async function readManagedStream(
  response: Response,
  options: AiTurnOptions,
): Promise<AiTurnResult> {
  if (!response.body)
    throw new AiRequestError(t("ai.emptyReply"), { retryable: true });
  options.onText?.("");
  options.onCharacters?.(0);
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    text = "",
    id: string | undefined,
    complete = false;
  const { countTokens } = options.onTokens
    ? await import("gpt-tokenizer/encoding/o200k_base")
    : { countTokens: undefined };
  let reviewed = false;
  options.onTokens?.(0);
  const tokenTimer = countTokens
    ? setInterval(() => {
        if (!reviewed)
          options.onTokens?.(countTokens(text, { allowedSpecial: new Set() }));
      }, 100)
    : undefined;
  const terminal: {
    stopReason: AiTurnResult["stopReason"];
    usage: TokenUsage;
  } = { stopReason: "unknown", usage: {} };
  const count = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : undefined;
  const consume = (frame: string) => {
    const dataText = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!dataText || dataText === "[DONE]") return;
    const data = JSON.parse(dataText);
    if (data.type === "lexiro.job") {
      options.onBatchStartedAt?.(data.startedAt);
      return;
    }
    if (data.type === "lexiro.question.progress") {
      reviewed = true;
      options.onPhase?.(data.phase === "review" ? "reviewing" : "generating");
      options.onCharacters?.(count(data.characters) ?? 0);
      options.onTokens?.(count(data.tokens) ?? 0);
      return;
    }
    if (data.type === "response.created") id = data.response.id;
    if (typeof data.response?.model === "string")
      terminal.usage.model = data.response.model;
    if (data.response?.usage) {
      const usage = data.response.usage;
      const reported: TokenUsage = {
        input: count(usage.input_tokens),
        output: count(usage.output_tokens),
        cached: count(usage.input_tokens_details?.cached_tokens),
        cacheWrite: count(usage.input_tokens_details?.cache_write_tokens),
        reasoning: count(usage.output_tokens_details?.reasoning_tokens),
      };
      for (const [field, value] of Object.entries(reported))
        if (value !== undefined)
          terminal.usage[field as keyof TokenUsage] = value as never;
    }
    const credits = count(data.response?.lexiro?.credits);
    if (credits !== undefined) terminal.usage.credits = credits;
    if (Array.isArray(data.response?.lexiro?.usageParts))
      terminal.usage.parts = data.response.lexiro.usageParts;
    if (data.type === "response.output_text.delta") {
      text += data.delta;
      options.onText?.(text);
      options.onCharacters?.(text.length);
      options.onPhase?.("generating");
    }
    if (data.type === "error" || data.type === "response.failed")
      throw new AiRequestError(
        t(
          data.code === "question_quality_rejected"
            ? "managed.questionQualityRejected"
            : "managed.failed",
        ),
        {
          code: data.error?.code ?? data.code ?? "generation_failed",
          retryable: false,
          usage: { ...terminal.usage },
          debugMessage: data.error?.diagnostic
            ? JSON.stringify(data.error.diagnostic)
            : data.diagnostic
              ? JSON.stringify(data.diagnostic)
              : data.response?.lexiro?.diagnostic
                ? JSON.stringify(data.response.lexiro.diagnostic)
                : undefined,
        },
      );
    if (data.type === "response.completed") {
      complete = true;
      terminal.stopReason = "complete";
    }
    if (data.type === "response.incomplete") {
      complete = true;
      terminal.stopReason =
        data.response.incomplete_details?.reason === "max_output_tokens"
          ? "truncated"
          : "blocked";
    }
  };
  try {
    for (;;) {
      options.signal?.throwIfAborted();
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        consume(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
      if (done) break;
    }
  } finally {
    clearInterval(tokenTimer);
    if (countTokens && !reviewed)
      options.onTokens?.(countTokens(text, { allowedSpecial: new Set() }));
    await reader.cancel();
    reader.releaseLock();
    notifyManagedAccountChanged();
  }
  if (!complete)
    throw new AiRequestError(t("ai.streamFailed"), {
      code: "stream_disconnected",
      retryable: true,
      streamBroken: true,
      usage: { ...terminal.usage },
    });
  const { stopReason } = terminal;
  if (stopReason === "truncated")
    throw new AiRequestError(t("ai.truncated"), {
      code: "truncated",
      retryable: false,
      usage: { ...terminal.usage },
    });
  if (stopReason === "blocked")
    throw new AiRequestError(t("ai.blocked"), {
      code: "blocked",
      retryable: false,
      usage: { ...terminal.usage },
    });
  if (!text.trim())
    throw new AiRequestError(t("ai.emptyReply"), {
      retryable: false,
      usage: { ...terminal.usage },
    });
  return { text, id, complete, stopReason, usage: terminal.usage };
}

export async function managedTurn(
  session: AiSession,
  input: GenerationInput,
  options: AiTurnOptions = {},
): Promise<AiTurnResult> {
  options.onPhase?.("connecting");
  const signal = options.signal;
  const init = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...((QUESTION_KINDS as readonly string[]).includes(input.kind)
        ? { "X-Question-Contract": QUESTION_GENERATION_CONTRACT }
        : {}),
    },
    signal,
    body: JSON.stringify({
      ...input,
      session: session.sessionId,
      tier: session.tier,
      model: session.model,
      repair: options.repair,
      // `append` belongs to the round, so every segment of it asks for fresh
      // wording — but never a repair turn. Telling the model to rewrite
      // everything differently while it is fixing a validation error is two
      // instructions pulling against each other.
      newVersion: session.append && !options.repair,
    }),
  };
  let result: AiTurnResult;
  try {
    result = await managedGeneration(
      session,
      input.kind === "organizeText" ? "/organize" : "/generate",
      init,
      { ...options, signal },
    );
  } catch (reason) {
    if (reason instanceof AiRequestError) addUsage(session.usage, reason.usage);
    throw reason;
  }
  addUsage(session.usage, result.usage);
  return result;
}

export function managedGeneration(
  session: AiSession,
  path: string,
  init: RequestInit,
  options: AiTurnOptions,
) {
  return resumeGeneration(
    session,
    path,
    init,
    options,
    managedFetch,
    readManagedStream,
  );
}

/** A run is many turns; the readout is about the run, so the turns add up. */
export function addUsage(total: TokenUsage, turn: TokenUsage | undefined) {
  if (!turn) return total;
  total.parts = [...(total.parts ?? []), ...(turn.parts ?? [turn])];
  const cost = responseCost({ parts: total.parts });
  const uncachedCost = responseCost({
    parts: total.parts.map((part) => ({ ...part, cached: 0, cacheWrite: 0 })),
  });
  if (cost !== null && uncachedCost !== null) {
    total.costUsd = cost;
    total.uncachedCostUsd = uncachedCost;
  } else {
    delete total.costUsd;
    delete total.uncachedCostUsd;
  }
  if (turn.model) total.model = turn.model;
  for (const field of [
    "input",
    "cached",
    "cacheWrite",
    "output",
    "reasoning",
    "credits",
  ] as const)
    if (turn[field] !== undefined)
      total[field] = (total[field] ?? 0) + turn[field]!;
  return total;
}
