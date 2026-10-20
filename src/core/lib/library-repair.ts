// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  LibraryQuestion,
  LibrarySet,
  LibraryState,
  SenseId,
  SetMembership,
  VocabFolder,
  WordEntry,
  WordKey,
} from "@/core/types";
import {
  createUncategorizedFolder,
  sortFolders,
  UNCATEGORIZED_FOLDER_ID,
} from "./folders";
import { sanitizeMemberships } from "./library-membership";
import { questionUsesWords } from "./question-ownership";
import { entriesOf } from "./record";
import { createUniqueSetName } from "./set-name";
import {
  isolateLibrarySets,
  LIBRARY_STATE_VERSION,
  type LibraryScopeMigration,
} from "./library-set-migration";
import { buildSetWordKey } from "./library";
import { questionBelongsToMemberships } from "./question-ownership";

/**
 * Makes a Library state satisfy every invariant `normalizeLibraryState` checks,
 * by repairing it rather than rejecting it.
 *
 * Cloud sync needs this because two devices can each make a perfectly valid
 * change that is invalid together: both create a folder called 單元一, or one
 * deletes the set that the other's new question belongs to. A merge that threw
 * on such a pair would leave sync permanently broken with no way for the user
 * to get out of it, so every conflict here has to resolve to *something*:
 * a duplicate name gets a suffix, a reference to something that no longer
 * exists gets dropped.
 *
 * Every rule is a pure function of the input, so two devices that merge the
 * same records independently arrive at the same Library.
 */
export interface LibraryDraft {
  version?: number;
  words: Record<WordKey, WordEntry>;
  sets: LibrarySet[];
  memberships: Record<string, SetMembership[]>;
  folders: VocabFolder[];
  questions: LibraryQuestion[];
  updatedAt: string;
}

/**
 * Keeps only the senses some set still lists, and only the words that keep at
 * least one. Words are owned by their memberships: a sense nothing points at is
 * unreachable in the UI and is rejected by the Library's own validation.
 */
export function pruneWordsToMemberships(
  words: Record<WordKey, WordEntry>,
  memberships: Record<string, SetMembership[]>,
): Record<WordKey, WordEntry> {
  const usedByWord = new Map<WordKey, Set<SenseId>>();
  for (const membership of Object.values(memberships).flat()) {
    const ids = usedByWord.get(membership.wordKey) ?? new Set<SenseId>();
    membership.senseIds.forEach((senseId) => ids.add(senseId));
    usedByWord.set(membership.wordKey, ids);
  }
  return Object.fromEntries(
    entriesOf(words).flatMap(([wordKey, word]) => {
      const ids = usedByWord.get(wordKey);
      if (!ids) return [];
      const senses = word.senses.filter((sense) => ids.has(sense.id));
      return senses.length ? [[wordKey, { ...word, senses }]] : [];
    }),
  ) as Record<WordKey, WordEntry>;
}

/**
 * The parent this folder can actually keep. A parent that is gone, and a cycle
 * two devices created between them, resolve the same way: the folder becomes a
 * root folder rather than disappearing with everything filed under it.
 */
function resolveParentId(
  folder: VocabFolder,
  byId: ReadonlyMap<string, VocabFolder>,
): string | undefined {
  if (folder.id === UNCATEGORIZED_FOLDER_ID) return undefined;
  const parentId = folder.parentId;
  if (!parentId || !byId.has(parentId)) return undefined;
  const visited = new Set<string>([folder.id]);
  let cursor = byId.get(parentId);
  while (cursor) {
    if (visited.has(cursor.id)) return undefined;
    visited.add(cursor.id);
    if (!cursor.parentId) break;
    cursor = byId.get(cursor.parentId);
  }
  return parentId;
}

function repairFolders(folders: VocabFolder[]): VocabFolder[] {
  const byId = new Map<string, VocabFolder>();
  for (const folder of folders) byId.set(folder.id, folder);
  const uncategorized: VocabFolder = {
    ...createUncategorizedFolder(),
    ...byId.get(UNCATEGORIZED_FOLDER_ID),
    id: UNCATEGORIZED_FOLDER_ID,
    parentId: undefined,
  };
  byId.set(UNCATEGORIZED_FOLDER_ID, uncategorized);

  // Sibling names must be unique. The uncategorized bucket claims its name
  // first and the rest are ordered by id, so two devices merging the same
  // folders rename the same one.
  const namesByParent = new Map<string, Set<string>>([
    ["", new Set([uncategorized.name.trim().toLocaleLowerCase()])],
  ]);
  const named: VocabFolder[] = [uncategorized];
  const rest = [...byId.values()]
    .filter((folder) => folder.id !== UNCATEGORIZED_FOLDER_ID)
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const folder of rest) {
    const parentId = resolveParentId(folder, byId);
    const scope = parentId ?? "";
    const used = namesByParent.get(scope) ?? new Set<string>();
    const name = createUniqueSetName(folder.name.trim() || "資料夾", used);
    used.add(name.trim().toLocaleLowerCase());
    namesByParent.set(scope, used);
    named.push({ ...folder, name, parentId });
  }
  return sortFolders(named);
}

function repairSets(sets: LibrarySet[], folderIds: Set<string>): LibrarySet[] {
  const byId = new Map<string, LibrarySet>();
  for (const entry of sets) byId.set(entry.id, entry);
  const used = new Set<string>();
  return [...byId.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entry) => {
      const setName = createUniqueSetName(
        entry.setName.trim() || "單字集",
        used,
      );
      used.add(setName.trim().toLocaleLowerCase());
      return {
        ...entry,
        setName,
        folderId: folderIds.has(entry.folderId)
          ? entry.folderId
          : UNCATEGORIZED_FOLDER_ID,
      };
    });
}

export function repairLibraryStateWithMigration(
  draft: LibraryDraft,
): LibraryScopeMigration {
  const folders = repairFolders(draft.folders);
  const folderIds = new Set(folders.map((folder) => folder.id));
  const sets = repairSets(draft.sets, folderIds);
  const setIds = new Set(sets.map((entry) => entry.id));

  const memberships: Record<string, SetMembership[]> = {};
  for (const [setId, entries] of Object.entries(draft.memberships)) {
    if (!setIds.has(setId)) continue;
    const sanitized = sanitizeMemberships(entries, draft.words).filter(
      (member) =>
        draft.version === 1 ||
        member.wordKey ===
          buildSetWordKey(setId, draft.words[member.wordKey].word),
    );
    if (sanitized.length) memberships[setId] = sanitized;
  }

  // A set with nothing left in it is not a set the user can open, and the
  // Library refuses to store one, so it goes with its last word.
  const populated = new Set(Object.keys(memberships));
  const words = pruneWordsToMemberships(draft.words, memberships);

  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const questions: LibraryQuestion[] = [];
  for (const question of draft.questions) {
    if (seenIds.has(question.id) || seenFingerprints.has(question.fingerprint))
      continue;
    if (!questionUsesWords(question, words)) continue;
    if (
      draft.version !== 1 &&
      !sets.some((set) =>
        questionBelongsToMemberships(question, memberships[set.id] ?? []),
      )
    )
      continue;
    seenIds.add(question.id);
    seenFingerprints.add(question.fingerprint);
    questions.push(question);
  }

  const state = {
    version: draft.version ?? LIBRARY_STATE_VERSION,
    words,
    sets: sets.filter((entry) => populated.has(entry.id)),
    memberships,
    folders,
    questions,
    updatedAt: draft.updatedAt,
  };
  return isolateLibrarySets(state);
}

export function repairLibraryState(draft: LibraryDraft): LibraryState {
  return repairLibraryStateWithMigration(draft).state;
}
