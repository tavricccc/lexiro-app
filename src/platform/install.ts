import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { AppState } from "react-native";

import { AGENT_WORKER_URL, AI_WORKER_URL, WEB_ORIGIN } from "./config";

/**
 * The browser globals the shared web code (src/core) still touches, mapped
 * onto React Native. Import this module before anything from src/core and
 * await `hydrateLocalStorage()` before the stores start.
 */

type Listener = (event: Event) => void;

function eventTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, listener: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: Event) {
      for (const listener of [...(listeners.get(event.type) ?? [])]) listener(event);
      return true;
    },
  };
}

const g = globalThis as unknown as Record<string, unknown>;

if (typeof g.Event !== "function")
  g.Event = class Event {
    readonly type: string;
    constructor(type: string) {
      this.type = type;
    }
  };
if (typeof g.CustomEvent !== "function")
  g.CustomEvent = class CustomEvent extends (g.Event as typeof Event) {
    readonly detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      super(type);
      this.detail = init?.detail;
    }
  };

// `window` is the global object on React Native; give it the event methods.
const windowEvents = eventTarget();
for (const [name, method] of Object.entries(windowEvents))
  if (typeof g[name] !== "function") g[name] = method;

g.location ??= {
  origin: WEB_ORIGIN,
  protocol: "https:",
  // React Native's URL has no host getters.
  host: WEB_ORIGIN.replace(/^https:\/\//, ""),
  hostname: WEB_ORIGIN.replace(/^https:\/\//, ""),
  href: `${WEB_ORIGIN}/app`,
  pathname: "/app",
  search: "",
  hash: "",
};

// Foreground/background stand in for the page's visibility and pagehide, so
// the stores flush and sync at the same moments they do on the web.
const doc = { ...eventTarget(), visibilityState: "visible" as DocumentVisibilityState };
g.document ??= doc;
AppState.addEventListener("change", (state) => {
  const visible = state === "active";
  if (visible === (doc.visibilityState === "visible")) return;
  doc.visibilityState = visible ? "visible" : "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  windowEvents.dispatchEvent(new Event(visible ? "online" : "pagehide"));
});

const nav = (g.navigator ??= {}) as Record<string, unknown>;
if (typeof nav.onLine !== "boolean") nav.onLine = true;

const webCrypto = (g.crypto ??= {}) as Record<string, unknown>;
webCrypto.randomUUID ??= () => Crypto.randomUUID();
webCrypto.getRandomValues ??= <T extends ArrayBufferView>(array: T) =>
  Crypto.getRandomValues(array as unknown as Uint8Array) as unknown as T;
const DIGESTS: Record<string, Crypto.CryptoDigestAlgorithm> = {
  "SHA-1": Crypto.CryptoDigestAlgorithm.SHA1,
  "SHA-256": Crypto.CryptoDigestAlgorithm.SHA256,
  "SHA-384": Crypto.CryptoDigestAlgorithm.SHA384,
  "SHA-512": Crypto.CryptoDigestAlgorithm.SHA512,
};
webCrypto.subtle ??= {
  digest(algorithm: string | { name: string }, data: BufferSource) {
    const name = typeof algorithm === "string" ? algorithm : algorithm.name;
    const digest = DIGESTS[name.toUpperCase()];
    if (!digest) return Promise.reject(new Error(`unsupported digest ${name}`));
    return Crypto.digest(digest, data);
  },
};

// Every value the shared code clones is plain JSON data.
if (typeof g.structuredClone !== "function")
  g.structuredClone = (value: unknown) =>
    value === undefined ? undefined : JSON.parse(JSON.stringify(value));

// Hermes lacks the ES2023 copying array methods the shared code uses.
const arrays = Array.prototype as unknown as Record<string, unknown>;
const define = (name: string, value: unknown) =>
  // eslint-disable-next-line no-extend-native -- a polyfill, only when missing
  Object.defineProperty(Array.prototype, name, { value, writable: true, configurable: true });
if (typeof arrays.toSorted !== "function")
  define("toSorted", function (this: unknown[], compare?: (a: unknown, b: unknown) => number) {
    return [...this].sort(compare);
  });
if (typeof arrays.toReversed !== "function")
  define("toReversed", function (this: unknown[]) {
    return [...this].reverse();
  });

// Next.js inlines these at build time; here they are set before first use.
Object.assign(process.env, {
  NEXT_PUBLIC_AGENT_WORKER_URL: AGENT_WORKER_URL,
  NEXT_PUBLIC_AI_WORKER_URL: AI_WORKER_URL,
});

// localStorage: synchronous reads from memory, written through to AsyncStorage.
const LOCAL_PREFIX = "ls:";
const local = new Map<string, string>();
g.localStorage ??= {
  get length() {
    return local.size;
  },
  key: (index: number) => [...local.keys()][index] ?? null,
  getItem: (key: string) => local.get(key) ?? null,
  setItem(key: string, value: string) {
    local.set(key, String(value));
    void AsyncStorage.setItem(LOCAL_PREFIX + key, String(value));
  },
  removeItem(key: string) {
    local.delete(key);
    void AsyncStorage.removeItem(LOCAL_PREFIX + key);
  },
  clear() {
    const keys = [...local.keys()].map((key) => LOCAL_PREFIX + key);
    local.clear();
    void AsyncStorage.multiRemove(keys);
  },
};

let hydration: Promise<void> | null = null;

/** Loads the persisted localStorage copy; the stores read it synchronously. */
export function hydrateLocalStorage(): Promise<void> {
  hydration ??= (async () => {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(LOCAL_PREFIX));
    for (const [key, value] of await AsyncStorage.multiGet(keys))
      if (value !== null && !local.has(key.slice(LOCAL_PREFIX.length)))
        local.set(key.slice(LOCAL_PREFIX.length), value);
  })();
  return hydration;
}
