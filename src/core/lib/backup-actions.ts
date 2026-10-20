// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { FullBackupPayload } from "@/core/types";
import { useLibraryStore, flushLibraryMutations } from "@/core/stores/library-store";
import { serializeAccountDataAction } from "@/core/lib/account-data-queue";
import { createFullBackup } from "@/core/lib/full-backup";
import { getStorageNamespace } from "@/core/lib/persist";
import { t } from "./i18n";

function checkAccount(namespace: string, action: "import" | "export") {
  if (namespace !== getStorageNamespace())
    throw new Error(
      t(
        action === "import"
          ? "settings.backupAccountChanged"
          : "settings.backupExportAccountChanged",
      ),
    );
}

export const importFullBackup = serializeAccountDataAction(
  async (backup: FullBackupPayload, namespace: string) => {
    checkAccount(namespace, "import");
    await useLibraryStore.getState().importState(backup.library);
  },
);

export const prepareFullBackup = serializeAccountDataAction(
  async (namespace: string) => {
    checkAccount(namespace, "export");
    await flushLibraryMutations();
    return createFullBackup(useLibraryStore.getState().state);
  },
);
