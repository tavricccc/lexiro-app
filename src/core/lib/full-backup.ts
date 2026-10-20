// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import type { FullBackupPayload, LibraryState } from "@/core/types";
import {
  APP_NAME,
  BACKUP_FILE_PREFIX,
  FULL_BACKUP_VERSION,
  ZIP_INTERNAL_FILENAME,
} from "@/core/constants";
import { mergeLibraryStates } from "@/core/lib/library-merge";
import { normalizeFullBackupPayload } from "@/core/lib/share";
import { localDateKey } from "@/core/lib/date";

export interface BackupImportPreview {
  questions: number;
  sets: number;
}

export function createFullBackup(library: LibraryState): FullBackupPayload {
  return {
    version: FULL_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appName: APP_NAME,
    kind: "full-backup",
    library,
  };
}

export function downloadFullBackup(payload: FullBackupPayload): void {
  const bytes = zipSync({
    [ZIP_INTERNAL_FILENAME]: strToU8(JSON.stringify(payload)),
  }) as Uint8Array<ArrayBuffer>;
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/zip" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${BACKUP_FILE_PREFIX}${localDateKey()}.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function readFullBackup(file: File): Promise<FullBackupPayload> {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const raw = archive[ZIP_INTERNAL_FILENAME];
  if (!raw) throw new Error(`${ZIP_INTERNAL_FILENAME} missing`);
  return normalizeFullBackupPayload(JSON.parse(strFromU8(raw)));
}

export function previewBackupImport(
  backup: FullBackupPayload,
  currentLibrary: LibraryState,
): BackupImportPreview {
  const mergedLibrary = mergeLibraryStates(currentLibrary, backup.library);
  return {
    sets: mergedLibrary.result.addedSets,
    questions: mergedLibrary.result.addedQuestions,
  };
}
