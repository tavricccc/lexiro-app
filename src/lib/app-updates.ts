import * as Updates from "expo-updates";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

/** How often a foregrounded app asks for a newer JS bundle. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/**
 * A downloaded update is applied when the app returns after this long away,
 * so the reload reads like a fresh launch and the stores finished flushing
 * when it went to the background.
 */
const APPLY_AFTER_AWAY_MS = 10 * 60 * 1000;

/**
 * expo-updates checks on every cold start (checkAutomatically ON_LOAD), but
 * iOS keeps the app alive for days, so this also checks on returning to the
 * foreground and applies a downloaded update after a long absence.
 */
export function useAppUpdates() {
  // Set by the launch check as well as by the foreground checks below.
  const { isUpdatePending } = Updates.useUpdates();
  const pending = useRef(isUpdatePending);
  useEffect(() => {
    pending.current = isUpdatePending;
  }, [isUpdatePending]);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let lastCheck = Date.now();
    let backgroundedAt: number | null = null;
    let checking = false;

    const fetchNewer = async () => {
      if (checking || pending.current) return;
      checking = true;
      lastCheck = Date.now();
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Offline or the server is unreachable; the next foreground retries.
      } finally {
        checking = false;
      }
    };

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundedAt = Date.now();
        return;
      }
      if (state !== "active") return;
      const away = backgroundedAt === null ? 0 : Date.now() - backgroundedAt;
      backgroundedAt = null;
      if (pending.current && away >= APPLY_AFTER_AWAY_MS) {
        void Updates.reloadAsync();
        return;
      }
      if (Date.now() - lastCheck >= CHECK_INTERVAL_MS) void fetchNewer();
    });
    return () => subscription.remove();
  }, []);
}
