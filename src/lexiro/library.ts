import { senseToStudyWord } from "@/core/lib/library";
import type { LibraryState, StudyWord } from "@/core/types";

// View selectors over the shared library state, used until each screen moves
// to the web's own components/practice and library helpers.

/** The senses a set practises, or the whole library for an empty id. */
export function studyWordsFor(state: LibraryState, setId: string): StudyWord[] {
  const memberships = setId
    ? (state.memberships[setId] ?? [])
    : Object.values(state.memberships).flat();
  const seen = new Set<string>();
  const result: StudyWord[] = [];
  for (const membership of memberships) {
    const word = state.words[membership.wordKey];
    if (!word) continue;
    for (const senseId of membership.senseIds) {
      const sense = word.senses.find((entry) => entry.id === senseId);
      if (!sense || seen.has(sense.id)) continue;
      seen.add(sense.id);
      result.push(senseToStudyWord(word, sense));
    }
  }
  return result;
}

/** Every sense in the library: the distractor pool for word questions. */
// One array per library state, so the question builder's prepared pool is reused.
const pools = new WeakMap<LibraryState, StudyWord[]>();

export function allStudyWords(state: LibraryState): StudyWord[] {
  const cached = pools.get(state);
  if (cached) return cached;
  const pool = Object.values(state.words).flatMap((word) =>
    word.senses.map((sense) => senseToStudyWord(word, sense)),
  );
  pools.set(state, pool);
  return pool;
}

/** One row per word in a set, with its senses in membership order. */
export function setWords(state: LibraryState, setId: string) {
  return (state.memberships[setId] ?? []).flatMap((membership) => {
    const word = state.words[membership.wordKey];
    if (!word) return [];
    const senses = membership.senseIds.flatMap((senseId) => {
      const sense = word.senses.find((entry) => entry.id === senseId);
      return sense ? [sense] : [];
    });
    return senses.length ? [{ wordKey: word.wordKey, word: word.word, senses }] : [];
  });
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
