// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { del, delMany, get, keys, set } from "@/platform/kv";
import { NAMESPACE_SCOPED_KEYS } from "@/core/constants";

export interface StorageLoadResult {
  value: string | null;
}

const pendingWrites = new Map<string, Promise<void>>();
let storageNamespace = "d1-v1:guest";

const scopedKeys = new Set(NAMESPACE_SCOPED_KEYS);

export function setStorageNamespace(namespace: string): void {
  const normalized = namespace.trim();
  storageNamespace = normalized || "d1-v1:guest";
}

/** Removes every value stored under one account namespace, its library included. */
export async function removeNamespaceData(namespace: string): Promise<void> {
  const owned = (await keys()).filter(
    (key): key is string =>
      typeof key === "string" && key.startsWith(`${namespace}:`),
  );
  if (owned.length) await delMany(owned);
}

export function getStorageNamespace(): string {
  return storageNamespace;
}

function resolveKey(key: string): string {
  return scopedKeys.has(key) ? `${storageNamespace}:${key}` : key;
}

function enqueueWrite(key: string, write: () => Promise<void>): Promise<void> {
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(write);
  pendingWrites.set(key, next);
  void next.then(
    () => {
      if (pendingWrites.get(key) === next) pendingWrites.delete(key);
    },
    () => {
      if (pendingWrites.get(key) === next) pendingWrites.delete(key);
    },
  );
  return next;
}

export function saveToStorage(key: string, data: unknown): Promise<void> {
  const serialized = typeof data === "string" ? data : JSON.stringify(data);
  const resolvedKey = resolveKey(key);
  return enqueueWrite(resolvedKey, async () => {
    await set(resolvedKey, serialized);
  });
}

export async function loadFromStorage(key: string): Promise<StorageLoadResult> {
  const resolvedKey = resolveKey(key);
  await pendingWrites.get(resolvedKey);
  return { value: (await get<string>(resolvedKey)) ?? null };
}

/** One-way managed-AI migration; captures the namespace before asynchronous deletion. */
export async function removeRetiredAiSettings(): Promise<void> {
  const namespace = storageNamespace;
  await Promise.all(
    ["lexiro_ai_settings", "lexiro_ai_api_key"].flatMap((key) =>
      [`${namespace}:${key}`, ...(namespace === "guest" ? [key] : [])].map(
        (resolved) =>
          enqueueWrite(resolved, async () => {
            await del(resolved);
            if (typeof localStorage !== "undefined")
              localStorage.removeItem(resolved);
          }),
      ),
    ),
  );
}

/**
 * Learning progress and statistics were removed from the app. Their stored
 * copy for this namespace is deleted on load; captures the namespace first.
 */
export async function removeRetiredLearningData(): Promise<void> {
  const resolved = `${storageNamespace}:lexiro_learning_data`;
  await enqueueWrite(resolved, () => del(resolved));
}
