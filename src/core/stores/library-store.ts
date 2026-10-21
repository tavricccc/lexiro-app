// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
"use client";

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
import { create } from "zustand";
import { createMutationQueue } from "@/core/lib/mutation-queue";

import { UNCATEGORIZED_FOLDER_ID } from "@/core/lib/folders";
import { randomUUID } from "@/core/lib/id";
import {
  buildSenseId,
  buildSetWordKey,
  canonicalizeQuestion,
  normalizePartOfSpeech,
  normalizeWordKey,
} from "@/core/lib/library";
import { pruneWordsToMemberships } from "@/core/lib/library-repair";
import {
  emptyLibraryState,
  getLibraryRepository,
  resetLibraryRepositoryCache,
} from "@/core/lib/library-repository";
import {
  questionBelongsToMemberships,
  questionUsesWords,
} from "@/core/lib/question-ownership";
import { mergeLibraryStates } from "@/core/lib/library-merge";
import {
  loadSyncJournal,
  recordLocalChanges,
  remapPendingLibraryRefs,
  setSyncCursor,
  untrackChanges,
} from "@/core/lib/sync-journal";
import { normalizeLibraryStateWithMigration } from "@/core/lib/share";
import { LIBRARY_STATE_VERSION } from "@/core/lib/library-set-migration";

export interface WordDraftInput {
  word: string;
  pos: string;
  meaningZh: string;
  examples: string[];
  supplementary: boolean;
}
/** A question whose content already exists is reported, never silently dropped. */
export type SaveQuestionResult = "saved" | "duplicate";
interface SenseRemap {
  oldWordKey: WordKey;
  oldSenseId: SenseId;
  newWordKey: WordKey;
  newSenseId: SenseId;
}

interface LibraryStore {
  state: LibraryState;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  hydrate: () => Promise<void>;
  createFolder: (name: string, parentId?: string) => Promise<VocabFolder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  moveFolder: (id: string, parentId?: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveSet: (id: string, folderId: string) => Promise<void>;
  reorderSets: (updates: { id: string; order: number }[]) => Promise<void>;
  renameSet: (id: string, setName: string) => Promise<void>;
  saveSet: (input: {
    id?: string;
    setName: string;
    folderId?: string;
    words: WordDraftInput[];
    remaps?: SenseRemap[];
  }) => Promise<LibrarySet>;
  deleteSet: (id: string) => Promise<void>;
  saveQuestion: (question: LibraryQuestion) => Promise<SaveQuestionResult>;
  deleteQuestion: (id: string) => Promise<void>;
  clearQuestions: (setId?: string) => Promise<void>;
  importState: (state: LibraryState) => Promise<void>;
  /** Writes a state that came from the cloud, without queuing it to go back. */
  applyRemoteState: (
    update: (current: LibraryState) => Promise<LibraryState | null>,
  ) => Promise<void>;
  /** Re-reads the Library after the active account changed. */
  reloadNamespace: () => Promise<void>;
}

const now = () => new Date().toISOString();

const { serial, flush: flushLibraryMutations } = createMutationQueue();
export { flushLibraryMutations };

/**
 * Writes the Library and notes what changed for sync.
 *
 * The repository already diffs this commit against the previous generation, so
 * the record-level list of what was written and what disappeared comes back
 * from the write itself. That is what lets every mutation below stay ignorant
 * of synchronization: deleting a folder does not have to remember to say that
 * eleven words went with it.
 */
async function commit(state: LibraryState) {
  const stats = await getLibraryRepository().commit(state);
  await recordLocalChanges(stats.changed, stats.removed);
}

/** Finish the durable migration before exposing the new identities to the UI. */
async function loadCurrentLibrary(): Promise<LibraryState> {
  const repository = getLibraryRepository();
  const stored = await repository.loadState();
  const migration = normalizeLibraryStateWithMigration(stored);
  let intent = await repository.scopeMigrationIntent();
  if (stored.version !== LIBRARY_STATE_VERSION) {
    const journal = await loadSyncJournal();
    intent = await repository.beginScopeMigration(migration, journal);
    await repository.commit(migration.state);
  }
  if (intent) {
    await remapPendingLibraryRefs(intent.recordRemaps, intent.legacyPending);
    await recordLocalChanges(intent.initialChanged, []);
    await setSyncCursor("");
    await repository.completeScopeMigration();
  }
  return migration.state;
}

function folderDescendants(
  folders: VocabFolder[],
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

/**
 * Saving a set rebuilds every word in it. Words that came out the same keep
 * their original object and updatedAt, so sync only uploads what changed
 * instead of the whole set on every save.
 */
function keepUnchangedWords(
  before: Record<WordKey, WordEntry>,
  after: Record<WordKey, WordEntry>,
  timestamp: string,
): Record<WordKey, WordEntry> {
  const content = (word: WordEntry) =>
    JSON.stringify({ ...word, updatedAt: "" });
  return Object.fromEntries(
    Object.entries(after).map(([wordKey, word]) => {
      const previous = before[wordKey as WordKey];
      if (!previous) return [wordKey, word];
      return [
        wordKey,
        content(previous) === content(word)
          ? previous
          : { ...word, updatedAt: timestamp },
      ];
    }),
  ) as Record<WordKey, WordEntry>;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  state: emptyLibraryState(),
  status: "idle",
  error: null,

  hydrate: serial(async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading", error: null });
    try {
      const state = await loadCurrentLibrary();
      set({ state, status: "ready" });
    } catch (error) {
      set({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }),

  createFolder: serial(async (name, parentId) => {
    const timestamp = now();
    const normalizedName = name.trim().toLocaleLowerCase();
    if (
      !normalizedName ||
      get().state.folders.some(
        (folder) =>
          folder.parentId === parentId &&
          folder.name.trim().toLocaleLowerCase() === normalizedName,
      )
    )
      throw new Error("folder-name-conflict");
    const folder: VocabFolder = {
      id: randomUUID(),
      name: name.trim(),
      ...(parentId ? { parentId } : {}),
      order: get().state.folders.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const state = {
      ...get().state,
      folders: [...get().state.folders, folder],
      updatedAt: timestamp,
    };
    await commit(state);
    set({ state });
    return folder;
  }),

  renameFolder: serial(async (id, name) => {
    const timestamp = now();
    const current = get().state.folders.find((folder) => folder.id === id);
    if (!current) return;
    const normalizedName = name.trim().toLocaleLowerCase();
    if (
      !normalizedName ||
      get().state.folders.some(
        (folder) =>
          folder.id !== id &&
          folder.parentId === current.parentId &&
          folder.name.trim().toLocaleLowerCase() === normalizedName,
      )
    )
      throw new Error("folder-name-conflict");
    const state = {
      ...get().state,
      folders: get().state.folders.map((folder) =>
        folder.id === id
          ? { ...folder, name: name.trim(), updatedAt: timestamp }
          : folder,
      ),
      updatedAt: timestamp,
    };
    await commit(state);
    set({ state });
  }),

  moveFolder: serial(async (id, parentId) => {
    const current = get().state.folders.find((folder) => folder.id === id);
    if (!current || id === UNCATEGORIZED_FOLDER_ID || id === parentId) return;
    const descendants = folderDescendants(get().state.folders, id);
    if (parentId && descendants.has(parentId)) throw new Error("folder-cycle");
    if (
      get().state.folders.some(
        (folder) =>
          folder.id !== id &&
          folder.parentId === parentId &&
          folder.name.trim().toLocaleLowerCase() ===
            current.name.trim().toLocaleLowerCase(),
      )
    )
      throw new Error("folder-name-conflict");
    const timestamp = now();
    const state = {
      ...get().state,
      folders: get().state.folders.map((folder) =>
        folder.id === id
          ? {
              ...folder,
              ...(parentId ? { parentId } : { parentId: undefined }),
              updatedAt: timestamp,
            }
          : folder,
      ),
      updatedAt: timestamp,
    };
    await commit(state);
    set({ state });
  }),

  deleteFolder: serial(async (id) => {
    if (id === UNCATEGORIZED_FOLDER_ID) return;
    const timestamp = now();
    const removed = folderDescendants(get().state.folders, id);
    const removedSetIds = new Set(
      get()
        .state.sets.filter((entry) => removed.has(entry.folderId))
        .map((entry) => entry.id),
    );
    const memberships = Object.fromEntries(
      Object.entries(get().state.memberships).filter(
        ([setId]) => !removedSetIds.has(setId),
      ),
    );
    const words = pruneWordsToMemberships(get().state.words, memberships);
    const state = {
      ...get().state,
      folders: get().state.folders.filter((folder) => !removed.has(folder.id)),
      sets: get().state.sets.filter((entry) => !removedSetIds.has(entry.id)),
      memberships,
      words,
      questions: get().state.questions.filter((question) =>
        questionUsesWords(question, words),
      ),
      updatedAt: timestamp,
    };
    await commit(state);
    set({ state });
  }),

  moveSet: serial(async (id, folderId) => {
    const current = get().state.sets.find((entry) => entry.id === id);
    const destinationExists =
      folderId === UNCATEGORIZED_FOLDER_ID ||
      get().state.folders.some((folder) => folder.id === folderId);
    if (!current || current.folderId === folderId) return;
    if (!destinationExists) throw new Error("folder-not-found");
    const timestamp = now();
    // The destination folder has its own order; this set has not been placed
    // there by hand yet.
    const { order: _order, ...moved } = current;
    const state = {
      ...get().state,
      sets: get().state.sets.map((entry) =>
        entry.id === id ? { ...moved, folderId, updatedAt: timestamp } : entry,
      ),
      updatedAt: timestamp,
    };
    await commit(state);
    set({ state });
  }),

  reorderSets: serial(async (updates) => {
    if (!updates.length) return;
    const timestamp = now();
    const orderById = new Map(updates.map((entry) => [entry.id, entry.order]));
    const state = {
      ...get().state,
      sets: get().state.sets.map((entry) => {
        const order = orderById.get(entry.id);
        return order === undefined
          ? entry
          : { ...entry, order, updatedAt: timestamp };
      }),
      updatedAt: timestamp,
    };
    await commit(state);
    set({ state });
  }),

  renameSet: serial(async (id, setName) => {
    const name = setName.trim();
    if (!name) throw new Error("set-name-empty");
    const current = get().state.sets.find((entry) => entry.id === id);
    if (!current) return;
    const normalizedName = name.toLocaleLowerCase();
    if (
      get().state.sets.some(
        (entry) =>
          entry.id !== id &&
          entry.setName.trim().toLocaleLowerCase() === normalizedName,
      )
    )
      throw new Error("set-name-conflict");
    if (current.setName.trim() === name) return;
    const timestamp = now();
    const state = {
      ...get().state,
      sets: get().state.sets.map((entry) =>
        entry.id === id
          ? { ...entry, setName: name, updatedAt: timestamp }
          : entry,
      ),
      updatedAt: timestamp,
    };
    await commit(state);
    set({ state });
  }),

  saveSet: serial(
    async ({ id, setName, folderId, words: drafts, remaps = [] }) => {
      const timestamp = now();
      const setId = id ?? randomUUID();
      const previous = get().state.sets.find((entry) => entry.id === setId);
      const librarySet: LibrarySet = {
        id: setId,
        setName: setName.trim(),
        folderId: folderId || UNCATEGORIZED_FOLDER_ID,
        ...(previous?.order === undefined ? {} : { order: previous.order }),
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      const words = { ...get().state.words };
      const membershipMap = new Map<WordKey, Set<SenseId>>();
      const writtenSenses = new Set<SenseId>();
      for (const draft of drafts) {
        const wordKey = buildSetWordKey(setId, draft.word);
        const pos = normalizePartOfSpeech(draft.pos) || draft.pos.trim();
        const meaningZh = draft.meaningZh.trim();
        if (!normalizeWordKey(draft.word) || !pos || !meaningZh) continue;
        const senseId = buildSenseId(wordKey, pos, meaningZh);
        const current = words[wordKey];
        const entry: WordEntry = current ?? {
          wordKey,
          word: draft.word.trim(),
          senses: [],
          updatedAt: timestamp,
        };
        const sense = entry.senses.find((item) => item.id === senseId);
        words[wordKey] = {
          ...entry,
          word: draft.word.trim(),
          senses: sense
            ? entry.senses.map((item) =>
                item.id === senseId
                  ? {
                      ...item,
                      examples: [
                        ...new Set([
                          ...(writtenSenses.has(senseId) ? item.examples : []),
                          ...draft.examples
                            .map((value) => value.trim())
                            .filter(Boolean),
                        ]),
                      ],
                    }
                  : item,
              )
            : [
                ...entry.senses,
                {
                  id: senseId,
                  pos,
                  meaningZh,
                  examples: draft.examples
                    .map((value) => value.trim())
                    .filter(Boolean),
                  supplementary: draft.supplementary,
                },
              ],
          updatedAt: timestamp,
        };
        const senses = membershipMap.get(wordKey) ?? new Set<SenseId>();
        writtenSenses.add(senseId);
        senses.add(senseId);
        membershipMap.set(wordKey, senses);
      }
      const memberships: SetMembership[] = [...membershipMap].map(
        ([wordKey, senseIds]) => ({ wordKey, senseIds: [...senseIds] }),
      );
      const remapBySense = new Map(
        remaps.map((entry) => [entry.oldSenseId, entry]),
      );
      const ownedSenses = new Set(
        (get().state.memberships[setId] ?? []).flatMap(
          (member) => member.senseIds,
        ),
      );
      if (remaps.some((remap) => !ownedSenses.has(remap.oldSenseId)))
        throw new Error("只能修改本集的詞義來源");
      const nextMemberships = {
        ...get().state.memberships,
        [setId]: memberships,
      };
      const prunedWords = keepUnchangedWords(
        get().state.words,
        pruneWordsToMemberships(words, nextMemberships),
        timestamp,
      );
      const state: LibraryState = {
        ...get().state,
        words: prunedWords,
        sets: previous
          ? get().state.sets.map((entry) =>
              entry.id === setId ? librarySet : entry,
            )
          : [...get().state.sets, librarySet],
        memberships: nextMemberships,
        questions: get()
          .state.questions.map((question) => {
            if (question.kind === "reading")
              return {
                ...question,
                questions: question.questions.map((child) => {
                  const remap = remapBySense.get(child.senseId);
                  return remap
                    ? {
                        ...child,
                        wordKey: remap.newWordKey,
                        senseId: remap.newSenseId,
                      }
                    : child;
                }),
                wordKeys: question.wordKeys.map(
                  (wordKey) =>
                    remaps.find((entry) => entry.oldWordKey === wordKey)
                      ?.newWordKey ?? wordKey,
                ),
              };
            const remap = remapBySense.get(question.senseId);
            return remap
              ? {
                  ...question,
                  wordKey: remap.newWordKey,
                  senseId: remap.newSenseId,
                }
              : question;
          })
          .filter((question) => questionUsesWords(question, prunedWords))
          .map(canonicalizeQuestion),
        updatedAt: timestamp,
      };
      await commit(state);
      set({ state });
      return librarySet;
    },
  ),

  deleteSet: serial(async (id) => {
    const timestamp = now();
    const memberships = { ...get().state.memberships };
    delete memberships[id];
    const words = pruneWordsToMemberships(get().state.words, memberships);
    const state = {
      ...get().state,
      sets: get().state.sets.filter((entry) => entry.id !== id),
      memberships,
      words,
      questions: get().state.questions.filter((question) =>
        questionUsesWords(question, words),
      ),
      updatedAt: timestamp,
    };
    await commit(state);
    set({ state });
  }),

  saveQuestion: serial(async (question) => {
    const timestamp = now();
    const normalized = canonicalizeQuestion({
      ...question,
      updatedAt: timestamp,
    });
    if (
      !get().state.sets.some((entry) =>
        questionBelongsToMemberships(
          normalized,
          get().state.memberships[entry.id] ?? [],
        ),
      )
    )
      throw new Error("題目所有來源必須屬於同一個單字集");
    const exists = get().state.questions.some(
      (entry) => entry.id === normalized.id,
    );
    const duplicate = get().state.questions.some(
      (entry) =>
        entry.id !== normalized.id &&
        entry.fingerprint === normalized.fingerprint,
    );
    if (duplicate) return "duplicate";
    const state = {
      ...get().state,
      questions: exists
        ? get().state.questions.map((entry) =>
            entry.id === normalized.id ? normalized : entry,
          )
        : [...get().state.questions, normalized],
      updatedAt: timestamp,
    };
    await commit(state);
    set({ state });
    return "saved";
  }),

  deleteQuestion: serial(async (id) => {
    const state = {
      ...get().state,
      questions: get().state.questions.filter((entry) => entry.id !== id),
      updatedAt: now(),
    };
    await commit(state);
    set({ state });
  }),

  clearQuestions: serial(async (setId) => {
    const current = get().state;
    if (setId && !current.sets.some((entry) => entry.id === setId))
      throw new Error("找不到要清空題目的單字集");
    const state = {
      ...current,
      questions: setId
        ? current.questions.filter(
            (question) =>
              !questionBelongsToMemberships(
                question,
                current.memberships[setId] ?? [],
              ),
          )
        : [],
      updatedAt: now(),
    };
    await commit(state);
    set({ state });
  }),

  importState: serial(async (incoming) => {
    const { state } = mergeLibraryStates(get().state, incoming);
    await commit(state);
    set({ state, status: "ready" });
  }),

  applyRemoteState: serial(async (update) => {
    const state = await update(get().state);
    if (!state) return;
    const stats = await getLibraryRepository().commit(state);
    // These records arrived from the cloud. Pushing them straight back would
    // be a round trip that changes nothing, and a record dropped here because
    // a tombstone arrived must not become a tombstone of this device's own.
    await untrackChanges(stats.changed, stats.removed);
    set({ state, status: "ready" });
  }),

  reloadNamespace: serial(async () => {
    resetLibraryRepositoryCache();
    set({ status: "loading", error: null });
    try {
      const state = await loadCurrentLibrary();
      set({ state, status: "ready" });
    } catch (error) {
      set({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }),
}));
