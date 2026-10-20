// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import {
  PRACTICE_DRAFT_REMOTE_EVENT,
  PRACTICE_SESSION_STORAGE_KEY,
} from "@/core/constants";
import { getStorageNamespace } from "./persist";
import { isRecord } from "./schema";
import { markBlobDirty } from "./sync-journal";

/**
 * The open practice session as the cloud carries it. `updatedAt` decides which
 * device's session wins; a null snapshot means it was finished or abandoned,
 * which must also reach other devices or they would keep offering to resume it.
 */
export interface PracticeDraftEnvelope {
  updatedAt: string;
  snapshot: Record<string, unknown> | null;
}

export function practiceStorageKey(): string {
  return `${getStorageNamespace()}:${PRACTICE_SESSION_STORAGE_KEY}`;
}

function practiceUpdatedAtKey(): string {
  return `${practiceStorageKey()}:updated-at`;
}

/** Legacy snapshots have no owner; preserve them in the guest workspace only. */
export function readPracticeDraft(): string | null {
  const legacy = localStorage.getItem(PRACTICE_SESSION_STORAGE_KEY);
  if (legacy !== null) {
    const guestKey = `guest:${PRACTICE_SESSION_STORAGE_KEY}`;
    if (localStorage.getItem(guestKey) === null)
      localStorage.setItem(guestKey, legacy);
    localStorage.removeItem(PRACTICE_SESSION_STORAGE_KEY);
  }
  return localStorage.getItem(practiceStorageKey());
}

function touched() {
  localStorage.setItem(practiceUpdatedAtKey(), new Date().toISOString());
  // The local draft is already safe; a journal failure only delays the upload
  // until the next change marks it again.
  void markBlobDirty("practice").catch(() => undefined);
}

/** Saves the session and queues it for other devices. Throws if storage is unavailable. */
export function writePracticeDraft(snapshot: unknown): void {
  const value = JSON.stringify(snapshot);
  const key = practiceStorageKey();
  if (localStorage.getItem(key) === value) return;
  localStorage.setItem(key, value);
  touched();
}

/** Ends the session here and on every other device. Throws if storage is unavailable. */
export function clearPracticeDraft(): void {
  const key = practiceStorageKey();
  if (localStorage.getItem(key) === null) return;
  localStorage.removeItem(key);
  touched();
}

/** What this device would upload; null when it has never held a session. */
export function localPracticeDraft(): PracticeDraftEnvelope | null {
  const raw = localStorage.getItem(practiceStorageKey());
  const updatedAt = localStorage.getItem(practiceUpdatedAtKey()) ?? "";
  if (raw === null) return updatedAt ? { updatedAt, snapshot: null } : null;
  let snapshot: unknown = null;
  try {
    snapshot = JSON.parse(raw);
  } catch {
    // An unreadable draft stays local for the restore screen to report.
    return null;
  }
  return isRecord(snapshot) ? { updatedAt, snapshot } : null;
}

/** Adopts another device's newer session without queueing it back up. */
export function applyRemotePracticeDraft(remote: PracticeDraftEnvelope): void {
  const key = practiceStorageKey();
  if (remote.snapshot)
    localStorage.setItem(key, JSON.stringify(remote.snapshot));
  else localStorage.removeItem(key);
  localStorage.setItem(practiceUpdatedAtKey(), remote.updatedAt);
  window.dispatchEvent(new Event(PRACTICE_DRAFT_REMOTE_EVENT));
}

export function normalizeCloudPracticeDraft(
  value: unknown,
  uid: string,
): PracticeDraftEnvelope | null {
  if (
    !isRecord(value) ||
    value.ownerId !== uid ||
    typeof value.updatedAt !== "string" ||
    !(value.snapshot === null || isRecord(value.snapshot))
  )
    return null;
  return { updatedAt: value.updatedAt, snapshot: value.snapshot };
}
