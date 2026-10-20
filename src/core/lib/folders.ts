// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { VocabFolder } from "@/core/types";

export const ALL_FOLDER_ID = "__all__";
export const UNCATEGORIZED_FOLDER_ID = "__uncategorized__";
const UNCATEGORIZED_FOLDER_NAME = "未分類";

interface FolderOption {
  id: string;
  label: string;
  name: string;
  depth: number;
  parentId?: string;
}

export function createUncategorizedFolder(): VocabFolder {
  const timestamp = new Date(0).toISOString();
  return {
    id: UNCATEGORIZED_FOLDER_ID,
    name: UNCATEGORIZED_FOLDER_NAME,
    order: -1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * The uncategorized bucket is a destination for sets, not a real parent
 * folder. Treating it as a root selection keeps folder creation consistent
 * with file-explorer semantics.
 */
export function normalizeFolderParentId(parentId?: string): string | undefined {
  return parentId &&
    parentId !== ALL_FOLDER_ID &&
    parentId !== UNCATEGORIZED_FOLDER_ID
    ? parentId
    : undefined;
}

export function sortFolders(folders: VocabFolder[]): VocabFolder[] {
  return [...folders].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name),
  );
}

export function buildFolderOptions(folders: VocabFolder[]): FolderOption[] {
  const byParent = new Map<string | undefined, VocabFolder[]>();
  for (const folder of folders) {
    const siblings = byParent.get(folder.parentId) ?? [];
    siblings.push(folder);
    byParent.set(folder.parentId, siblings);
  }

  const options: FolderOption[] = [];
  const visited = new Set<string>();

  function visit(parentId: string | undefined, depth: number) {
    for (const folder of sortFolders(byParent.get(parentId) ?? [])) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      options.push({
        id: folder.id,
        label: `${"— ".repeat(depth)}${folder.name}`,
        name: folder.name,
        depth,
        parentId: folder.parentId,
      });
      visit(folder.id, depth + 1);
    }
  }

  visit(undefined, 0);
  return options;
}

/**
 * A folder and everything nested beneath it. Used both to scope a search to
 * the current location and to keep a folder from being moved into itself.
 */
export function collectFolderIds(
  folders: Array<{ id: string; parentId?: string }>,
  rootId: string,
): Set<string> {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

/** The path from the library root down to `current`, root first. */
export function buildFolderBreadcrumbs(
  folders: VocabFolder[],
  current?: VocabFolder,
): VocabFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: VocabFolder[] = [];
  let cursor = current;
  while (cursor) {
    path.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return path;
}

/** Direct children of a folder: sub-folders plus the sets filed in it. */
export function countDirectItems(
  folders: VocabFolder[],
  sets: Array<{ folderId: string }>,
  folderId: string,
): number {
  return (
    folders.filter((folder) => folder.parentId === folderId).length +
    sets.filter((entry) => entry.folderId === folderId).length
  );
}
