import type { LibraryState } from "@/core/types";
import { compareWords } from "@/core/lib/library";

// View selectors over the shared library state, used until each screen moves
// to the web's own components/practice and library helpers.

/** One row per word in a set, with its senses in membership order. */
export function setWords(state: LibraryState, setId: string) {
  return (state.memberships[setId] ?? [])
    .flatMap((membership) => {
      const word = state.words[membership.wordKey];
      if (!word) return [];
      const senses = membership.senseIds.flatMap((senseId) => {
        const sense = word.senses.find((entry) => entry.id === senseId);
        return sense ? [sense] : [];
      });
      return senses.length
        ? [{ wordKey: word.wordKey, word: word.word, senses }]
        : [];
    })
    .sort((a, b) => compareWords(a.word, b.word));
}

export function senseCount(state: LibraryState, setId: string): number {
  return (state.memberships[setId] ?? []).reduce(
    (total, membership) => total + membership.senseIds.length,
    0,
  );
}

export function sortedFolders(state: LibraryState) {
  return [...state.folders].sort((a, b) => a.order - b.order);
}

export function setsInFolder(state: LibraryState, folderId: string) {
  return state.sets
    .filter((set) => set.folderId === folderId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
