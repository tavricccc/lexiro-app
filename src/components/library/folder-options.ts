import {
  buildFolderOptions,
  collectFolderIds,
  UNCATEGORIZED_FOLDER_ID,
} from "@/core/lib/folders";
import { t } from "@/core/lib/i18n";
import type { VocabFolder } from "@/core/types";

/** Where a set can be filed: 未分類 first, then the folder tree, indented. */
export function setFolderOptions(folders: VocabFolder[]) {
  return [
    { label: t("library.uncategorized"), value: UNCATEGORIZED_FOLDER_ID },
    ...buildFolderOptions(folders)
      .filter((folder) => folder.id !== UNCATEGORIZED_FOLDER_ID)
      .map((folder) => ({ label: folder.label, value: folder.id })),
  ];
}

/** Radix-style sentinel for the library root, which has no folder id. */
export const ROOT_FOLDER = "__root__";

/** Where a folder can move: the root, or any folder outside its own subtree. */
export function folderParentOptions(folders: VocabFolder[], folderId: string) {
  const own = collectFolderIds(folders, folderId);
  return [
    { label: t("library.rootFolder"), value: ROOT_FOLDER },
    ...buildFolderOptions(folders)
      .filter(
        (folder) =>
          folder.id !== UNCATEGORIZED_FOLDER_ID && !own.has(folder.id),
      )
      .map((folder) => ({ label: folder.label, value: folder.id })),
  ];
}
