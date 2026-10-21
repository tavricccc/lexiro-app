import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

/**
 * The last set practiced is kept on this device only, to decide which set
 * 「今天」offers to continue with.
 */
const KEY = "lexiro:last-practiced-set";

/** Records the set a practice run is about to start with; failures are silent. */
export function rememberPracticedSet(setId: string): void {
  void AsyncStorage.setItem(KEY, setId).catch(() => {});
}

/** The last practiced set on this device, read again whenever the screen focuses. */
export function useLastPracticedSetId(): string | null {
  const [setId, setSetId] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void AsyncStorage.getItem(KEY)
        .then((value) => {
          if (active) setSetId(value || null);
        })
        .catch(() => {
          if (active) setSetId(null);
        });
      return () => {
        active = false;
      };
    }, []),
  );
  return setId;
}
