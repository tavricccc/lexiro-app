// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftPersistence } from "@/core/lib/draft-persistence";

type DraftStatus = "checking" | "offer" | "invalid" | "active";

/** Typing writes the draft once it pauses rather than on every key. */
export const DRAFT_WRITE_DELAY_MS = 500;

/** A new, versioned local draft. Older flows did not persist drafts. */
export function useResumableDraft<T extends object>(key: string, initial: T) {
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const draftRef = useRef(initial);
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState<T | null>(null);
  const [status, setStatus] = useState<DraftStatus>("checking");
  const [persistence, setPersistence] = useState<DraftPersistence>("idle");
  const unwritten = useRef<{ key: string; value: T } | null>(null);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelWrite = useCallback(() => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = null;
    unwritten.current = null;
  }, []);

  const flush = useCallback(() => {
    const next = unwritten.current;
    cancelWrite();
    if (!next) return;
    try {
      localStorage.setItem(
        next.key,
        JSON.stringify({ schemaVersion: 1, value: next.value }),
      );
    } catch {
      setPersistence("error");
    }
  }, [cancelWrite]);

  // Leaving the page or the flow writes whatever is still waiting.
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
      flush();
    };
  }, [key, flush]);

  useEffect(() => {
    setStatus("checking");
    draftRef.current = initialRef.current;
    setDraft(initialRef.current);
    setPending(null);
    setPersistence("idle");
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      setPersistence("error");
      setStatus("active");
      return;
    }
    if (!raw) {
      setStatus("active");
      return;
    }
    try {
      const stored: unknown = JSON.parse(raw);
      if (
        !stored ||
        typeof stored !== "object" ||
        !("schemaVersion" in stored) ||
        stored.schemaVersion !== 1 ||
        !("value" in stored) ||
        !stored.value ||
        typeof stored.value !== "object"
      ) {
        setStatus("invalid");
        return;
      }
      setPending(stored.value as T);
      setStatus("offer");
    } catch {
      setStatus("invalid");
    }
  }, [key]);

  const update = useCallback(
    (patch: Partial<T>) => {
      const next = { ...draftRef.current, ...patch };
      draftRef.current = next;
      setDraft(next);
      unwritten.current = { key, value: next };
      setPersistence("saved");
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(flush, DRAFT_WRITE_DELAY_MS);
    },
    [key, flush],
  );

  const resume = useCallback(() => {
    const saved = pending!;
    draftRef.current = saved;
    setDraft(saved);
    setPending(null);
    setPersistence("saved");
    setStatus("active");
  }, [pending]);

  const restart = useCallback(() => {
    cancelWrite();
    try {
      localStorage.removeItem(key);
      setPersistence("idle");
    } catch {
      setPersistence("error");
    }
    draftRef.current = initialRef.current;
    setDraft(initialRef.current);
    setPending(null);
    setStatus("active");
  }, [key, cancelWrite]);

  const clear = useCallback(() => {
    cancelWrite();
    try {
      localStorage.removeItem(key);
      setPersistence("idle");
    } catch {
      setPersistence("error");
    }
  }, [key, cancelWrite]);

  return {
    draft,
    pending,
    status,
    persistence,
    update,
    resume,
    restart,
    clear,
  };
}
