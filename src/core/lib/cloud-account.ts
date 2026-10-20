// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { CloudClient } from "./cloud-client";
import type { SyncBlobKind } from "./sync-journal";
import { SYNC_ORIGIN_ID } from "./cloud-sync";
import { randomUUID } from "./id";
import { normalizeCloudPreferences } from "./cloud-preferences";
import type { AiPreferences } from "./ai-preferences";
import {
  normalizeCloudPracticeDraft,
  type PracticeDraftEnvelope,
} from "./practice-storage";

export interface CloudBlobs {
  preferences: AiPreferences | null;
  practice: PracticeDraftEnvelope | null;
}

export async function readCloudBlobs(
  db: CloudClient,
  uid: string,
  signal?: AbortSignal,
): Promise<CloudBlobs> {
  if (db.uid !== uid) throw new Error("auth/account-changed");
  const { blobs, revision } = await db.request<{
    blobs: { preferences?: unknown; practice?: unknown };
    revision: number;
  }>("/sync/blobs", undefined, signal);
  db.blobRevision = revision;
  return {
    preferences: blobs.preferences
      ? normalizeCloudPreferences(blobs.preferences, uid)
      : null,
    practice: normalizeCloudPracticeDraft(blobs.practice, uid),
  };
}

export async function writeCloudBlob(
  db: CloudClient,
  uid: string,
  kind: SyncBlobKind,
  data: unknown,
  signal?: AbortSignal,
) {
  if (db.uid !== uid) throw new Error("auth/account-changed");
  const result = await db.request<{ revision: number }>(
    "/sync/blobs",
    {
      expectedRevision: db.blobRevision,
      blobs: [{ kind, data }],
      origin: SYNC_ORIGIN_ID,
      operationId: randomUUID(),
    },
    signal,
  );
  db.blobRevision = result.revision;
}
