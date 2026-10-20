// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { CloudClient } from "./cloud-client";
import { normalizeAiPreferences, type AiPreferences } from "./ai-preferences";
import { isRecord } from "./schema";
import { CloudSyncError } from "./cloud-sync-errors";
import { writeCloudBlob } from "./cloud-account";
export function normalizeCloudPreferences(
  value: unknown,
  uid: string,
): AiPreferences {
  if (!isRecord(value) || value.ownerId !== uid)
    throw new CloudSyncError("cloud/data-invalid", "AI 模型設定不屬於此帳號");
  return normalizeAiPreferences(value);
}
export async function readCloudPreferences(
  client: CloudClient,
  uid: string,
): Promise<AiPreferences | null> {
  if (client.uid !== uid) throw new Error("auth/account-changed");
  const { blobs, revision } = await client.request<{
    blobs: { preferences?: unknown };
    revision: number;
  }>("/sync/blobs");
  client.blobRevision = revision;
  return blobs.preferences
    ? normalizeCloudPreferences(blobs.preferences, uid)
    : null;
}
export async function writeCloudPreferences(
  client: CloudClient,
  uid: string,
  preferences: AiPreferences,
): Promise<void> {
  await writeCloudBlob(client, uid, "preferences", preferences);
}
