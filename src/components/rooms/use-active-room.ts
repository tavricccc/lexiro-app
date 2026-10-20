import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

import { fetchActiveRoom } from "@/core/lib/room-client";
import { useCloudStore } from "@/core/stores/cloud-store";

export type ActiveRoom = { code: string; title: string; phase: string };

/**
 * The room this person is hosting, if it is still live. The server only
 * answers for rooms that have not ended, so a room started on another device
 * shows up here the next time a screen asks — on focus, and when the app comes
 * back to the foreground, as the web does on `visibilitychange`.
 */
export function useActiveRoom() {
  const signedIn = useCloudStore((store) => store.user !== null);
  const [room, setRoom] = useState<ActiveRoom | null>(null);

  const check = useCallback(() => {
    if (!signedIn) {
      setRoom(null);
      return;
    }
    let cancelled = false;
    fetchActiveRoom()
      .then(({ room }) => {
        if (!cancelled) setRoom(room);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  useFocusEffect(check);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, [check]);

  return room;
}
