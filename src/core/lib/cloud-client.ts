// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { getFirebaseAuth } from "./firebase";
import { appCheckHeaders } from "./app-check";
import { CloudSyncError } from "./cloud-sync-errors";
export interface CloudClient {
  uid: string;
  blobRevision: number;
  request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T>;
}
export function accountNamespace(uid: string) {
  return `d1-v1:${uid}`;
}
let current: CloudClient | null = null;
export function getCloudClient(): CloudClient | null {
  const auth = getFirebaseAuth(),
    user = auth?.currentUser;
  if (!auth || !user) return null;
  if (current?.uid === user.uid) return current;
  const origin = process.env.NEXT_PUBLIC_AGENT_WORKER_URL?.trim().replace(
    /\/$/,
    "",
  );
  if (!origin)
    throw new CloudSyncError("cloud/not-configured", "D1 雲端服務尚未設定");
  const uid = user.uid;
  current = {
    uid,
    blobRevision: 0,
    async request<T>(
      path: string,
      body?: unknown,
      signal?: AbortSignal,
    ): Promise<T> {
      const send = async (refresh: boolean) => {
        if (auth.currentUser?.uid !== uid)
          throw new Error("auth/account-changed");
        const token = await user.getIdToken(refresh);
        if (auth.currentUser?.uid !== uid)
          throw new Error("auth/account-changed");
        const appCheck = await appCheckHeaders();
        return fetch(origin + path, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            ...appCheck,
            ...(body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
            : AbortSignal.timeout(10000),
          cache: "no-store",
        });
      };
      let response = await send(false);
      if (response.status === 401) response = await send(true);
      if (auth.currentUser?.uid !== uid)
        throw new Error("auth/account-changed");
      const value = await response.json();
      if (!response.ok) {
        const error = new Error(
          value.error?.message ?? `雲端同步失敗（${response.status}）`,
        ) as Error & { code: string };
        error.code =
          response.status === 409
            ? "aborted"
            : response.status === 401
              ? "auth/unauthenticated"
              : response.status === 429
                ? "resource-exhausted"
                : response.status >= 500
                  ? "unavailable"
                  : "permission-denied";
        throw error;
      }
      return value as T;
    },
  };
  return current;
}
