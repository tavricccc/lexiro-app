// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { LibrarySet } from "@/core/types";

/**
 * Manual ordering for sets inside a folder.
 *
 * Dragging a set normally writes a single record, so only that one set is
 * synced: `planSetReorder` picks a fractional order between its neighbours and
 * falls back to renumbering the folder only when there is no room left.
 */

/** Newest first, then by id, for sets that have no manual position yet. */
function compareUnordered(a: LibrarySet, b: LibrarySet): number {
  return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}

/**
 * Places sets that were never dragged before sets that were, so a folder's
 * existing apparent order is not disturbed when manual ordering starts.
 */
export function compareSets(a: LibrarySet, b: LibrarySet): number {
  if (a.order === undefined || b.order === undefined) {
    if (a.order === undefined && b.order === undefined)
      return compareUnordered(a, b);
    return a.order === undefined ? -1 : 1;
  }
  return a.order - b.order || compareUnordered(a, b);
}

/** A sorted copy; the caller's array is left untouched. */
export function sortSets<T extends LibrarySet>(sets: readonly T[]): T[] {
  return [...sets].sort(compareSets);
}

/** Rewrites the whole listing and reports only the positions that changed. */
function renumberSets(
  listing: readonly LibrarySet[],
): { id: string; order: number }[] {
  return listing.flatMap((entry, index) => {
    const order = (index + 1) * 1024;
    return entry.order === order ? [] : [{ id: entry.id, order }];
  });
}

/**
 * Works out the writes needed to move one set to `toIndex` within its folder.
 *
 * `listing` must already be sorted. The move follows arrayMove semantics: the
 * set is removed first and inserted afterwards, and `toIndex` is clamped to the
 * listing. A no-op returns no writes, and a full renumbering skips sets whose
 * position is already correct.
 */
export function planSetReorder(
  listing: readonly LibrarySet[],
  id: string,
  toIndex: number,
): { id: string; order: number }[] {
  const fromIndex = listing.findIndex((entry) => entry.id === id);
  if (fromIndex === -1) return [];
  const targetIndex = Math.min(
    listing.length - 1,
    Math.max(0, Math.trunc(toIndex)),
  );
  if (fromIndex === targetIndex) return [];

  const reordered = [...listing];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(targetIndex, 0, moved);

  if (reordered.every((entry) => entry.order !== undefined)) {
    const previous = reordered[targetIndex - 1];
    const next = reordered[targetIndex + 1];
    if (!previous) return [{ id, order: next!.order! - 1024 }];
    if (!next) return [{ id, order: previous.order! + 1024 }];
    const order = (previous.order! + next.order!) / 2;
    if (order !== previous.order && order !== next.order)
      return [{ id, order }];
  }
  return renumberSets(reordered);
}
