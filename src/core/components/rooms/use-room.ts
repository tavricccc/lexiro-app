// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { useCallback, useEffect, useRef, useState } from "react";

import {
  requestRoomTicket,
  roomSocketUrl,
  type RoomState,
} from "@/core/lib/room-client";

export type RoomConnection =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  /** This player opened the room on another device, which took the seat. */
  | "replaced";

const PING_MS = 25_000;
const MAX_BACKOFF_MS = 8_000;
/**
 * Each attempt asks the Worker for a ticket. After about 40 seconds of failures
 * the hook stops and waits for the page to come back, regain focus or go
 * online, instead of retrying every 8 seconds for as long as the tab is open.
 */
export const MAX_RECONNECT_ATTEMPTS = 8;

/**
 * Keeps one socket to a room. The server is the source of truth, so a dropped
 * connection only has to come back: every reconnect receives the full current
 * state and the player lands on whatever question the room is on now.
 */
export function useRoom(code: string, name: string, enabled: boolean) {
  const [state, setState] = useState<RoomState | null>(null);
  const [connection, setConnection] = useState<RoomConnection>("connecting");
  const [error, setError] = useState("");
  /** Server clock minus this device's clock, so deadlines read the same everywhere. */
  const [offset, setOffset] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  /** Bumped to sit back down on this device after another one took over. */
  const [claim, setClaim] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let replaced = false;

    const schedule = () => {
      if (disposed || retry) return;
      setConnection("reconnecting");
      if (attempt >= MAX_RECONNECT_ATTEMPTS) return;
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt);
      attempt += 1;
      retry = setTimeout(() => {
        retry = null;
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (disposed || replaced) return;
      const current = socketRef.current;
      if (
        current &&
        (current.readyState === WebSocket.OPEN ||
          current.readyState === WebSocket.CONNECTING)
      )
        return;
      let ticket: string;
      try {
        ({ ticket } = await requestRoomTicket(code, name));
      } catch (reason) {
        if (disposed) return;
        const message =
          reason instanceof Error ? reason.message : String(reason);
        // A room that is gone or full will not come back by retrying.
        if (!navigator.onLine || /連線|network|fetch/i.test(message))
          schedule();
        else {
          setError(message);
          setConnection("closed");
        }
        return;
      }
      if (disposed) return;
      const socket = new WebSocket(roomSocketUrl(code, ticket));
      socketRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
        setConnection("open");
        setError("");
        if (ping) clearInterval(ping);
        ping = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: "ping" }));
        }, PING_MS);
      };
      socket.onmessage = (event) => {
        let message: { type?: string; serverNow?: number };
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (typeof message.serverNow === "number")
          setOffset(message.serverNow - Date.now());
        if (message.type === "state") setState(message as RoomState);
        // Someone else answered: only the player list changed.
        if (message.type === "players")
          setState((current) =>
            current
              ? {
                  ...current,
                  players: (message as Pick<RoomState, "players">).players,
                }
              : current,
          );
      };
      socket.onclose = (event) => {
        if (socketRef.current === socket) socketRef.current = null;
        if (ping) clearInterval(ping);
        if (disposed) return;
        if (event.code === 4409) {
          replaced = true;
          setConnection("replaced");
          return;
        }
        if (event.code === 4404) {
          setConnection("closed");
          return;
        }
        schedule();
      };
    };

    const resume = () => {
      if (document.visibilityState === "hidden" || replaced) return;
      if (retry) {
        clearTimeout(retry);
        retry = null;
      }
      attempt = 0;
      void connect();
    };
    void connect();
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [claim, code, enabled, name]);

  const send = useCallback(
    (
      message:
        | { type: "start" }
        | { type: "end" }
        | { type: "answer"; index: number; choice: number },
    ) => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(message));
      return true;
    },
    [],
  );

  const takeBack = useCallback(() => {
    setConnection("connecting");
    setClaim((value) => value + 1);
  }, []);

  return { state, connection, error, offset, send, takeBack };
}
