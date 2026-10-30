// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { SharedSet } from "@/core/types";
import { APP_NAME, EXPORT_VERSION } from "@/core/constants";
import { agentJson } from "@/core/lib/agent-client";
import { t } from "@/core/lib/i18n";
import { normalizeSharePayload } from "@/core/lib/share";
import { useCloudStore } from "@/core/stores/cloud-store";

export interface SetShareLink {
  id: string;
  setId: string;
}

export interface SharedSetView {
  id: string;
  /** The reader owns the set; there is nothing to save. */
  own: boolean;
  set: SharedSet;
}

export function shareLinkUrl(id: string): string {
  return `${window.location.origin}/app/shared/${id}`;
}

/** The link already handed out for a set, if any. */
export async function findSetShareLink(
  setId: string,
  signal?: AbortSignal,
): Promise<SetShareLink | null> {
  const { shares } = await agentJson<{ shares: SetShareLink[] }>("/shares", {
    signal,
  });
  return shares.find((share) => share.setId === setId) ?? null;
}

/**
 * Readers see what the cloud holds, so the set has to reach it first; sharing
 * an edit that only lives on this device would show them an older copy.
 */
export async function createSetShareLink(setId: string): Promise<SetShareLink> {
  const before = useCloudStore.getState();
  const uid = before.user?.uid;
  // Already in the cloud: a sync here would only repeat a pull and a push.
  if (before.status !== "synced" || before.pending > 0)
    await useCloudStore.getState().sync();
  const cloud = useCloudStore.getState();
  if (cloud.user?.uid !== uid) throw new Error(t("agent.accountChanged"));
  if (cloud.status !== "synced" || cloud.pending > 0)
    throw new Error(t("share.syncFirst"));
  return agentJson<SetShareLink>("/shares", {
    method: "POST",
    body: JSON.stringify({ setId }),
  });
}

export async function revokeSetShareLink(id: string): Promise<void> {
  await agentJson(`/shares/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function readSharedSet(
  id: string,
  signal?: AbortSignal,
): Promise<SharedSetView> {
  const value = await agentJson<{
    id: string;
    own: boolean;
    snapshot: {
      set: Record<string, unknown>;
      memberships: unknown;
      words: unknown;
      questions: unknown;
    };
  }>(`/shares/${encodeURIComponent(id)}`, { signal });
  // The same checks an imported share file goes through.
  const [set] = normalizeSharePayload({
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    appName: APP_NAME,
    kind: "set-share",
    sets: [
      {
        ...value.snapshot.set,
        memberships: value.snapshot.memberships,
        words: value.snapshot.words,
        questions: value.snapshot.questions,
      },
    ],
  }).sets;
  return { id: value.id, own: value.own, set };
}
