// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { getFirebaseAuth } from "@/core/lib/firebase";
import { appCheckHeaders } from "@/core/lib/app-check";
import { useCloudStore } from "@/core/stores/cloud-store";
import { t } from "@/core/lib/i18n";

export const agentWorkerUrl = () =>
  process.env.NEXT_PUBLIC_AGENT_WORKER_URL?.trim().replace(/\/$/, "") ?? "";
/** A refused request; `code` is the Worker's error code when it sent one. */
export class AgentRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}
export interface AgentConnection {
  id: string;
  clientId: string;
  clientName: string;
  createdAt: number;
}

export async function agentJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const base = agentWorkerUrl();
  if (!base) throw new Error(t("agent.unavailable"));
  const auth = getFirebaseAuth();
  await auth?.authStateReady();
  const user = auth?.currentUser;
  if (!user || useCloudStore.getState().user?.uid !== user.uid)
    throw new Error(t("agent.signInRequired"));
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await user.getIdToken(attempt > 0);
    if (auth.currentUser?.uid !== user.uid)
      throw new Error(t("agent.accountChanged"));
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    for (const [name, value] of Object.entries(await appCheckHeaders()))
      headers.set(name, value);
    headers.set("Content-Type", "application/json");
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(30000),
    });
    if (response.status === 401 && attempt === 0) continue;
    if (auth.currentUser?.uid !== user.uid)
      throw new Error(t("agent.accountChanged"));
    const value = await response.json();
    if (!response.ok) {
      const code: string | undefined = value.error?.code;
      throw new AgentRequestError(
        code === "set_not_found" || code === "set_sync_incomplete"
          ? t("agent.syncFirst")
          : code === "authorization_expired"
            ? t("agent.authorizationExpired")
            : code === "share_unavailable"
              ? t("share.unavailable")
              : code === "room_not_found"
                ? t("rooms.notFound")
                : code === "room_full"
                  ? t("rooms.full")
                  : code === "room_ended"
                    ? t("rooms.ended")
                    : (value.error?.message ?? t("agent.requestFailed")),
        code,
      );
    }
    return value as T;
  }
  throw new Error(t("agent.requestFailed"));
}
