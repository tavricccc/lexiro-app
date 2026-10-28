// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { getFirebaseAuth } from "./firebase";
import { appCheckHeaders } from "./app-check";
import { CloudSyncError } from "./cloud-sync-errors";
export interface CloudClient {
  uid: string;
  blobRevision: number;
  request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T>;
}
/**
 * The account limits the Worker enforces. Retrying them on a timer only
 * repeats the refusal, so they carry "cloud/limit" and wait for the user or
 * the next day; the messages say what happened and that local data is safe.
 */
const LIMIT_MESSAGES: Record<string, string> = {
  daily_write_limit:
    "今天的同步量已達上限，明天會自動繼續；資料都還保存在這台裝置上。",
  storage_limit:
    "雲端空間已滿（每個帳號 50 MB），刪除一些內容後才能同步新的資料。",
  account_disabled: "這個帳號已被停用，無法同步。",
};

/** Turns a failed Worker response into an error the sync store can classify. */
export function cloudResponseError(
  status: number,
  body: { error?: { code?: string; message?: string } } | null,
): Error & { code: string } {
  const serverCode = body?.error?.code ?? "";
  const limit = LIMIT_MESSAGES[serverCode];
  const error = new Error(
    limit ??
      (serverCode === "rate_limited"
        ? "同步太頻繁，稍後會自動再試。"
        : (body?.error?.message ?? `雲端同步失敗（${status}）`)),
  ) as Error & { code: string };
  error.code = limit
    ? "cloud/limit"
    : status === 409
      ? "aborted"
      : status === 401
        ? "auth/unauthenticated"
        : status === 429
          ? "resource-exhausted"
          : status >= 500
            ? "unavailable"
            : "permission-denied";
  return error;
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
      if (!response.ok) throw cloudResponseError(response.status, value);
      return value as T;
    },
  };
  return current;
}
