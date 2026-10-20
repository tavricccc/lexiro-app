// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
"use client";
import { useEffect, useRef, useState } from "react";

/** Output tokens divided by this batch's elapsed time, refreshed every 100 ms. */
export function useTokenRate(
  tokens: number,
  active: boolean,
  startedAt: number,
) {
  const latest = useRef(tokens);
  latest.current = tokens;
  const [rate, setRate] = useState(0);
  useEffect(() => {
    setRate(0);
    if (!active) return;
    const timer = setInterval(() => {
      const seconds = (Date.now() - startedAt) / 1000;
      setRate(seconds > 0 ? latest.current / seconds : 0);
    }, 100);
    return () => clearInterval(timer);
  }, [active, startedAt]);
  return rate;
}
