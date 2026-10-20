import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { create } from "zustand";

import { applyCloudRecords } from "@/lexiro/library";
import { EMPTY_LIBRARY, type LibraryState } from "@/lexiro/types";
import { pullRecords } from "./cloud";
import { firebaseAuth } from "./firebase";

type SyncStatus = "idle" | "syncing" | "error";

interface AppState {
  ready: boolean;
  user: User | null;
  library: LibraryState;
  cursor: string;
  status: SyncStatus;
  syncedAt: number | null;
  start: () => () => void;
  sync: () => Promise<void>;
  signOut: () => Promise<void>;
}

const storageKey = (uid: string) => `lexiro:library:${uid}`;

interface Saved {
  library: LibraryState;
  cursor: string;
  syncedAt: number | null;
}

/**
 * The library is a read-only mirror of the cloud for now: it loads the last
 * copy from disk for an instant first paint, then pulls what changed since.
 */
export const useApp = create<AppState>((set, get) => ({
  ready: false,
  user: null,
  library: EMPTY_LIBRARY,
  cursor: "",
  status: "idle",
  syncedAt: null,

  start: () =>
    onAuthStateChanged(firebaseAuth(), async (user) => {
      if (!user) {
        set({ ready: true, user: null, library: EMPTY_LIBRARY, cursor: "", syncedAt: null });
        return;
      }
      let saved: Saved | null = null;
      try {
        saved = JSON.parse((await AsyncStorage.getItem(storageKey(user.uid))) ?? "null");
      } catch {
        saved = null;
      }
      set({
        ready: true,
        user,
        library: saved?.library ?? EMPTY_LIBRARY,
        cursor: saved?.cursor ?? "",
        syncedAt: saved?.syncedAt ?? null,
      });
      void get().sync();
    }),

  sync: async () => {
    const { user, status } = get();
    if (!user || status === "syncing") return;
    set({ status: "syncing" });
    try {
      const { records, cursor } = await pullRecords(user, get().cursor);
      if (get().user?.uid !== user.uid) return;
      const library = records.length
        ? applyCloudRecords(get().library, records)
        : get().library;
      const syncedAt = Date.now();
      set({ library, cursor, status: "idle", syncedAt });
      await AsyncStorage.setItem(
        storageKey(user.uid),
        JSON.stringify({ library, cursor, syncedAt } satisfies Saved),
      );
    } catch {
      set({ status: "error" });
    }
  },

  signOut: async () => {
    await firebaseSignOut(firebaseAuth());
  },
}));
