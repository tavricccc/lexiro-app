// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { AiSession, AiTurnOptions, AiTurnResult } from "@/core/types/ai";
import { AiRequestError } from "@/core/lib/ai/errors";

/** Reconnect to a stable operation ID; transport retries never create a fresh generation. */
export async function resumeGeneration(
  session: AiSession,
  path: string,
  init: RequestInit,
  options: AiTurnOptions,
  fetcher: (path: string, init?: RequestInit) => Promise<Response>,
  reader: (response: Response, options: AiTurnOptions) => Promise<AiTurnResult>,
) {
  const signature = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify([path, init.headers, init.body]),
        ),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (session.pendingTurn?.signature !== signature)
    session.pendingTurn = {
      id: crypto.randomUUID(),
      signature,
      started: false,
      createdAt: Date.now(),
    };
  options.onCheckpoint?.();
  const pending = session.pendingTurn;
  const headers = new Headers(init.headers);
  headers.set("X-Generation-Id", pending.id);
  let resume = pending.started;
  for (let attempt = 0; attempt < 4; attempt++) {
    options.signal?.throwIfAborted();
    try {
      let response: Response;
      try {
        response = resume
          ? await fetcher(`/generation/${session.sessionId}/${pending.id}`, {
              signal: options.signal,
            })
          : await fetcher(path, { ...init, headers, signal: options.signal });
      } catch (reason) {
        if (
          resume &&
          !pending.started &&
          reason instanceof AiRequestError &&
          reason.status === 404
        ) {
          resume = false;
          attempt--;
          continue;
        }
        throw reason;
      }
      pending.started = true;
      options.onCheckpoint?.();
      const result = await reader(response, options);
      session.pendingTurn = undefined;
      return result;
    } catch (reason) {
      if (options.signal?.aborted) throw options.signal.reason;
      if (
        reason instanceof AiRequestError &&
        !reason.retryable &&
        reason.code !== "stream_disconnected"
      ) {
        session.pendingTurn = undefined;
        throw reason;
      }
      if (
        !(reason instanceof AiRequestError) &&
        !(reason instanceof TypeError) &&
        !(reason instanceof DOMException)
      )
        throw reason;
      if (attempt === 3)
        throw new AiRequestError("連線中斷，重試會接回同一次生成。", {
          code: "resume_required",
          retryable: false,
          debugMessage: JSON.stringify({
            phase: "receive",
            code: "client_connection_interrupted",
            jobId: pending.id,
            sessionId: session.sessionId,
            message: reason instanceof Error ? reason.message : String(reason),
          }),
        });
      resume = true;
      options.onPhase?.("reconnecting");
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(options.signal?.reason);
        };
        const timer = setTimeout(
          () => {
            options.signal?.removeEventListener("abort", abort);
            resolve();
          },
          1000 * 2 ** attempt,
        );
        options.signal?.addEventListener("abort", abort, { once: true });
      });
    }
  }
  throw new Error("Unreachable generation state");
}
