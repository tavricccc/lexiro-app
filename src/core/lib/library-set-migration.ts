// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  LibraryQuestion,
  LibrarySet,
  LibraryState,
  SenseId,
  SetMembership,
  WordEntry,
  WordKey,
} from "@/core/types";
import { cloneJson } from "./clone";
import { UNCATEGORIZED_FOLDER_ID } from "./folders";
import { canonicalHash } from "./hash";
import {
  buildSenseId,
  buildSetWordKey,
  canonicalizeQuestion,
  normalizeWordKey,
} from "./library";
import { questionBelongsToMemberships } from "./question-ownership";
import { createUniqueSetName } from "./set-name";
import type { PendingLibraryRefRemap } from "./sync-journal";

export const LIBRARY_STATE_VERSION = 2;

export interface SenseScopeRemap {
  oldSenseId: SenseId;
  newSenseId: SenseId;
  setId: string;
}

export interface LibraryScopeMigration {
  state: LibraryState;
  senseRemaps: SenseScopeRemap[];
  recordRemaps: PendingLibraryRefRemap[];
}

/** Copy material into one set without keeping any mutable content shared. */
export function scopeSetContent(
  setId: string,
  sourceWords: WordEntry[],
  sourceMemberships: SetMembership[],
  sourceQuestions: LibraryQuestion[],
) {
  const sourceByKey = new Map(sourceWords.map((word) => [word.wordKey, word]));
  const wordKeys = new Map<WordKey, WordKey>();
  const senseIds = new Map<SenseId, SenseId>();
  const senseRemaps: SenseScopeRemap[] = [];
  const recordRemaps: PendingLibraryRefRemap[] = [];
  const words: WordEntry[] = [];
  const memberships: SetMembership[] = [];
  for (const membership of sourceMemberships) {
    const source = sourceByKey.get(membership.wordKey);
    if (!source) throw new Error("單字集包含不存在的單字來源");
    const wordKey = buildSetWordKey(setId, source.word);
    wordKeys.set(source.wordKey, wordKey);
    recordRemaps.push({
      source: { kind: "word", id: source.wordKey },
      targets: [{ kind: "word", id: wordKey }],
    });
    const selected = new Set(membership.senseIds);
    const sourceSenses = source.senses.filter((sense) =>
      selected.has(sense.id),
    );
    if (sourceSenses.length !== selected.size)
      throw new Error("單字集包含不存在的詞義來源");
    const senses = sourceSenses.map((sense) => {
      const id = sense.id;
      const newSenseId = buildSenseId(wordKey, sense.pos, sense.meaningZh);
      senseIds.set(id, newSenseId);
      senseRemaps.push({ oldSenseId: id, newSenseId, setId });
      return { ...cloneJson(sense), id: newSenseId };
    });
    words.push({ ...source, wordKey, senses });
    memberships.push({
      wordKey,
      senseIds: membership.senseIds.map((id) => senseIds.get(id)!),
    });
  }
  const sourceOrder = new Map(
    sourceWords.map((word, index) => [
      buildSetWordKey(setId, word.word),
      index,
    ]),
  );
  words.sort(
    (a, b) => sourceOrder.get(a.wordKey)! - sourceOrder.get(b.wordKey)!,
  );

  const mapWord = (key: WordKey) => {
    const target = wordKeys.get(key);
    if (!target) throw new Error("題目來源不在這個單字集中");
    return target;
  };
  const mapSense = (id: SenseId) => {
    const target = senseIds.get(id);
    if (!target) throw new Error("題目詞義不在這個單字集中");
    return target;
  };
  const questions = sourceQuestions.map((source) => {
    const question = cloneJson(source);
    const alreadyScoped = questionBelongsToMemberships(question, memberships);
    const id = alreadyScoped
      ? question.id
      : `question-${canonicalHash({ setId, id: question.id })}`;
    recordRemaps.push({
      source: { kind: "question", id: source.id },
      targets: [{ kind: "question", id }],
    });
    if (question.kind === "multipleChoice")
      return canonicalizeQuestion({
        ...question,
        id,
        wordKey: mapWord(question.wordKey),
        senseId: mapSense(question.senseId),
      });
    return canonicalizeQuestion({
      ...question,
      id,
      wordKeys: [...new Set(question.wordKeys.map(mapWord))],
      questions: question.questions.map((child) => ({
        ...child,
        id: alreadyScoped
          ? child.id
          : `child-${canonicalHash({ setId, id: child.id })}`,
        wordKey: mapWord(child.wordKey),
        senseId: mapSense(child.senseId),
      })),
    });
  });
  return { words, memberships, questions, senseRemaps, recordRemaps };
}

/** Rebind paid pre-migration draft results only against the explicitly chosen set. */
export function rebindSetQuestionDrafts(
  setId: string,
  words: WordEntry[],
  questions: LibraryQuestion[],
) {
  const sources = words.flatMap((word) => {
    const legacyKey = normalizeWordKey(word.word);
    return [
      word,
      {
        ...word,
        wordKey: legacyKey,
        senses: word.senses.map((sense) => ({
          ...sense,
          id: buildSenseId(legacyKey, sense.pos, sense.meaningZh),
        })),
      },
    ];
  });
  const memberships = sources.map((word) => ({
    wordKey: word.wordKey,
    senseIds: word.senses.map((sense) => sense.id),
  }));
  return scopeSetContent(setId, sources, memberships, questions).questions;
}

/** One-way v1 migration; each old visible copy becomes independent material. */
export function isolateLibrarySets(
  legacy: LibraryState,
): LibraryScopeMigration {
  if (legacy.version === LIBRARY_STATE_VERSION)
    return { state: legacy, senseRemaps: [], recordRemaps: [] };
  const sets = [...legacy.sets];
  const memberships = { ...legacy.memberships };
  const sourceQuestions = new Map<string, LibraryQuestion[]>();
  const unassigned: LibraryQuestion[] = [];
  for (const question of legacy.questions) {
    const owners = sets.filter((set) =>
      questionBelongsToMemberships(question, memberships[set.id] ?? []),
    );
    if (!owners.length) unassigned.push(question);
    for (const owner of owners) {
      const entries = sourceQuestions.get(owner.id) ?? [];
      entries.push(question);
      sourceQuestions.set(owner.id, entries);
    }
  }

  // Historical mixed-set passages have no recorded owner. Keep the whole pack
  // and its sources in one explicit migration set rather than losing the text.
  if (unassigned.length) {
    const id = `migrated-questions-${canonicalHash(unassigned.map((question) => question.id).sort())}`;
    const setName = createUniqueSetName(
      "遷移保留題組",
      new Set(sets.map((set) => set.setName.toLocaleLowerCase())),
    );
    const recovered: LibrarySet = {
      id,
      setName,
      folderId: UNCATEGORIZED_FOLDER_ID,
      createdAt: legacy.updatedAt,
      updatedAt: legacy.updatedAt,
    };
    const required = new Map<WordKey, Set<SenseId>>();
    for (const question of unassigned) {
      const refs =
        question.kind === "reading" ? question.questions : [question];
      for (const ref of refs) {
        const ids = required.get(ref.wordKey) ?? new Set<SenseId>();
        ids.add(ref.senseId);
        required.set(ref.wordKey, ids);
      }
      if (question.kind === "reading")
        for (const wordKey of question.wordKeys)
          if (!required.has(wordKey))
            required.set(
              wordKey,
              new Set(legacy.words[wordKey].senses.map((sense) => sense.id)),
            );
    }
    sets.push(recovered);
    memberships[id] = [...required].map(([wordKey, ids]) => ({
      wordKey,
      senseIds: [...ids],
    }));
    sourceQuestions.set(id, unassigned);
  }

  const words: Record<WordKey, WordEntry> = {};
  const nextMemberships: Record<string, SetMembership[]> = {};
  const questions: LibraryQuestion[] = [];
  const senseRemaps: SenseScopeRemap[] = [];
  const recordRemaps = new Map<string, PendingLibraryRefRemap>();
  for (const set of sets) {
    const scoped = scopeSetContent(
      set.id,
      Object.values(legacy.words),
      memberships[set.id],
      sourceQuestions.get(set.id) ?? [],
    );
    for (const word of scoped.words) words[word.wordKey] = word;
    nextMemberships[set.id] = scoped.memberships;
    questions.push(...scoped.questions);
    senseRemaps.push(...scoped.senseRemaps);
    for (const remap of scoped.recordRemaps) {
      const key = `${remap.source.kind}:${remap.source.id}`;
      const entry = recordRemaps.get(key) ?? {
        source: remap.source,
        targets: [],
      };
      entry.targets.push(...remap.targets);
      if (
        !legacy.sets.some((original) => original.id === set.id) &&
        remap.source.kind === "question"
      )
        entry.dirtyDependencies = [
          { kind: "set", id: set.id },
          { kind: "membership", id: set.id },
          ...scoped.words.map((word) => ({
            kind: "word" as const,
            id: word.wordKey,
          })),
        ];
      recordRemaps.set(key, entry);
    }
  }
  return {
    state: {
      ...legacy,
      version: LIBRARY_STATE_VERSION,
      sets,
      words,
      memberships: nextMemberships,
      questions,
    },
    senseRemaps,
    recordRemaps: [...recordRemaps.values()],
  };
}
