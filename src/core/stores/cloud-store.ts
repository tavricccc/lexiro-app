// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { SyncStatus } from "@/core/types";
import type { User } from "firebase/auth";
import {
  getCloudClient,
  accountNamespace,
  type CloudClient,
} from "@/core/lib/cloud-client";
import { create } from "zustand";

import {
  CLOUD_BLOB_PENDING_EVENT,
  CLOUD_SYNC_PENDING_EVENT,
} from "@/core/constants";
import { flushLibraryMutations, useLibraryStore } from "@/core/stores/library-store";
import { applyCloudRecords } from "@/core/lib/cloud-records";
import { serializeAccountDataAction } from "@/core/lib/account-data-queue";
import { isRetryableSyncError } from "@/core/lib/cloud-sync-errors";
import { readCloudBlobs, writeCloudBlob } from "@/core/lib/cloud-account";
import {
  applyRemotePracticeDraft,
  localPracticeDraft,
} from "@/core/lib/practice-storage";
import {
  pendingRecords,
  pullRecords,
  pushRecords,
  watchCloudChanges,
} from "@/core/lib/cloud-sync";
import { configureFirebaseAuth } from "@/core/lib/firebase";
import { isFirebaseConfigured } from "@/core/lib/firebase-config";
import {
  getStorageNamespace,
  removeNamespaceData,
  removeRetiredLearningData,
  setStorageNamespace,
} from "@/core/lib/persist";
import {
  clearBlobDirty,
  clearPushedRecords,
  loadSyncJournal,
  markSeeded,
  pendingCountOf,
  resetSyncJournalCache,
  setSyncCursor,
} from "@/core/lib/sync-journal";

/**
 * Cloud sync, from the application's side.
 *
 * Two rules decide the shape of this store, and both come from bugs the
 * previous one had.
 *
 * The account's storage namespace is chosen *before* anything is loaded. It
 * used to be set at the very end of a sync, so every page load read the guest
 * Library, compared it against the signed-in account's cloud copy, concluded
 * the local side had nothing worth keeping, and committed the cloud copy over
 * the top. Anything deleted late in a session came back on the next reload,
 * which is why deleting something could take several attempts.
 *
 * And the local Library is shown immediately, never behind the network. Sync
 * runs underneath it: a pull merges record by record, a push sends what this
 * device changed. Neither one blocks the user from working.
 */

interface CloudStore {
  configured: boolean;
  /** Local data is loaded and the workspace can be shown. Never waits on network. */
  ready: boolean;
  pending: number;
  user: User | null;
  status: SyncStatus;
  error: string;
  initialize: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Erases the account in the cloud, in Firebase and on this device. */
  deleteAccount: () => Promise<void>;
  /**
   * `reconcileAccount` also reads the account's open practice session. Pressing
   * 同步 means "make sure I have everything", so it asks for it; a background
   * run decides for itself whether it is worth a read.
   */
  sync: (options?: { reconcileAccount?: boolean }) => Promise<void>;
}

/**
 * How long a change waits for the next one before it is worth a sync.
 *
 * Six hundred milliseconds was shorter than the pause between two reviews, so a
 * practice session sent a round trip per answer. A ceiling keeps the coalescing
 * honest: continuous typing or reviewing still reaches the cloud, it just does
 * it a few times a minute instead of a few times a second.
 */
const SYNC_DEBOUNCE_MS = 3_000;
const SYNC_MAX_DELAY_MS = 15_000;
/**
 * A practice session marks its snapshot on every answer, yet another device
 * only needs it to resume, and switching devices first hides this one, which
 * sends it straight away. So while the page stays open it goes up only every
 * few minutes, as a backstop for a device that closes without hiding.
 */
const BLOB_SYNC_DEBOUNCE_MS = 5 * 60_000;
const BLOB_SYNC_MAX_DELAY_MS = 10 * 60_000;
/**
 * Whether the cloud's records may have moved since the last pull. A sync with
 * nothing of its own to push skips the pull while this is false; the status
 * poller, going online and switching accounts set it again.
 */
let libraryMayHaveChanged = true;
/** The same for the account documents: whether a write needs a read first. */
let accountMayHaveChanged = true;

/** Forgets what this session learned about the cloud, as a fresh start would. */
export function resetCloudChangeHints(): void {
  libraryMayHaveChanged = accountMayHaveChanged = true;
  accountDocumentsRead = "";
}
/**
 * The account whose progress and statistics documents this session has read.
 *
 * Every sync used to read both, which meant two documents for every notification
 * — and most notifications are somebody else's word edit. Writing progress or
 * statistics does not touch the change marker at all, so a record notification
 * never implied they had moved. They are read when this device has not seen
 * them yet, when it holds an unsent copy that has to be merged before it
 * overwrites the cloud's, and whenever the user asks for a sync by hand.
 */
let accountDocumentsRead = "";
/** How long the workspace waits on auth before opening on local data anyway. */
const AUTH_WAIT_MS = 1_500;
const MAX_RETRY_ATTEMPTS = 3;

let initializationPromise: Promise<void> | null = null;
let running: Promise<void> | null = null;
/** Set when a change lands mid-sync, so the run repeats instead of being dropped. */
let rerun = false;
let rerunReconcile = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
/** The latest moment the waiting changes may be held, set by the oldest. */
let debounceDeadline = 0;
/** The shortest quiet period any waiting change asked for. */
let debounceQuiet = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let unwatch: (() => void) | null = null;

function clearDebounce(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  debounceDeadline = 0;
  debounceQuiet = 0;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function online(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

/** Loads this namespace's local data. The namespace must already be set. */
async function hydrateLocal(): Promise<void> {
  await useLibraryStore.getState().hydrate();
  const libraryError = useLibraryStore.getState().error;
  if (libraryError) throw new Error(libraryError);
  await removeRetiredLearningData();
}

const enterNamespace = serializeAccountDataAction(
  async (namespace: string): Promise<void> => {
    await flushLibraryMutations();
    setStorageNamespace(namespace);
    accountDocumentsRead = "";
    libraryMayHaveChanged = accountMayHaveChanged = true;
    resetSyncJournalCache();
    await useLibraryStore.getState().reloadNamespace();
    const libraryError = useLibraryStore.getState().error;
    if (libraryError) throw new Error(libraryError);
    await removeRetiredLearningData();
  },
);

export const useCloudStore = create<CloudStore>((set, get) => ({
  configured: isFirebaseConfigured(),
  ready: false,
  pending: 0,
  user: null,
  status: isFirebaseConfigured() ? "connecting" : "disabled",
  error: "",

  initialize: async () => {
    if (initializationPromise) return initializationPromise;
    initializationPromise = (async () => {
      const loadFailed = (reason: unknown) =>
        set({
          ready: false,
          status: "error",
          error: reason instanceof Error ? reason.message : String(reason),
        });
      const scheduleSync = (quietMs: number, maxDelayMs: number) => {
        void refreshPending(set);
        if (!get().user) return;
        const now = Date.now();
        debounceDeadline = debounceTimer
          ? Math.min(debounceDeadline, now + maxDelayMs)
          : now + maxDelayMs;
        debounceQuiet = debounceTimer
          ? Math.min(debounceQuiet, quietMs)
          : quietMs;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(
          () => {
            clearDebounce();
            void get().sync();
          },
          Math.max(0, Math.min(debounceQuiet, debounceDeadline - now)),
        );
      };
      // Leaving the page must not leave work sitting in the debounce. The
      // learning store flushes its own IndexedDB write on the same events; this
      // sends what that write has already marked as pending.
      const flushSync = () => {
        if (!debounceTimer || !get().user) return;
        clearDebounce();
        void get().sync();
      };
      if (typeof window !== "undefined") {
        window.addEventListener(CLOUD_SYNC_PENDING_EVENT, () =>
          scheduleSync(SYNC_DEBOUNCE_MS, SYNC_MAX_DELAY_MS),
        );
        window.addEventListener(CLOUD_BLOB_PENDING_EVENT, () =>
          scheduleSync(BLOB_SYNC_DEBOUNCE_MS, BLOB_SYNC_MAX_DELAY_MS),
        );
        window.addEventListener("pagehide", flushSync);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") flushSync();
        });
        window.addEventListener("online", () => {
          libraryMayHaveChanged = accountMayHaveChanged = true;
          if (get().user) void get().sync();
        });
        window.addEventListener("offline", () => {
          if (get().user) set({ status: "offline" });
        });
      }

      if (!get().configured) {
        await hydrateLocal();
        set({ ready: true, status: "disabled" });
        return;
      }

      const runtime = await import("firebase/auth");
      const auth = await configureFirebaseAuth();
      if (!auth) {
        await hydrateLocal();
        set({ ready: true, status: "disabled" });
        return;
      }

      // Auth normally resolves from its own storage in a few milliseconds, but
      // it can also never resolve at all — a blocked request, a dead network.
      // The workspace is not held hostage to that: after a short wait the guest
      // Library opens, and signing in swaps the namespace when it arrives.
      const guestFallback = setTimeout(() => {
        if (get().ready) return;
        void hydrateLocal()
          .then(() => set({ ready: true }))
          .catch(loadFailed);
      }, AUTH_WAIT_MS);

      runtime.onAuthStateChanged(auth, (user) => {
        clearTimeout(guestFallback);
        set({ ready: false, user, error: "" });
        unwatch?.();
        unwatch = null;
        void (async () => {
          // The namespace comes first, always. Everything read before this
          // point would belong to the wrong account.
          await enterNamespace(accountNamespace(user ? user.uid : "guest"));
          await refreshPending(set);
          if (!user) {
            set({ user: null, ready: true, status: "signed-out", error: "" });
            return;
          }
          set({ user, ready: true, status: "syncing", error: "" });
          const db = getCloudClient();
          if (db) {
            const stopLibraryWatch = watchCloudChanges(
              db,
              user.uid,
              (changedBy, accountChanged) => {
                if (!accountChanged || changedBy !== undefined)
                  libraryMayHaveChanged = true;
                if (accountChanged) accountMayHaveChanged = true;
                void get().sync({
                  reconcileAccount:
                    accountChanged || changedBy?.startsWith("agent:"),
                });
              },
            );
            unwatch = stopLibraryWatch;
          }
          await get().sync();
        })().catch(loadFailed);
      });
    })().catch((reason: unknown) => {
      set({
        ready: false,
        status: "error",
        error: reason instanceof Error ? reason.message : String(reason),
      });
    });
    return initializationPromise;
  },

  signIn: async () => {
    const runtime = await import("firebase/auth");
    const auth = await configureFirebaseAuth();
    if (!auth) return;
    // `onAuthStateChanged` does the rest: namespace, reload, watch, sync.
    await (await import("@/platform/sign-in")).signInWithGoogle(auth);
  },

  signOut: async () => {
    const runtime = await import("firebase/auth");
    const auth = await configureFirebaseAuth();
    if (auth) await runtime.signOut(auth);
    clearDebounce();
    unwatch?.();
    unwatch = null;
    await enterNamespace(accountNamespace("guest"));
    set({
      user: null,
      ready: true,
      status: "signed-out",
      pending: 0,
      error: "",
    });
  },

  deleteAccount: async () => {
    const runtime = await import("firebase/auth");
    const auth = await configureFirebaseAuth();
    const uid = auth?.currentUser?.uid;
    if (!auth || !uid) return;
    // The Worker and Firebase both ask for a sign-in from the last few
    // minutes, so this signs in again and takes a token that carries it.
    await (await import("@/platform/sign-in")).signInWithGoogle(auth);
    // Signing in again may pick another Google account; never delete that one.
    const current = auth.currentUser;
    if (!current || current.uid !== uid)
      throw new Error("請用要刪除的那個帳號重新登入。");
    await current.getIdToken(true);
    const { agentJson } = await import("@/core/lib/agent-client");
    await agentJson("/account", { method: "DELETE" });
    clearDebounce();
    unwatch?.();
    unwatch = null;
    await runtime.deleteUser(current);
    // The workspace leaves the namespace before its data goes, as on sign-out.
    await enterNamespace(accountNamespace("guest"));
    set({
      user: null,
      ready: true,
      status: "signed-out",
      pending: 0,
      error: "",
    });
    await removeNamespaceData(accountNamespace(uid));
  },

  sync: async (options) => {
    const reconcileAccount = options?.reconcileAccount ?? false;
    if (running) {
      rerun = true;
      rerunReconcile ||= reconcileAccount;
      return running;
    }
    clearDebounce();
    const run = runSync(set, get, reconcileAccount).finally(() => {
      running = null;
      if (rerun) {
        rerun = false;
        const carried = rerunReconcile;
        rerunReconcile = false;
        void get().sync({ reconcileAccount: carried });
      }
    });
    running = run;
    return run;
  },
}));

type SetState = (partial: Partial<CloudStore>) => void;

const writeSyncForAccount = serializeAccountDataAction(
  async (uid: string, write: () => Promise<void>): Promise<boolean> => {
    if (
      useCloudStore.getState().user?.uid !== uid ||
      !useCloudStore.getState().ready ||
      getStorageNamespace() !== accountNamespace(uid)
    )
      return false;
    await write();
    return true;
  },
);

async function refreshPending(set: SetState): Promise<void> {
  set({ pending: pendingCountOf(await loadSyncJournal()) });
}

/** Reads the account's open practice session, then writes back whichever side this device owes. */
async function reconcileAccountDocuments(
  db: CloudClient,
  uid: string,
  dirtyBlobs: { preferences: number; practice: number },
  reconcileAccount: boolean,
): Promise<void> {
  const clearSent = () =>
    writeSyncForAccount(uid, () =>
      clearBlobDirty([
        { kind: "preferences", version: dirtyBlobs.preferences },
        { kind: "practice", version: dirtyBlobs.practice },
      ]),
    );
  // Nothing suggests the cloud copy moved since this device last read it, so
  // the local session goes straight up. The write is a compare-and-swap on the
  // blob revision: if another device did write, it fails and the read below
  // settles which session wins.
  const localDraft = localPracticeDraft();
  if (
    accountDocumentsRead === uid &&
    !accountMayHaveChanged &&
    !reconcileAccount &&
    dirtyBlobs.practice > 0 &&
    localDraft
  ) {
    try {
      await writeCloudBlob(db, uid, "practice", localDraft);
      await clearSent();
      return;
    } catch (reason) {
      if ((reason as { code?: string }).code !== "aborted") throw reason;
    }
  }
  accountMayHaveChanged = false;
  const blobs = await readCloudBlobs(db, uid);
  if (
    getStorageNamespace() !== accountNamespace(uid) ||
    useCloudStore.getState().user?.uid !== uid ||
    !useCloudStore.getState().ready
  )
    return;
  accountDocumentsRead = uid;
  const work: (() => Promise<unknown>)[] = [];
  if (getStorageNamespace() !== accountNamespace(uid)) return;
  // The newer session wins, whichever device it came from.
  const localPractice = localPracticeDraft();
  if (
    blobs.practice &&
    (!localPractice || blobs.practice.updatedAt > localPractice.updatedAt)
  )
    applyRemotePracticeDraft(blobs.practice);
  else if (localPractice && (dirtyBlobs.practice > 0 || !blobs.practice))
    work.push(() => writeCloudBlob(db, uid, "practice", localPractice));
  for (const write of work) await write();
  if (getStorageNamespace() !== accountNamespace(uid)) return;
  await clearSent();
}

async function runSync(
  set: SetState,
  get: () => CloudStore,
  reconcileAccount: boolean,
): Promise<void> {
  const user = get().user;
  const db = getCloudClient();
  if (
    !user ||
    !db ||
    !get().ready ||
    getStorageNamespace() !== accountNamespace(user.uid)
  )
    return;
  const sameAccount = () =>
    get().ready &&
    get().user?.uid === user.uid &&
    getStorageNamespace() === accountNamespace(user.uid);
  if (!online()) {
    set({ status: "offline" });
    await refreshPending(set);
    return;
  }

  set({ status: "syncing", error: "" });
  try {
    const journal = await loadSyncJournal();
    // Captured before any request goes out: an edit
    // made while a write is in flight must stay queued rather than be cleared
    // along with the older value that actually went up.
    const dirtyBlobs = { ...journal.blobs };

    // Pull first. Merging before pushing means a record this device changed is
    // still marked dirty when the cloud copy arrives, so the local edit is held
    // back from the merge and then pushed, rather than being overwritten by an
    // older copy that merely reached the server first.
    const localRecords =
      Object.keys(journal.dirty).length +
      Object.keys(journal.tombstones).length;
    if (reconcileAccount || libraryMayHaveChanged || localRecords) {
      // Cleared before the request, so a change reported meanwhile stands.
      libraryMayHaveChanged = false;
      const pulled = await pullRecords(db, user.uid, journal.cursor);
      if (!sameAccount()) return;
      if (pulled.records.length) {
        await useLibraryStore.getState().applyRemoteState(async (current) => {
          if (!sameAccount()) return null;
          const latestJournal = await loadSyncJournal();
          return applyCloudRecords(
            current,
            pulled.records,
            new Set([
              ...Object.keys(latestJournal.dirty),
              ...Object.keys(latestJournal.tombstones),
            ]),
          );
        });
      }
      if (!sameAccount()) return;
      if (
        pulled.cursor !== journal.cursor &&
        !(await writeSyncForAccount(user.uid, () =>
          setSyncCursor(pulled.cursor),
        ))
      )
        return;
    }

    if (
      reconcileAccount ||
      accountDocumentsRead !== user.uid ||
      dirtyBlobs.preferences > 0 ||
      dirtyBlobs.practice > 0
    )
      await reconcileAccountDocuments(
        db,
        user.uid,
        dirtyBlobs,
        reconcileAccount,
      );
    if (!sameAccount()) return;

    // Push after the merge, so what goes up is the reconciled value rather than
    // the copy this device happened to be holding.
    const pendingJournal = await loadSyncJournal();
    if (!sameAccount()) return;
    const work = pendingRecords(
      useLibraryStore.getState().state,
      pendingJournal,
    );
    if (work.records.length) await pushRecords(db, user.uid, work.records);
    if (!sameAccount()) return;

    const finished = await writeSyncForAccount(user.uid, async () => {
      await clearPushedRecords(work.clear);
      await markSeeded();
    });
    if (!finished || !sameAccount()) return;

    retryAttempt = 0;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    await refreshPending(set);
    set({ ready: true, status: "synced", error: "" });
  } catch (reason) {
    // A failed run proves nothing about the cloud; the next one checks again.
    libraryMayHaveChanged = accountMayHaveChanged = true;
    if (!sameAccount()) return;
    await refreshPending(set);
    set({
      ready: true,
      status: online() ? "error" : "offline",
      error: errorMessage(reason),
    });
    // Retrying a schema or permission problem just produces the same error on a
    // timer, so only the transient kinds come back on their own. Everything
    // else waits for the user to press 同步.
    if (
      online() &&
      isRetryableSyncError(reason) &&
      retryAttempt < MAX_RETRY_ATTEMPTS
    ) {
      retryAttempt += 1;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(
        () => void useCloudStore.getState().sync(),
        Math.min(20_000, 1_000 * 2 ** retryAttempt),
      );
    }
  }
}
