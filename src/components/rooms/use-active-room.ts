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
 * back to the foreground, as the web does on `visibilitychange`. The client
 * reuses an answer for a minute, so these checks rarely reach the server.
 */
export function useActiveRoom() {
  const uid = useCloudStore((store) => store.user?.uid ?? null);
  const [room, setRoom] = useState<ActiveRoom | null>(null);

  const check = useCallback(() => {
    if (!uid) {
      setRoom(null);
      return;
    }
    let cancelled = false;
    fetchActiveRoom(uid)
      .then(({ room }) => {
        if (!cancelled) setRoom(room);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useFocusEffect(check);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, [check]);

  return room;
}
