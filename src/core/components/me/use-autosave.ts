// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { useCallback, useEffect, useRef, useState } from "react";
import { serializeAccountDataAction } from "@/core/lib/account-data-queue";
import { getStorageNamespace } from "@/core/lib/persist";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";
type Draft<T> = { value: T; serialized: string };
type Recovery = "checking" | "active" | "offer" | "invalid";

/** Pending fields belong to the account that edited them, across navigation. */
export function useAutosave<T extends object>(
  save: (patch: T) => Promise<void>,
  {
    key,
    parse,
    delay = 700,
    ready = true,
  }: {
    key: string;
    parse: (value: unknown) => T | null;
    delay?: number;
    ready?: boolean;
  },
) {
  const [owner] = useState(getStorageNamespace);
  const storageKey = `${owner}:lexiro_pending_${key}_v1`;
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [recovery, setRecovery] = useState<Recovery>("checking");
  const [value, setValue] = useState<T | null>(null);
  const [draftError, setDraftError] = useState(false);
  const pending = useRef<Draft<T> | null>(null);
  const mounted = useRef(false);
  const scheduled = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSave = useRef(save);
  latestSave.current = save;

  const record = useCallback(
    (patch: T): Draft<T> => {
      const draft = {
        value: patch,
        serialized: JSON.stringify({
          version: 1,
          id: crypto.randomUUID(),
          value: patch,
        }),
      };
      pending.current = draft;
      setValue(patch);
      try {
        localStorage.setItem(storageKey, draft.serialized);
        setDraftError(false);
      } catch {
        setDraftError(true);
      }
      return draft;
    },
    [storageKey],
  );

  const flush = useCallback(
    function flushPending() {
      if (!scheduled.current || inFlight.current || !pending.current) return;
      if (timer.current) clearTimeout(timer.current);
      scheduled.current = false;
      inFlight.current = true;
      const job = pending.current;
      const saveJob = latestSave.current;
      void serializeAccountDataAction(async () => {
        if (getStorageNamespace() !== owner)
          throw new Error("settings-account-changed");
        await saveJob(job.value);
      })()
        .then(() => {
          const current = pending.current!;
          const remaining = { ...current.value };
          // A completed write acknowledges only the fields it actually saved.
          for (const field of Object.keys(job.value) as (keyof T)[])
            if (remaining[field] === job.value[field]) delete remaining[field];
          const next = Object.keys(remaining).length
            ? {
                value: remaining,
                serialized: JSON.stringify({
                  version: 1,
                  id: crypto.randomUUID(),
                  value: remaining,
                }),
              }
            : null;
          try {
            if (localStorage.getItem(storageKey) === current.serialized) {
              if (next) localStorage.setItem(storageKey, next.serialized);
              else localStorage.removeItem(storageKey);
            }
          } catch (error) {
            if (mounted.current) setDraftError(true);
            throw error;
          }
          pending.current = next;
          if (mounted.current) {
            setValue(next?.value ?? null);
            setDraftError(false);
            setStatus(next ? "saving" : "saved");
          }
        })
        .catch(() => {
          if (mounted.current)
            setStatus(scheduled.current ? "saving" : "error");
        })
        .finally(() => {
          inFlight.current = false;
          if (scheduled.current) flushPending();
        });
    },
    [owner, storageKey],
  );

  useEffect(() => {
    mounted.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        let stored;
        try {
          stored = JSON.parse(raw);
        } catch {
          stored = null;
        }
        const patch =
          stored?.version === 1 && typeof stored.id === "string"
            ? parse(stored.value)
            : null;
        if (patch) {
          pending.current = { value: patch, serialized: raw };
          setValue(patch);
          setRecovery("offer");
        } else setRecovery("invalid");
      } else setRecovery("active");
    } catch {
      setDraftError(true);
      setRecovery("invalid");
    }
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flush);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flush);
      if (timer.current) clearTimeout(timer.current);
      flush();
    };
  }, [flush, parse, storageKey]);

  useEffect(() => {
    if (status !== "saved") return;
    const timeout = setTimeout(() => setStatus("idle"), 2400);
    return () => clearTimeout(timeout);
  }, [status]);

  const retry = () => {
    if (!ready || !pending.current) return;
    setRecovery("active");
    setStatus("saving");
    scheduled.current = true;
    flush();
  };
  const update = (patch: T) => {
    if (!ready || recovery !== "active") return;
    record({ ...pending.current?.value, ...patch });
    setStatus("saving");
    scheduled.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };
  const discard = () => {
    try {
      localStorage.removeItem(storageKey);
      pending.current = null;
      setValue(null);
      setRecovery("active");
      setDraftError(false);
    } catch {
      setDraftError(true);
    }
  };
  return { status, recovery, value, draftError, update, retry, discard };
}
