// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  FullBackupPayload,
  LibraryQuestion,
  LibrarySet,
  LibraryState,
  SetMembership,
  SetSharePayload,
  SharedSet,
  VocabFolder,
  WordEntry,
  WordKey,
} from "@/core/types";
import { FULL_BACKUP_VERSION } from "@/core/constants";
import { normalizeFolderParentId, UNCATEGORIZED_FOLDER_ID } from "./folders";
import { asSenseId, buildSetWordKey, normalizeWordKey } from "./library";
import {
  isolateLibrarySets,
  LIBRARY_STATE_VERSION,
  scopeSetContent,
  type LibraryScopeMigration,
} from "./library-set-migration";
import { keysOf } from "./record";
import { parseLibraryImportValue } from "./library-import";
import {
  questionBelongsToMemberships,
  questionUsesWords,
} from "./question-ownership";
import {
  assertKnownKeys,
  requiredNumber,
  requiredObject,
  requiredText,
} from "./schema";

function normalizeWord(value: unknown, index: number): WordEntry {
  const parsed = parseLibraryImportValue({
    schemaVersion: 1,
    kind: "words",
    words: [value],
  });
  if (!parsed.valid || parsed.data.kind !== "words")
    throw new Error(
      parsed.valid ? `第 ${index + 1} 個單字格式錯誤` : parsed.error,
    );
  return parsed.data.words[0];
}

function normalizeQuestions(value: unknown, field: string): LibraryQuestion[] {
  if (!Array.isArray(value)) throw new Error(`${field} 格式錯誤`);
  const parsed = parseLibraryImportValue(
    {
      schemaVersion: 1,
      kind: "questions",
      questions: value,
    },
    { requireEnglish: false },
  );
  if (!parsed.valid || parsed.data.kind !== "questions")
    throw new Error(parsed.valid ? `${field} 格式錯誤` : parsed.error);
  return parsed.data.questions;
}

function normalizeMemberships(
  value: unknown,
  words: Record<WordKey, WordEntry>,
  field: string,
): SetMembership[] {
  if (!Array.isArray(value) || !value.length)
    throw new Error(`${field} 至少需要一筆 membership`);
  const seen = new Set<string>();
  return value.map((membership, index) => {
    const source = requiredObject(membership, `${field}[${index}]`);
    assertKnownKeys(source, ["wordKey", "senseIds"], `${field}[${index}]`);
    const wordKey = normalizeWordKey(
      requiredText(source.wordKey, `${field}[${index}].wordKey`),
    );
    if (seen.has(wordKey))
      throw new Error(`${field}[${index}] 重複指定 wordKey`);
    seen.add(wordKey);
    const word = words[wordKey];
    if (!word) throw new Error(`${field}[${index}] 指向未知單字`);
    if (
      !Array.isArray(source.senseIds) ||
      !source.senseIds.length ||
      !source.senseIds.every(
        (senseId) => typeof senseId === "string" && senseId.trim(),
      )
    )
      throw new Error(`${field}[${index}].senseIds 至少需要一個有效 senseId`);
    const senseIds = source.senseIds.map((senseId) =>
      asSenseId(String(senseId).trim()),
    );
    if (new Set(senseIds).size !== senseIds.length)
      throw new Error(`${field}[${index}].senseIds 不可重複`);
    if (
      !senseIds.every((senseId) =>
        word.senses.some((sense) => sense.id === senseId),
      )
    )
      throw new Error(`${field}[${index}] 指向未知 senseId`);
    return { wordKey, senseIds };
  });
}

function normalizeQuestionsForWords(
  value: unknown,
  words: Record<WordKey, WordEntry>,
  field: string,
): LibraryQuestion[] {
  const questions = normalizeQuestions(value, field);
  if (!questions.every((question) => questionUsesWords(question, words)))
    throw new Error(`${field} 包含未收錄的 wordKey 或 senseId`);
  return questions;
}

export function normalizeSharedSet(value: unknown, legacy = false): SharedSet {
  const source = requiredObject(value, "單字集");
  assertKnownKeys(
    source,
    [
      "id",
      "setName",
      "folderId",
      "createdAt",
      "updatedAt",
      "words",
      "memberships",
      "questions",
    ],
    "單字集",
  );
  const rawWords = source.words;
  if (!Array.isArray(rawWords) || !rawWords.length)
    throw new Error("單字集至少需要一個單字");
  const words = rawWords.map(normalizeWord);
  const wordsByKey: Record<WordKey, WordEntry> = {};
  for (const word of words) {
    if (wordsByKey[word.wordKey])
      throw new Error(`單字集包含重複 wordKey：${word.wordKey}`);
    wordsByKey[word.wordKey] = word;
  }
  const memberships = normalizeMemberships(
    source.memberships,
    wordsByKey,
    "memberships",
  );
  const membershipKeys = new Set(
    memberships.map((membership) => membership.wordKey),
  );
  if (words.some((word) => !membershipKeys.has(word.wordKey)))
    throw new Error("單字集包含沒有關聯的單字");
  const questions = normalizeQuestionsForWords(
    source.questions,
    wordsByKey,
    "questions",
  );
  if (
    new Set(questions.map((question) => question.id)).size !== questions.length
  )
    throw new Error("單字集 questions 包含重複 id");
  if (
    new Set(questions.map((question) => question.fingerprint)).size !==
    questions.length
  )
    throw new Error("單字集 questions 包含重複 fingerprint");
  if (
    !questions.every((question) =>
      questionBelongsToMemberships(question, memberships),
    )
  )
    throw new Error("單字集 questions 包含沒有 membership 的題目");
  if (typeof source.folderId !== "string" || !source.folderId.trim())
    throw new Error("單字集必須指定資料夾");
  const normalized: SharedSet = {
    id: requiredText(source.id, "id"),
    setName: requiredText(source.setName, "setName"),
    folderId: source.folderId.trim(),
    createdAt: requiredText(source.createdAt, "createdAt"),
    updatedAt: requiredText(source.updatedAt, "updatedAt"),
    words,
    memberships,
    questions,
  };
  if (legacy) {
    const scoped = scopeSetContent(
      normalized.id,
      words,
      memberships,
      questions,
    );
    return {
      ...normalized,
      words: scoped.words,
      memberships: scoped.memberships,
      questions: scoped.questions,
    };
  }
  if (
    words.some(
      (word) => word.wordKey !== buildSetWordKey(normalized.id, word.word),
    )
  )
    throw new Error("單字集內容必須使用本集獨立身份");
  return normalized;
}

export function normalizeSharePayload(value: unknown): SetSharePayload {
  const source = requiredObject(value, "匯入資料");
  assertKnownKeys(
    source,
    ["version", "exportedAt", "appName", "kind", "sets"],
    "匯入資料",
  );
  const version = requiredNumber(source.version, "version");
  if (version !== 1 && version !== 2) throw new Error("不支援此分享檔版本");
  if (source.kind !== "set-share") throw new Error("不是有效的單字集分享檔");
  if (!Array.isArray(source.sets) || !source.sets.length)
    throw new Error("分享檔至少需要一個單字集");
  return {
    version: 2,
    exportedAt: requiredText(source.exportedAt, "exportedAt"),
    appName: requiredText(source.appName, "appName"),
    kind: "set-share",
    sets: source.sets.map((set) => normalizeSharedSet(set, version === 1)),
  };
}

function normalizeFolder(value: unknown, index: number): VocabFolder {
  const source = requiredObject(value, `folders[${index}]`);
  assertKnownKeys(
    source,
    ["id", "name", "parentId", "order", "createdAt", "updatedAt"],
    `folders[${index}]`,
  );
  const rawParentId =
    source.parentId === undefined
      ? undefined
      : requiredText(source.parentId, `folders[${index}].parentId`);
  const parentId = normalizeFolderParentId(rawParentId);
  return {
    id: requiredText(source.id, `folders[${index}].id`),
    name: requiredText(source.name, `folders[${index}].name`),
    // Older local/cloud data could put folders below the uncategorized bucket.
    // Repair that shape while loading so those folders become root folders.
    ...(parentId ? { parentId } : {}),
    order: requiredNumber(source.order, `folders[${index}].order`),
    createdAt: requiredText(source.createdAt, `folders[${index}].createdAt`),
    updatedAt: requiredText(source.updatedAt, `folders[${index}].updatedAt`),
  };
}

function normalizeSet(
  value: unknown,
  index: number,
  folderIds: Set<string>,
): LibrarySet {
  const source = requiredObject(value, `sets[${index}]`);
  assertKnownKeys(
    source,
    ["id", "setName", "folderId", "order", "createdAt", "updatedAt"],
    `sets[${index}]`,
  );
  const folderId = requiredText(source.folderId, `sets[${index}].folderId`);
  if (!folderIds.has(folderId))
    throw new Error(`sets[${index}] 指向未知 folderId`);
  const order = source.order;
  if (
    order !== undefined &&
    (typeof order !== "number" || !Number.isFinite(order))
  )
    throw new Error(`sets[${index}].order 格式錯誤`);
  return {
    id: requiredText(source.id, `sets[${index}].id`),
    setName: requiredText(source.setName, `sets[${index}].setName`),
    folderId,
    ...(order === undefined ? {} : { order }),
    createdAt: requiredText(source.createdAt, `sets[${index}].createdAt`),
    updatedAt: requiredText(source.updatedAt, `sets[${index}].updatedAt`),
  };
}

export function normalizeLibraryStateWithMigration(
  value: unknown,
): LibraryScopeMigration {
  const source = requiredObject(value, "library");
  assertKnownKeys(
    source,
    [
      "version",
      "words",
      "sets",
      "memberships",
      "folders",
      "questions",
      "updatedAt",
    ],
    "library",
  );
  if (source.version !== 1 && source.version !== LIBRARY_STATE_VERSION)
    throw new Error("完整備份的 library version 不受支援");
  const rawWords = requiredObject(source.words, "library.words");
  const words: Record<WordKey, WordEntry> = {};
  for (const [index, [storedWordKey, word]] of Object.entries(
    rawWords,
  ).entries()) {
    const normalized = normalizeWord(word, index);
    if (storedWordKey !== normalized.wordKey)
      throw new Error(
        `library.words.${storedWordKey} 的 key 與 wordKey 不一致`,
      );
    if (words[normalized.wordKey])
      throw new Error(`library.words 包含重複 wordKey：${normalized.wordKey}`);
    words[normalized.wordKey] = normalized;
  }
  if (!Array.isArray(source.folders))
    throw new Error("library.folders 格式錯誤");
  const folders = source.folders.map(normalizeFolder);
  const folderIds = new Set(folders.map((folder) => folder.id));
  if (folderIds.size !== folders.length)
    throw new Error("library.folders 包含重複 id");
  const uncategorized = folders.find(
    (folder) => folder.id === UNCATEGORIZED_FOLDER_ID,
  );
  if (!uncategorized || uncategorized.parentId !== undefined)
    throw new Error("library 必須包含位於根目錄的未分類資料夾");
  for (const folder of folders) {
    if (folder.parentId && !folderIds.has(folder.parentId))
      throw new Error(`folders.${folder.id} 指向未知 parentId`);
    if (
      folders.some(
        (other) =>
          other.id !== folder.id &&
          other.parentId === folder.parentId &&
          other.name.trim().toLocaleLowerCase() ===
            folder.name.trim().toLocaleLowerCase(),
      )
    )
      throw new Error("同一層資料夾名稱不可重複");
  }
  for (const folder of folders) {
    const visited = new Set<string>();
    let current: VocabFolder | undefined = folder;
    while (current?.parentId) {
      if (visited.has(current.id)) throw new Error("資料夾階層不可形成循環");
      visited.add(current.id);
      current = folders.find((candidate) => candidate.id === current?.parentId);
    }
  }
  if (!Array.isArray(source.sets)) throw new Error("library.sets 格式錯誤");
  const sets = source.sets.map((set, index) =>
    normalizeSet(set, index, folderIds),
  );
  if (new Set(sets.map((set) => set.id)).size !== sets.length)
    throw new Error("library.sets 包含重複 id");
  const setNames = new Set<string>();
  for (const set of sets) {
    const normalizedName = set.setName.trim().toLocaleLowerCase();
    if (setNames.has(normalizedName)) throw new Error("單字集名稱不可重複");
    setNames.add(normalizedName);
  }
  const rawMemberships = requiredObject(
    source.memberships,
    "library.memberships",
  );
  const setIds = new Set(sets.map((set) => set.id));
  const memberships: Record<string, SetMembership[]> = {};
  for (const [setId, valueForSet] of Object.entries(rawMemberships)) {
    if (!setIds.has(setId))
      throw new Error(`library.memberships 包含未知 setId ${setId}`);
    memberships[setId] = normalizeMemberships(
      valueForSet,
      words,
      `library.memberships.${setId}`,
    );
  }
  for (const set of sets) {
    if (!memberships[set.id])
      throw new Error(`library.memberships 缺少 setId ${set.id}`);
    if (
      source.version === LIBRARY_STATE_VERSION &&
      memberships[set.id].some(
        (member) =>
          member.wordKey !==
          buildSetWordKey(set.id, words[member.wordKey].word),
      )
    )
      throw new Error(`單字集 ${set.setName} 包含其他單字集的內容`);
  }
  const referencedWordKeys = new Set(
    Object.values(memberships).flatMap((membershipsForSet) =>
      membershipsForSet.map((membership) => membership.wordKey),
    ),
  );
  if (keysOf(words).some((wordKey) => !referencedWordKeys.has(wordKey)))
    throw new Error("library.words 包含沒有 membership 的單字");
  const questions = normalizeQuestionsForWords(
    source.questions,
    words,
    "library.questions",
  );
  if (
    new Set(questions.map((question) => question.id)).size !== questions.length
  )
    throw new Error("library.questions 包含重複 id");
  if (
    new Set(questions.map((question) => question.fingerprint)).size !==
    questions.length
  )
    throw new Error("library.questions 包含重複 fingerprint");
  const state: LibraryState = {
    version: Number(source.version),
    words,
    sets,
    memberships,
    folders,
    questions,
    updatedAt: requiredText(source.updatedAt, "library.updatedAt"),
  };
  if (
    state.version === LIBRARY_STATE_VERSION &&
    questions.some(
      (question) =>
        !sets.some((set) =>
          questionBelongsToMemberships(question, memberships[set.id]),
        ),
    )
  )
    throw new Error("題目所有來源必須屬於同一個單字集");
  return isolateLibrarySets(state);
}

export function normalizeLibraryState(value: unknown): LibraryState {
  return normalizeLibraryStateWithMigration(value).state;
}

export function normalizeFullBackupPayload(value: unknown): FullBackupPayload {
  const source = requiredObject(value, "完整備份");
  assertKnownKeys(
    source,
    [
      "version",
      "exportedAt",
      "appName",
      "kind",
      "library",
      "learning",
      "stats",
    ],
    "完整備份",
  );
  if (source.kind !== "full-backup") throw new Error("不是有效的完整備份檔");
  const version = requiredNumber(source.version, "version");
  if (version !== FULL_BACKUP_VERSION && version !== 5 && version !== 4)
    throw new Error("不支援此完整備份版本");
  // Versions 4 and 5 also carried learning progress and statistics; both were
  // removed from the app, so those parts of an old backup are ignored.
  return {
    version: FULL_BACKUP_VERSION,
    exportedAt: requiredText(source.exportedAt, "exportedAt"),
    appName: requiredText(source.appName, "appName"),
    kind: "full-backup",
    library: normalizeLibraryStateWithMigration(source.library).state,
  };
}
