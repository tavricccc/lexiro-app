// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { CloudClient } from "./cloud-client";
import type { CloudRecord } from "./cloud-records";
import type { SyncClearRef, SyncJournal } from "./sync-journal";
import type { LibraryState } from "@/core/types";
import { CLOUD_RECORD_PAGE_SIZE, CLOUD_WRITE_BATCH_SIZE } from "@/core/constants";
import { allLibraryRefs, recordForRef, tombstoneRecord } from "./cloud-records";
import { randomUUID } from "./id";
import { refKey } from "./sync-journal";
export const SYNC_ORIGIN_ID = randomUUID();
export const CLOUD_REQUEST_TIMEOUT_MS = 10000;
export class SyncTimeoutError extends Error {
  readonly code = "deadline-exceeded";
  constructor(label: string, timeoutMs: number) {
    super(`${label} timeout after ${timeoutMs}ms`);
    this.name = "SyncTimeoutError";
  }
}
export async function withDeadline<T>(
  operation: Promise<T>,
  label: string,
  signal?: AbortSignal,
  timeoutMs = CLOUD_REQUEST_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined,
    onAbort: (() => void) | undefined;
  const guard = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new SyncTimeoutError(label, timeoutMs)),
      timeoutMs,
    );
    if (signal) {
      onAbort = () => reject(new SyncTimeoutError(`${label} aborted`, 0));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
  try {
    return await Promise.race([operation, guard]);
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}
export interface CloudRecordPage {
  size: number;
}
export async function pullRecords(
  client: CloudClient,
  uid: string,
  cursor: string,
  signal?: AbortSignal,
  onPage?: (page: CloudRecordPage) => void,
): Promise<{ records: CloudRecord[]; cursor: string }> {
  if (client.uid !== uid) throw new Error("auth/account-changed");
  const records: CloudRecord[] = [];
  let next = cursor;
  for (;;) {
    const page = await client.request<{
      records: CloudRecord[];
      cursor: string;
      hasMore: boolean;
    }>(`/sync/records?cursor=${encodeURIComponent(next)}`, undefined, signal);
    records.push(...page.records);
    onPage?.({ size: page.records.length });
    next = page.cursor;
    if (!page.hasMore) break;
    if (!page.records.length || page.records.length > CLOUD_RECORD_PAGE_SIZE)
      throw new Error("cloud/data-invalid");
  }
  return { records, cursor: next };
}
export function pendingRecords(
  state: LibraryState,
  journal: SyncJournal,
): { clear: SyncClearRef[]; records: { record: CloudRecord }[] } {
  const records: { record: CloudRecord }[] = [],
    clear: SyncClearRef[] = [],
    seen = new Set<string>();
  for (const [key, entry] of Object.entries(journal.dirty)) {
    seen.add(key);
    clear.push({ key, version: entry.version });
    const record = recordForRef(state, entry);
    if (record) records.push({ record });
  }
  for (const [key, tombstone] of Object.entries(journal.tombstones)) {
    seen.add(key);
    clear.push({ key, version: tombstone.version });
    records.push({ record: tombstoneRecord(tombstone) });
  }
  if (!journal.seeded)
    for (const ref of allLibraryRefs(state)) {
      if (seen.has(refKey(ref))) continue;
      const record = recordForRef(state, ref);
      if (record) records.push({ record });
    }
  return { clear, records };
}
export async function pushRecords(
  client: CloudClient,
  uid: string,
  records: readonly { record: CloudRecord }[],
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  if (client.uid !== uid) throw new Error("auth/account-changed");
  if (!records.length) return;
  onProgress?.(0, records.length);
  for (
    let offset = 0;
    offset < records.length;
    offset += CLOUD_WRITE_BATCH_SIZE
  ) {
    const slice = records.slice(offset, offset + CLOUD_WRITE_BATCH_SIZE);
    await client.request(
      "/sync/records",
      {
        records: slice.map((value) => value.record),
        origin: SYNC_ORIGIN_ID,
        operationId: randomUUID(),
      },
      signal,
    );
    onProgress?.(
      Math.min(offset + slice.length, records.length),
      records.length,
    );
  }
}
interface CloudStatus {
  revision: number;
  blobRevision: number;
  changedBy: string;
  blobChangedBy: string;
}
/** How often a focused, visible device asks whether the cloud changed. */
export const CLOUD_STATUS_POLL_MS = 60_000;
/**
 * One indexed status row per poll from the focused, visible device; records
 * are pulled only when changed. Background tabs stay quiet, so several open
 * tabs cost one poller, and coming back to a tab wakes it straight away.
 */
export function watchCloudChanges(
  client: CloudClient,
  uid: string,
  onChange: (changedBy?: string, reconcileAccount?: boolean) => void,
): () => void {
  let seen: CloudStatus | null = null,
    stopped = false,
    running = false;
  const poll = async () => {
    if (
      stopped ||
      running ||
      client.uid !== uid ||
      (typeof document !== "undefined" &&
        (document.visibilityState === "hidden" ||
          document.hasFocus?.() === false)) ||
      (typeof navigator !== "undefined" && !navigator.onLine)
    )
      return;
    running = true;
    try {
      const status = await client.request<CloudStatus>("/sync/status");
      if (stopped) return;
      const previous = seen;
      seen = status;
      if (!previous) return;
      const libraryChanged =
        status.revision !== previous.revision &&
        status.changedBy !== SYNC_ORIGIN_ID;
      const accountChanged =
        status.blobRevision !== previous.blobRevision &&
        status.blobChangedBy !== SYNC_ORIGIN_ID;
      if (libraryChanged || accountChanged)
        onChange(libraryChanged ? status.changedBy : undefined, accountChanged);
    } catch {
      /* Manual sync owns error/retry state; this watcher does not duplicate requests. */
    } finally {
      running = false;
    }
  };
  const wake = () => {
    void poll();
  };
  // Going online runs a full sync from the cloud store, so it needs no poll.
  const timer = setInterval(wake, CLOUD_STATUS_POLL_MS);
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", wake);
  if (typeof window !== "undefined") window.addEventListener("focus", wake);
  wake();
  return () => {
    stopped = true;
    clearInterval(timer);
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", wake);
    if (typeof window !== "undefined")
      window.removeEventListener("focus", wake);
  };
}
