// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { agentJson, AgentRequestError } from "@/core/lib/agent-client";
import { t, type TranslationKey } from "@/core/lib/i18n";

/** The Worker's /admin API, shared by the web and the app. */

export type QuotaName =
  "workerRequests" | "durableObjectRequests" | "d1RowsRead" | "d1RowsWritten";
export interface UsageReport {
  day: string;
  checkedAt: number;
  error: string;
  quotas: { name: QuotaName; used: number; limit: number }[];
}
export type AdminAlert =
  | { code: "quota_high"; quota: QuotaName; share: number }
  | { code: "usage_check_failed"; error: string }
  | { code: "usage_check_stale"; checkedAt: number | null }
  | { code: "agent_paused"; manual: boolean; since: number };
export interface ServiceStatus {
  usage: UsageReport | null;
  agentPaused: { manual: boolean; since: number } | null;
  alerts: AdminAlert[];
}

export const ADMIN_ACCOUNT_VIEWS = [
  "recent",
  "writes",
  "storage",
  "reads",
  "disabled",
  "unlimited",
] as const;
export type AdminAccountView = (typeof ADMIN_ACCOUNT_VIEWS)[number];
export interface AdminAccount {
  uid: string;
  email: string | null;
  seenDay: string | null;
  writesToday: number;
  readsToday: number;
  storedBytes: number;
  disabled: { reason: string; at: number } | null;
  unlimited: boolean;
}
export interface AdminAction {
  id: number;
  at: number;
  adminEmail: string;
  action: string;
  targetUid: string;
  detail: string;
}
export interface AdminAccountDetail extends AdminAccount {
  revision: number;
  sets: number;
  words: number;
  questions: number;
  shares: number;
  activeLinks: number;
  connections: { id: string; clientName: string; createdAt: number }[];
  actions: AdminAction[];
}
export type AdminAccountAction =
  | { action: "disable"; reason: string }
  | { action: "enable" }
  | { action: "exempt" }
  | { action: "unexempt" }
  | { action: "revoke_access" };

const ERRORS: Record<string, TranslationKey> = {
  not_admin: "admin.notAdmin",
  cannot_target_self: "admin.cannotTargetSelf",
  cannot_target_admin: "admin.cannotTargetAdmin",
};

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await agentJson<T>(path, init);
  } catch (reason) {
    const key =
      reason instanceof AgentRequestError && reason.code
        ? ERRORS[reason.code]
        : undefined;
    if (key)
      throw new AgentRequestError(t(key), (reason as AgentRequestError).code);
    throw reason;
  }
}
const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

export const adminApi = {
  status: (signal?: AbortSignal) =>
    adminJson<ServiceStatus>("/admin/status", { signal }),
  checkUsage: () =>
    adminJson<ServiceStatus>("/admin/usage/check", { method: "POST" }),
  setAgentPaused: (paused: boolean) =>
    adminJson<ServiceStatus>("/admin/agent-pause", post({ paused })),
  accounts: (
    { view, query }: { view: AdminAccountView; query?: string },
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams({ view });
    if (query?.trim()) params.set("q", query.trim());
    return adminJson<{ accounts: AdminAccount[] }>(
      `/admin/accounts?${params.toString()}`,
      { signal },
    );
  },
  account: (uid: string, signal?: AbortSignal) =>
    adminJson<AdminAccountDetail>(
      `/admin/accounts/${encodeURIComponent(uid)}`,
      { signal },
    ),
  act: (uid: string, action: AdminAccountAction) =>
    adminJson<AdminAccountDetail>(
      `/admin/accounts/${encodeURIComponent(uid)}/actions`,
      post(action),
    ),
  actions: (signal?: AbortSignal) =>
    adminJson<{ actions: AdminAction[] }>("/admin/actions", { signal }),
};

const QUOTA_LABELS: Record<QuotaName, TranslationKey> = {
  workerRequests: "admin.quotaWorkerRequests",
  durableObjectRequests: "admin.quotaDurableObjectRequests",
  d1RowsRead: "admin.quotaD1RowsRead",
  d1RowsWritten: "admin.quotaD1RowsWritten",
};
export const quotaLabel = (name: QuotaName) => t(QUOTA_LABELS[name]);

export const VIEW_LABELS: Record<AdminAccountView, TranslationKey> = {
  recent: "admin.viewRecent",
  writes: "admin.viewWrites",
  storage: "admin.viewStorage",
  reads: "admin.viewReads",
  disabled: "admin.viewDisabled",
  unlimited: "admin.viewUnlimited",
};

const ACTION_LABELS: Record<string, TranslationKey> = {
  disable: "admin.actionDisable",
  enable: "admin.actionEnable",
  exempt: "admin.actionExempt",
  unexempt: "admin.actionUnexempt",
  revoke_access: "admin.actionRevokeAccess",
  pause_agent: "admin.actionPauseAgent",
  resume_agent: "admin.actionResumeAgent",
};
/** An audit entry's action in words; an unknown one shows as recorded. */
export const actionLabel = (action: string) =>
  ACTION_LABELS[action] ? t(ACTION_LABELS[action]) : action;

export const percent = (share: number) => `${Math.round(share * 100)}%`;

/** What one alert tells the admin, in a sentence. */
export function alertText(alert: AdminAlert): string {
  switch (alert.code) {
    case "quota_high":
      return t("admin.alertQuota", {
        quota: quotaLabel(alert.quota),
        share: percent(alert.share),
      });
    case "usage_check_failed":
      return t("admin.alertCheckFailed", { error: alert.error });
    case "usage_check_stale":
      return t(
        alert.checkedAt === null
          ? "admin.alertNeverChecked"
          : "admin.alertStale",
      );
    case "agent_paused":
      return t(
        alert.manual ? "admin.alertPausedManual" : "admin.alertPausedAuto",
      );
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const formatCount = (value: number) => value.toLocaleString("en");

export const formatTime = (at: number) =>
  new Date(at).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
