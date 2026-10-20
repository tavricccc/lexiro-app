// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { t } from "@/core/lib/i18n";
import type { SyncStatus } from "@/core/types";

/** One word for what the cloud is doing, shared by every place that says it. */
export function syncStatusLabel(status: SyncStatus, pending = 0): string {
  if (status === "synced" && pending > 0) return t("settings.syncQueued");
  if (status === "disabled") return t("settings.syncDisabled");
  if (status === "signed-out") return t("settings.syncSignedOut");
  if (status === "synced") return t("settings.syncSynced");
  if (status === "offline") return t("settings.syncOffline");
  if (status === "error") return t("settings.syncError");
  if (status === "connecting") return t("settings.syncConnecting");
  return t("settings.syncWorking");
}
