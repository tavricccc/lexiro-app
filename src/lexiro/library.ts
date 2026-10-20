import type {
  CloudRecord,
  LibraryQuestion,
  LibrarySet,
  LibraryState,
  SetMembership,
  StudyWord,
  VocabFolder,
  WordEntry,
} from "./types";

/**
 * Folds pulled records into the library in server order, the same rule as the
 * web app (lexiro/src/lib/cloud-records.ts). The app does not edit yet, so
 * there are no local changes to hold back.
 */
export function applyCloudRecords(
  state: LibraryState,
  records: readonly CloudRecord[],
): LibraryState {
  const folders = new Map(state.folders.map((entry) => [entry.id, entry]));
  const sets = new Map(state.sets.map((entry) => [entry.id, entry]));
  const questions = new Map(state.questions.map((entry) => [entry.id, entry]));
  const words = { ...state.words };
  const memberships = { ...state.memberships };
  for (const record of records) {
    const key = record.recordKey;
    const payload = record.payload;
    switch (record.type) {
      case "folder":
        if (record.deleted) folders.delete(key);
        else folders.set(key, payload as unknown as VocabFolder);
        break;
      case "set":
        if (record.deleted) sets.delete(key);
        else sets.set(key, payload as unknown as LibrarySet);
        break;
      case "question":
        if (record.deleted) questions.delete(key);
        else questions.set(key, payload as unknown as LibraryQuestion);
        break;
      case "word":
        if (record.deleted) delete words[key];
        else words[key] = payload as unknown as WordEntry;
        break;
      case "membership": {
        const members = payload?.members;
        if (record.deleted) delete memberships[key];
        else if (Array.isArray(members))
          memberships[key] = members as SetMembership[];
        break;
      }
    }
  }
  return {
    words,
    sets: [...sets.values()],
    memberships,
    folders: [...folders.values()],
    questions: [...questions.values()],
  };
}

function toStudyWord(word: WordEntry, sense: WordEntry["senses"][number]): StudyWord {
  return {
    id: sense.id,
    wordKey: word.wordKey,
    word: word.word,
    pos: sense.pos,
    meaning: sense.meaningZh,
    examples: [...sense.examples],
  };
}

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
      result.push(toStudyWord(word, sense));
    }
  }
  return result;
}

/** Every sense in the library: the distractor pool for word questions. */
export function allStudyWords(state: LibraryState): StudyWord[] {
  return Object.values(state.words).flatMap((word) =>
    word.senses.map((sense) => toStudyWord(word, sense)),
  );
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
