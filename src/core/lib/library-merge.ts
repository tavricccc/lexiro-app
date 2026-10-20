// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  LibraryState,
  SenseId,
  SetMembership,
  WordEntry,
  WordKey,
} from "@/core/types";
import { UNCATEGORIZED_FOLDER_ID } from "./folders";
import { mergeWord } from "./library";
import { sanitizeMemberships } from "./library-membership";
import { questionUsesWords } from "./question-ownership";
import { entriesOf } from "./record";
import { createUniqueSetName } from "./set-name";
import { normalizeLibraryState } from "./share";
import { LIBRARY_STATE_VERSION } from "./library-set-migration";

export interface LibraryMergeResult {
  addedSets: number;
  addedQuestions: number;
}

function mergeWordEntries(
  base: Record<WordKey, WordEntry>,
  entries: WordEntry[],
): Record<WordKey, WordEntry> {
  const nextWords = { ...base };
  for (const word of entries) {
    const wordKey = word.wordKey;
    nextWords[wordKey] = mergeWord(nextWords[wordKey], { ...word, wordKey });
  }
  return nextWords;
}

function pruneOrphans(
  state: Omit<LibraryState, "updatedAt">,
): Omit<LibraryState, "updatedAt"> {
  const memberships = Object.values(state.memberships).flat();
  const referencedWordKeys = new Set(
    memberships.map((member) => member.wordKey),
  );
  const senseReferences = new Map<WordKey, Set<SenseId>>();
  for (const member of memberships) {
    const wordKey = member.wordKey;
    const word = state.words[wordKey];
    if (!word) continue;
    const senseIds = senseReferences.get(wordKey) ?? new Set<SenseId>();
    for (const senseId of member.senseIds) {
      if (word.senses.some((sense) => sense.id === senseId))
        senseIds.add(senseId);
    }
    senseReferences.set(wordKey, senseIds);
  }

  const words = Object.fromEntries(
    entriesOf(state.words)
      .filter(
        ([wordKey]) =>
          referencedWordKeys.has(wordKey) &&
          (senseReferences.get(wordKey)?.size ?? 0) > 0,
      )
      .map(([wordKey, word]) => {
        const senseIds = senseReferences.get(wordKey)!;
        return [
          wordKey,
          {
            ...word,
            senses: word.senses.filter((sense) => senseIds.has(sense.id)),
          },
        ];
      }),
  );
  // A question survives as long as every sense it asks about is still in the
  // Library. Requiring one single set to hold all of them dropped reading packs
  // whose senses had been split across sets.
  const questions = state.questions.filter((question) =>
    questionUsesWords(question, words),
  );
  return { ...state, words, questions };
}

/** Merge a complete incoming Library without materializing it in application state. */
export function mergeLibraryStates(
  current: LibraryState,
  incoming: LibraryState,
): { state: LibraryState; result: LibraryMergeResult } {
  const base = normalizeLibraryState(current);
  const source = normalizeLibraryState(incoming);
  const nextWords = mergeWordEntries(base.words, Object.values(source.words));
  const existingFolderIds = new Set(base.folders.map((folder) => folder.id));
  const nextFolders = [...base.folders];
  for (const folder of source.folders) {
    if (existingFolderIds.has(folder.id)) continue;
    nextFolders.push(folder);
    existingFolderIds.add(folder.id);
  }

  const nextSets = [...base.sets];
  const existingSetIds = new Set(nextSets.map((set) => set.id));
  const existingNames = new Set(
    nextSets.map((set) => set.setName.trim().toLocaleLowerCase()),
  );
  const setIdMap = new Map<string, string>();
  let addedSets = 0;
  for (const incomingSet of source.sets) {
    if (existingSetIds.has(incomingSet.id)) {
      setIdMap.set(incomingSet.id, incomingSet.id);
      continue;
    }
    const setName = createUniqueSetName(
      incomingSet.setName.trim() || "Imported set",
      existingNames,
    );
    existingNames.add(setName.toLocaleLowerCase());
    const folderId = nextFolders.some(
      (folder) => folder.id === incomingSet.folderId,
    )
      ? incomingSet.folderId
      : UNCATEGORIZED_FOLDER_ID;
    nextSets.push({ ...incomingSet, setName, folderId });
    existingSetIds.add(incomingSet.id);
    setIdMap.set(incomingSet.id, incomingSet.id);
    addedSets += 1;
  }

  const nextMemberships: Record<string, SetMembership[]> = {
    ...base.memberships,
  };
  for (const incomingSet of source.sets) {
    const targetSetId = setIdMap.get(incomingSet.id);
    if (!targetSetId || base.memberships[targetSetId]) continue;
    nextMemberships[targetSetId] = source.memberships[incomingSet.id].map(
      (member) => ({ wordKey: member.wordKey, senseIds: [...member.senseIds] }),
    );
  }

  const existingQuestionIds = new Set(
    base.questions.map((question) => question.id),
  );
  const existingQuestionFingerprints = new Set(
    base.questions.map((question) => question.fingerprint),
  );
  const nextQuestions = [...base.questions];
  let addedQuestions = 0;
  for (const question of source.questions) {
    if (
      existingQuestionIds.has(question.id) ||
      existingQuestionFingerprints.has(question.fingerprint) ||
      !questionUsesWords(question, nextWords)
    )
      continue;
    nextQuestions.push(question);
    existingQuestionIds.add(question.id);
    existingQuestionFingerprints.add(question.fingerprint);
    addedQuestions += 1;
  }

  const sanitizedMemberships: Record<string, SetMembership[]> = {};
  for (const [setId, memberships] of Object.entries(nextMemberships)) {
    const normalized = sanitizeMemberships(memberships, nextWords);
    if (normalized.length) sanitizedMemberships[setId] = normalized;
  }
  const populatedSetIds = new Set(Object.keys(sanitizedMemberships));
  const pruned = pruneOrphans({
    version: LIBRARY_STATE_VERSION,
    words: nextWords,
    sets: nextSets.filter((set) => populatedSetIds.has(set.id)),
    memberships: sanitizedMemberships,
    folders: nextFolders,
    questions: nextQuestions,
  });
  return {
    state: normalizeLibraryState({
      ...pruned,
      updatedAt: new Date().toISOString(),
    }),
    result: { addedSets, addedQuestions },
  };
}
