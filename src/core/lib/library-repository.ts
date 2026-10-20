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
import { del, delMany, get, keys, set, setMany } from "@/platform/kv";
import { cloneJson } from "./clone";
import {
  createUncategorizedFolder,
  sortFolders,
  UNCATEGORIZED_FOLDER_ID,
} from "./folders";
import { canonicalHash } from "./hash";
import { randomUUID } from "./id";
import { getStorageNamespace } from "./persist";
import { normalizeLibraryState } from "./share";
import {
  LIBRARY_STATE_VERSION,
  type LibraryScopeMigration,
  type SenseScopeRemap,
} from "./library-set-migration";
import type {
  PendingLibraryRefRemap,
  SyncJournal,
  SyncDirtyEntry,
} from "./sync-journal";

/**
 * Content-addressed store for the Library.
 *
 * Every record is written under the hash of its own value, so a record that did
 * not change is already on disk and is never rewritten: a commit costs one
 * write per *changed* record instead of one per record in the Library. A
 * manifest lists the hash of every record in one generation, and the head
 * pointer names the live manifest. Because blobs are immutable, the pointer
 * write is the only step that makes a commit visible — an interrupted commit
 * leaves the previous generation intact rather than a half-written Library.
 *
 * The previous generation is kept so a tab that is mid-read cannot have its
 * blobs deleted underneath it; everything older is collected after each commit,
 * which is what keeps IndexedDB from growing without bound.
 */
export const LIBRARY_REPOSITORY_SCHEMA_VERSION = 3 as const;

export type LibraryRecordKind =
  "folder" | "set" | "membership" | "word" | "question";
type LibraryRecordValue =
  VocabFolder | LibrarySet | SetMembership[] | WordEntry | LibraryQuestion;

/** One record in the Library, named the way both the store and sync name it. */
export interface LibraryRecordRef {
  kind: LibraryRecordKind;
  id: string;
}

const RECORD_KINDS: LibraryRecordKind[] = [
  "folder",
  "set",
  "membership",
  "word",
  "question",
];

interface LibraryRecord {
  kind: LibraryRecordKind;
  id: string;
  value: LibraryRecordValue;
}

/** One generation: every record id in the Library mapped to its content hash. */
interface LibraryManifest {
  schemaVersion: 2 | typeof LIBRARY_REPOSITORY_SCHEMA_VERSION;
  generation: string;
  /**
   * Commit order. Recovery cannot rank generations by `updatedAt`, which is the
   * caller's own timestamp and may repeat, nor by a clock that can move
   * backwards, so each commit numbers itself one past the generation it
   * replaced.
   */
  sequence: number;
  updatedAt: string;
  entries: Record<LibraryRecordKind, Record<string, string>>;
}

interface LibraryHead {
  schemaVersion: 2 | typeof LIBRARY_REPOSITORY_SCHEMA_VERSION;
  generation: string;
  previousGeneration?: string;
  updatedAt: string;
  manifestChecksum: string;
}

export interface LibraryCommitStats {
  /** Records whose content was not already on disk. */
  writtenBlobs: number;
  totalRecords: number;
  collectedKeys: number;
  /**
   * What this commit did to the Library, record by record. The manifest of the
   * previous generation already says the hash of every record, so the diff is
   * free here and saves every caller from working out what it changed. Cloud
   * sync uses it as its list of what to push.
   */
  changed: LibraryRecordRef[];
  removed: LibraryRecordRef[];
}

export interface LibraryScopeMigrationIntent {
  senseRemaps: SenseScopeRemap[];
  recordRemaps: PendingLibraryRefRemap[];
  initialChanged: LibraryRecordRef[];
  legacyPending: SyncDirtyEntry[];
}

function emptyEntries(): LibraryManifest["entries"] {
  return { folder: {}, set: {}, membership: {}, word: {}, question: {} };
}

export function emptyLibraryState(
  now = new Date().toISOString(),
): LibraryState {
  return {
    version: LIBRARY_STATE_VERSION,
    words: {},
    sets: [],
    memberships: {},
    folders: [createUncategorizedFolder()],
    questions: [],
    updatedAt: now,
  };
}

function normalizeState(value: LibraryState): LibraryState {
  const folders = value.folders.some(
    (folder) => folder.id === UNCATEGORIZED_FOLDER_ID,
  )
    ? value.folders
    : [createUncategorizedFolder(), ...value.folders];
  const normalized = normalizeLibraryState({
    ...cloneJson(value),
    folders: cloneJson(sortFolders(folders)),
  });
  return { ...normalized, folders: sortFolders(normalized.folders) };
}

function recordsOf(state: LibraryState): LibraryRecord[] {
  return [
    ...state.folders.map((value) => ({
      kind: "folder" as const,
      id: value.id,
      value,
    })),
    ...state.sets.map((value) => ({
      kind: "set" as const,
      id: value.id,
      value,
    })),
    ...Object.entries(state.memberships).map(([id, value]) => ({
      kind: "membership" as const,
      id,
      value,
    })),
    ...Object.entries(state.words).map(([id, value]) => ({
      kind: "word" as const,
      id,
      value,
    })),
    ...state.questions.map((value) => ({
      kind: "question" as const,
      id: value.id,
      value,
    })),
  ];
}

function diffManifests(
  previous: LibraryManifest | null,
  next: LibraryManifest,
): { changed: LibraryRecordRef[]; removed: LibraryRecordRef[] } {
  const changed: LibraryRecordRef[] = [];
  const removed: LibraryRecordRef[] = [];
  for (const kind of RECORD_KINDS) {
    const before = previous?.entries[kind] ?? {};
    const after = next.entries[kind];
    for (const [id, hash] of Object.entries(after))
      if (before[id] !== hash) changed.push({ kind, id });
    for (const id of Object.keys(before))
      if (!(id in after)) removed.push({ kind, id });
  }
  return { changed, removed };
}

function manifestChecksum(manifest: LibraryManifest): string {
  return canonicalHash(manifest);
}

function isManifest(
  value: unknown,
  generation: string,
): value is LibraryManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<LibraryManifest>;
  return (
    (manifest.schemaVersion === 2 ||
      manifest.schemaVersion === LIBRARY_REPOSITORY_SCHEMA_VERSION) &&
    manifest.generation === generation &&
    typeof manifest.updatedAt === "string" &&
    Boolean(manifest.entries) &&
    RECORD_KINDS.every((kind) => Boolean(manifest.entries?.[kind]))
  );
}

export class LibraryRepository {
  readonly namespace: string;
  private readonly prefix: string;
  private commitQueue: Promise<unknown> = Promise.resolve();
  private manifest: LibraryManifest | null = null;

  constructor(namespace = getStorageNamespace()) {
    this.namespace = namespace.trim() || "guest";
    this.prefix = `${this.namespace}:lexiro-library`;
  }

  private headKey(): string {
    return `${this.prefix}:head`;
  }

  private manifestKey(generation: string): string {
    return `${this.prefix}:manifest:${generation}`;
  }

  private blobKey(hash: string): string {
    return `${this.prefix}:blob:${hash}`;
  }

  async scopeMigrationIntent(): Promise<
    LibraryScopeMigrationIntent | undefined
  > {
    return get<LibraryScopeMigrationIntent>(`${this.prefix}:scope-migration`);
  }

  async beginScopeMigration(
    migration: LibraryScopeMigration,
    journal: SyncJournal,
  ): Promise<LibraryScopeMigrationIntent> {
    const intent = {
      senseRemaps: migration.senseRemaps,
      recordRemaps: migration.recordRemaps,
      initialChanged: journal.seeded
        ? []
        : recordsOf(migration.state).map(({ kind, id }) => ({ kind, id })),
      legacyPending: [
        ...Object.values(journal.dirty),
        ...Object.values(journal.tombstones),
      ]
        .filter((ref) => ref.kind === "word" || ref.kind === "question")
        .map(({ kind, id, version }) => ({ kind, id, version })),
    };
    await set(`${this.prefix}:scope-migration`, intent);
    return intent;
  }

  async completeScopeMigration(): Promise<void> {
    await del(`${this.prefix}:scope-migration`);
  }

  private async readManifest(
    generation: string,
  ): Promise<LibraryManifest | null> {
    const value = await get(this.manifestKey(generation));
    return isManifest(value, generation) ? value : null;
  }

  private async readBlob(hash: string): Promise<LibraryRecordValue> {
    const value = await get<LibraryRecordValue>(this.blobKey(hash));
    if (value === undefined) throw new Error(`Library blob not found: ${hash}`);
    if (canonicalHash(value) !== hash)
      throw new Error(`Library blob checksum mismatch: ${hash}`);
    return value;
  }

  private async assemble(manifest: LibraryManifest): Promise<LibraryState> {
    const folders: VocabFolder[] = [];
    const sets: LibrarySet[] = [];
    const memberships: Record<string, SetMembership[]> = {};
    const words: Record<WordKey, WordEntry> = {};
    const questions: LibraryQuestion[] = [];
    for (const kind of RECORD_KINDS) {
      for (const [id, hash] of Object.entries(manifest.entries[kind])) {
        const value = await this.readBlob(hash);
        if (kind === "folder") folders.push(value as VocabFolder);
        else if (kind === "set") sets.push(value as LibrarySet);
        else if (kind === "membership")
          memberships[id] = value as SetMembership[];
        else if (kind === "word") words[id as WordKey] = value as WordEntry;
        else questions.push(value as LibraryQuestion);
      }
    }
    return {
      version: manifest.schemaVersion === 2 ? 1 : LIBRARY_STATE_VERSION,
      words,
      sets,
      memberships,
      folders: sortFolders(folders),
      questions,
      updatedAt: manifest.updatedAt,
    };
  }

  /**
   * Rebuilds the head from the newest manifest whose blobs all resolve. Only
   * needed when the head is missing or does not match its manifest, which an
   * interrupted commit can leave behind.
   */
  private async recover(): Promise<LibraryManifest | null> {
    const manifestPrefix = `${this.prefix}:manifest:`;
    const candidates: LibraryManifest[] = [];
    for (const key of await keys()) {
      if (typeof key !== "string" || !key.startsWith(manifestPrefix)) continue;
      const manifest = await this.readManifest(
        key.slice(manifestPrefix.length),
      );
      if (manifest) candidates.push(manifest);
    }
    candidates.sort(
      (left, right) =>
        left.sequence - right.sequence ||
        left.generation.localeCompare(right.generation),
    );
    for (const manifest of candidates.toReversed()) {
      try {
        await this.assemble(manifest);
      } catch {
        // A generation whose blobs were collected or damaged is not usable;
        // keep looking for an older one that still resolves completely.
        continue;
      }
      const head: LibraryHead = {
        schemaVersion: manifest.schemaVersion,
        generation: manifest.generation,
        updatedAt: manifest.updatedAt,
        manifestChecksum: manifestChecksum(manifest),
      };
      await set(this.headKey(), head);
      this.manifest = manifest;
      return manifest;
    }
    return null;
  }

  private async loadManifest(): Promise<LibraryManifest | null> {
    if (this.manifest) return this.manifest;
    const head = await get<LibraryHead>(this.headKey());
    if (
      (head?.schemaVersion === 2 ||
        head?.schemaVersion === LIBRARY_REPOSITORY_SCHEMA_VERSION) &&
      head.generation
    ) {
      const manifest = await this.readManifest(head.generation);
      if (manifest && manifestChecksum(manifest) === head.manifestChecksum) {
        this.manifest = manifest;
        return manifest;
      }
    }
    return this.recover();
  }

  /**
   * Loads the complete Library. Every blob is verified against its hash, and a
   * generation that no longer resolves falls back to the previous one rather
   * than handing back a silently altered Library.
   */
  async loadState(): Promise<LibraryState> {
    const manifest = await this.loadManifest();
    if (!manifest) return emptyLibraryState();
    try {
      return await this.assemble(manifest);
    } catch (error) {
      this.manifest = null;
      const recovered = await this.recover();
      if (!recovered || recovered.generation === manifest.generation)
        throw error;
      return this.assemble(recovered);
    }
  }

  /** Commits a complete Library state, writing only the records that changed. */
  async commit(state: LibraryState): Promise<LibraryCommitStats> {
    const run = this.commitQueue
      .catch(() => undefined)
      .then(() => this.commitInternal(state));
    this.commitQueue = run;
    return run;
  }

  private async commitInternal(
    state: LibraryState,
  ): Promise<LibraryCommitStats> {
    const normalized = normalizeState(state);
    const previousManifest = await this.loadManifest();
    const knownHashes = new Set(
      previousManifest
        ? RECORD_KINDS.flatMap((kind) =>
            Object.values(previousManifest.entries[kind]),
          )
        : [],
    );

    const generation = `${Date.now()}-${randomUUID()}`;
    const entries = emptyEntries();
    const pendingBlobs = new Map<string, LibraryRecordValue>();
    for (const record of recordsOf(normalized)) {
      const hash = canonicalHash(record.value);
      entries[record.kind][record.id] = hash;
      if (!knownHashes.has(hash) && !pendingBlobs.has(hash))
        pendingBlobs.set(hash, record.value);
    }

    const manifest: LibraryManifest = {
      schemaVersion: LIBRARY_REPOSITORY_SCHEMA_VERSION,
      generation,
      sequence: (previousManifest?.sequence ?? 0) + 1,
      updatedAt: normalized.updatedAt,
      entries,
    };

    await setMany([
      ...Array.from(
        pendingBlobs,
        ([hash, value]): [string, LibraryRecordValue] => [
          this.blobKey(hash),
          value,
        ],
      ),
      [this.manifestKey(generation), manifest],
    ]);

    // Only this commit's blobs need verifying: a blob key is the hash of its own
    // content, so anything already on disk was verified when it was written.
    for (const hash of pendingBlobs.keys()) await this.readBlob(hash);
    if (!(await this.readManifest(generation)))
      throw new Error("Library manifest verification failed");

    const head: LibraryHead = {
      schemaVersion: LIBRARY_REPOSITORY_SCHEMA_VERSION,
      generation,
      ...(previousManifest
        ? { previousGeneration: previousManifest.generation }
        : {}),
      updatedAt: normalized.updatedAt,
      manifestChecksum: manifestChecksum(manifest),
    };
    await set(this.headKey(), head);
    this.manifest = manifest;

    const collectedKeys = await this.collect(manifest, previousManifest);
    return {
      writtenBlobs: pendingBlobs.size,
      totalRecords: RECORD_KINDS.reduce(
        (total, kind) => total + Object.keys(entries[kind]).length,
        0,
      ),
      collectedKeys,
      ...diffManifests(previousManifest, manifest),
    };
  }

  /** Drops manifests and blobs that neither live generation references. */
  private async collect(
    current: LibraryManifest,
    previous: LibraryManifest | null,
  ): Promise<number> {
    const live = previous ? [current, previous] : [current];
    const liveGenerations = new Set(
      live.map((manifest) => manifest.generation),
    );
    const liveHashes = new Set(
      live.flatMap((manifest) =>
        RECORD_KINDS.flatMap((kind) => Object.values(manifest.entries[kind])),
      ),
    );
    const manifestPrefix = `${this.prefix}:manifest:`;
    const blobPrefix = `${this.prefix}:blob:`;
    const stale: string[] = [];
    for (const key of await keys()) {
      if (typeof key !== "string") continue;
      if (
        key.startsWith(manifestPrefix) &&
        !liveGenerations.has(key.slice(manifestPrefix.length))
      )
        stale.push(key);
      else if (
        key.startsWith(blobPrefix) &&
        !liveHashes.has(key.slice(blobPrefix.length))
      )
        stale.push(key);
    }
    if (stale.length) await delMany(stale);
    return stale.length;
  }

  /** Removes every key this namespace owns. */
  async clear(): Promise<void> {
    const owned = (await keys()).filter(
      (key): key is string =>
        typeof key === "string" && key.startsWith(`${this.prefix}:`),
    );
    if (owned.length) await delMany(owned);
    await del(this.headKey());
    this.manifest = null;
  }
}

const repositoryCache = new Map<string, LibraryRepository>();

export function getLibraryRepository(
  namespace = getStorageNamespace(),
): LibraryRepository {
  const normalized = namespace.trim() || "guest";
  const existing = repositoryCache.get(normalized);
  if (existing) return existing;
  const repository = new LibraryRepository(normalized);
  repositoryCache.set(normalized, repository);
  return repository;
}

export function resetLibraryRepositoryCache(): void {
  repositoryCache.clear();
}
