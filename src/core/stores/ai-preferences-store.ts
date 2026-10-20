// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
"use client";
import { create } from "zustand";
import type { AiModel } from "@/core/ai-contract";
import {
  AI_PREFERENCES_STORAGE_KEY,
  defaultAiPreferences,
  mergeAiPreferences,
  normalizeAiPreferences,
  type AiPreferences,
} from "@/core/lib/ai-preferences";
import { createMutationQueue } from "@/core/lib/mutation-queue";
import { loadFromStorage, saveToStorage } from "@/core/lib/persist";
import { markBlobDirty } from "@/core/lib/sync-journal";

interface AiPreferencesStore {
  preferences: AiPreferences;
  loaded: boolean;
  hydrate: () => Promise<void>;
  reloadNamespace: () => Promise<void>;
  setModel: (model: AiModel) => Promise<void>;
  applyRemote: (preferences: AiPreferences) => Promise<void>;
}

const { serial, flush: flushAiPreferenceMutations } = createMutationQueue();
export { flushAiPreferenceMutations };

export const useAiPreferencesStore = create<AiPreferencesStore>((set, get) => ({
  preferences: defaultAiPreferences(),
  loaded: false,
  hydrate: serial(async () => {
    if (get().loaded) return;
    const stored = await loadFromStorage(AI_PREFERENCES_STORAGE_KEY);
    const preferences = stored.value
      ? normalizeAiPreferences(JSON.parse(stored.value))
      : defaultAiPreferences();
    set({ preferences, loaded: true });
  }),
  reloadNamespace: async () => {
    set({ preferences: defaultAiPreferences(), loaded: false });
    await get().hydrate();
  },
  setModel: serial(async (model) => {
    const preferences: AiPreferences = {
      schemaVersion: 1,
      model,
      updatedAt: new Date().toISOString(),
    };
    await saveToStorage(AI_PREFERENCES_STORAGE_KEY, preferences);
    await markBlobDirty("preferences");
    set({ preferences });
  }),
  applyRemote: serial(async (remote) => {
    const preferences = mergeAiPreferences(get().preferences, remote);
    if (preferences === get().preferences) return;
    await saveToStorage(AI_PREFERENCES_STORAGE_KEY, preferences);
    set({ preferences });
  }),
}));
