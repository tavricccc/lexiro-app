// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  LibraryQuestion,
  LibrarySet,
  LibraryState,
  SetMembership,
  VocabFolder,
  WordEntry,
  WordKey,
} from "@/core/types";
import type { LibraryRecordKind, LibraryRecordRef } from "./library-repository";
import { refKey, type SyncTombstone } from "./sync-journal";
import { CLOUD_SCHEMA_VERSION } from "@/core/constants";
import { CloudSyncError } from "./cloud-sync-errors";
import { hashText } from "./hash";
import { repairLibraryState, type LibraryDraft } from "./library-repair";
import { isRecord } from "./schema";
import { isSetWordKey } from "./library";
import { normalizeLibraryState } from "./share";

/**
 * One Library record as the cloud stores it.
 *
 * The unit of synchronization is the record, not the Library. That is the whole
 * point of the shape: a device that renamed one set sends one document, and two
 * devices that touched different words never conflict at all. It is also the
 * only way to state a deletion — `deleted` is a fact the cloud keeps, so the
 * copy on another device cannot quietly reinstate what someone threw away.
 */
export interface CloudRecord {
  type: LibraryRecordKind;
  /** The Library's own id: a word key, set id, folder id or question id. */
  recordKey: string;
  deleted: boolean;
  /** The record's own `updatedAt`, or when it was deleted. Decides conflicts. */
  updatedAt: string;
  payload: Record<string, unknown> | null;
}

const RECORD_TYPES: readonly LibraryRecordKind[] = [
  "folder",
  "set",
  "membership",
  "word",
  "question",
];

/**
 * Hashing the Library's opaque, set-scoped id
 * gives every record a uniform, legal name, and lets the security rules check
 * the shape of an id with one expression.
 */
export function cloudRecordId(ref: LibraryRecordRef): string {
  return `${ref.kind}-${hashText(ref.id)}`;
}

function membershipPayload(members: SetMembership[]): Record<string, unknown> {
  return { members };
}

/** The record a ref names right now, or null when the Library no longer has it. */
export function recordForRef(
  state: LibraryState,
  ref: LibraryRecordRef,
): CloudRecord | null {
  const base = { type: ref.kind, recordKey: ref.id, deleted: false } as const;
  if (ref.kind === "folder") {
    const folder = state.folders.find((entry) => entry.id === ref.id);
    return folder
      ? { ...base, updatedAt: folder.updatedAt, payload: { ...folder } }
      : null;
  }
  if (ref.kind === "set") {
    const entry = state.sets.find((candidate) => candidate.id === ref.id);
    return entry
      ? { ...base, updatedAt: entry.updatedAt, payload: { ...entry } }
      : null;
  }
  if (ref.kind === "word") {
    const word = state.words[ref.id as WordKey];
    return word
      ? { ...base, updatedAt: word.updatedAt, payload: { ...word } }
      : null;
  }
  if (ref.kind === "question") {
    const question = state.questions.find((entry) => entry.id === ref.id);
    return question
      ? { ...base, updatedAt: question.updatedAt, payload: { ...question } }
      : null;
  }
  const members = state.memberships[ref.id];
  if (!members) return null;
  // Memberships have no timestamp of their own; they change when their set is
  // saved, so the set's own `updatedAt` is exactly when they last changed.
  const owner = state.sets.find((entry) => entry.id === ref.id);
  return {
    ...base,
    updatedAt: owner?.updatedAt ?? state.updatedAt,
    payload: membershipPayload(members),
  };
}

export function tombstoneRecord(tombstone: SyncTombstone): CloudRecord {
  return {
    type: tombstone.kind,
    recordKey: tombstone.id,
    deleted: true,
    updatedAt: tombstone.deletedAt,
    payload: null,
  };
}

/** Every record in the Library, for the first push of an account. */
export function allLibraryRefs(state: LibraryState): LibraryRecordRef[] {
  return [
    ...state.folders.map((folder) => ({
      kind: "folder" as const,
      id: folder.id,
    })),
    ...state.sets.map((entry) => ({ kind: "set" as const, id: entry.id })),
    ...Object.keys(state.memberships).map((id) => ({
      kind: "membership" as const,
      id,
    })),
    ...Object.keys(state.words).map((id) => ({ kind: "word" as const, id })),
    ...state.questions.map((entry) => ({
      kind: "question" as const,
      id: entry.id,
    })),
  ];
}

function invalid(detail: string): never {
  throw new CloudSyncError("cloud/data-invalid", `雲端記錄${detail}`);
}

export function validateCloudRecord(
  value: unknown,
  uid: string,
  documentId: string,
): CloudRecord {
  return validateRecord(value, uid, documentId);
}

function validateRecord(
  value: unknown,
  uid: string,
  documentId: string,
): CloudRecord {
  if (!isRecord(value)) invalid("格式錯誤");
  if (value.ownerId !== uid) invalid("不屬於這個帳號");
  if (value.schemaVersion !== CLOUD_SCHEMA_VERSION)
    throw new CloudSyncError(
      "cloud/schema-unsupported",
      `雲端記錄使用不支援的 schema（${String(value.schemaVersion)}）`,
    );
  const type = value.type;
  if (
    typeof type !== "string" ||
    !RECORD_TYPES.includes(type as LibraryRecordKind)
  )
    invalid("的 type 無效");
  const recordKey = value.recordKey;
  if (typeof recordKey !== "string" || !recordKey) invalid("缺少 recordKey");
  const kind = type as LibraryRecordKind;
  if (cloudRecordId({ kind, id: recordKey }) !== documentId)
    invalid("的 id 與 recordKey 不符");
  const updatedAt = value.updatedAt;
  if (typeof updatedAt !== "string" || !updatedAt) invalid("缺少 updatedAt");
  const deleted = value.deleted === true;
  if (deleted)
    return { type: kind, recordKey, deleted, updatedAt, payload: null };
  if (!isRecord(value.payload)) invalid("缺少 payload");
  if (
    kind === "word" &&
    (!isSetWordKey(recordKey) || value.payload.wordKey !== recordKey)
  )
    invalid("的單字 key 必須是相符的集合來源 id");
  return { type: kind, recordKey, deleted, updatedAt, payload: value.payload };
}

/**
 * Folds pulled records into the Library, one record at a time, in the order the
 * server wrote them.
 *
 * Order comes from D1's server-assigned sequence,
 * rather than from the `updatedAt` a device wrote into the document. A phone
 * whose clock reads 2030 would otherwise win every conflict for years, and the
 * device that lost would keep losing with no way to state a newer edit.
 *
 * A record this device has changed but not yet pushed is held back instead:
 * `dirty` names those, the push that follows this merge sends them, and they
 * come home stamped. So the rule is the server's order, with the local edit
 * that has not had its turn yet still waiting for one.
 *
 * The result is repaired rather than validated: two devices can each make a
 * legal change that is illegal together, and a merge that could fail would
 * strand the account with no way back.
 */
export function applyCloudRecords(
  state: LibraryState,
  records: readonly CloudRecord[],
  dirty: ReadonlySet<string> = new Set(),
  now = new Date().toISOString(),
): LibraryState {
  return normalizeLibraryState(
    repairLibraryState(cloudRecordDraft(state, records, dirty, now)),
  );
}

function cloudRecordDraft(
  state: LibraryDraft,
  records: readonly CloudRecord[],
  dirty: ReadonlySet<string>,
  now: string,
) {
  const folders = new Map(state.folders.map((entry) => [entry.id, entry]));
  const sets = new Map(state.sets.map((entry) => [entry.id, entry]));
  const questions = new Map(state.questions.map((entry) => [entry.id, entry]));
  const words: Record<string, WordEntry> = { ...state.words };
  const memberships: Record<string, SetMembership[]> = {
    ...state.memberships,
  };

  const held = (record: CloudRecord) =>
    dirty.has(refKey({ kind: record.type, id: record.recordKey }));

  for (const record of records) {
    const key = record.recordKey;
    if (held(record)) continue;
    if (record.type === "folder") {
      if (record.deleted) folders.delete(key);
      else folders.set(key, record.payload as unknown as VocabFolder);
      continue;
    }
    if (record.type === "set") {
      if (record.deleted) sets.delete(key);
      else sets.set(key, record.payload as unknown as LibrarySet);
      continue;
    }
    if (record.type === "question") {
      if (record.deleted) questions.delete(key);
      else questions.set(key, record.payload as unknown as LibraryQuestion);
      continue;
    }
    if (record.type === "word") {
      if (record.deleted) delete words[key];
      else words[key] = record.payload as unknown as WordEntry;
      continue;
    }
    if (record.deleted) delete memberships[key];
    else {
      const members = record.payload?.members;
      if (Array.isArray(members)) memberships[key] = members as SetMembership[];
    }
  }

  return {
    version: state.version,
    words: words as Record<WordKey, WordEntry>,
    sets: [...sets.values()],
    memberships,
    folders: [...folders.values()],
    questions: [...questions.values()],
    updatedAt: now,
  };
}
