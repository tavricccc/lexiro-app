#!/usr/bin/env node
/**
 * Copies the web app's platform-free domain code into src/core so the app
 * and the web keep one implementation of the library, sync, questions,
 * and practice logic.
 *
 *   node scripts/sync-core.mjs [path/to/lexiro]   (default ../lexiro)
 *
 * Imports are rewritten from the web's aliases to "@/core/...". Files listed
 * in OVERRIDES are hand-written for React Native and never overwritten; the
 * browser APIs the rest still touch are shimmed by src/platform/install.ts.
 * Re-run after pulling the web repo, then run tsc and review the diff.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = process.argv[2] ?? join(app, "..", "lexiro");
const core = join(app, "src", "core");

/** [web source dir, core target dir, files or dirs to leave out] */
const SOURCES = [
  ["src/lib", "lib", ["firebase.ts", "firebase-config.ts", "app-check.ts", "service-worker-cache.ts"]],
  ["src/types", "types", []],
  ["src/constants", "constants", []],
  [
    "lib",
    "lib",
    [
      "app-navigation.ts",
      "app-update.ts",
      "browse-routes.ts",
      "cn.ts",
      "navigation-memory.ts",
      "pwa-install.ts",
      "routes.ts",
      "speech.ts",
      "use-app-router.ts",
    ],
  ],
  ["stores", "stores", ["app-update-store.ts", "ui-store.ts"]],
  [
    "components",
    "components",
    ["ui", "use-practice-keyboard.ts"],
  ],
  ["packages/ai-contract/src", "ai-contract", []],
  ["src/generated", "generated", []],
];

/** Hand-written React Native versions inside src/core; the copy never touches them. */
const OVERRIDES = new Set([
  "lib/firebase.ts",
  "lib/firebase-config.ts",
  "lib/app-check.ts",
  // Only the draft types of the web's .tsx editor, which reading-form imports.
  "components/questions/reading-child-editor.ts",
]);

const REWRITES = [
  [/(["'])@\/types\1/g, "$1@/core/types$1"],
  [/(["'])@\/constants(\/[^"']*)?\1/g, "$1@/core/constants$2$1"],
  [/(["'])@\/generated\//g, "$1@/core/generated/"],
  [/(["'])@\/src\/lib\//g, "$1@/core/lib/"],
  [/(["'])@\/src\/types\//g, "$1@/core/types/"],
  [/(["'])@\/src\/constants\//g, "$1@/core/constants/"],
  [/(["'])@\/lib\//g, "$1@/core/lib/"],
  [/(["'])@\/stores\//g, "$1@/core/stores/"],
  [/(["'])@\/components\//g, "$1@/core/components/"],
  [/(["'])@lexiro\/ai-contract\1/g, "$1@/core/ai-contract$1"],
  [/(["'])idb-keyval\1/g, "$1@/platform/kv$1"],
  [/(["'])sonner\1/g, "$1@/platform/toast$1"],
];

/**
 * Exact edits for the few lines that cannot run on React Native. Each must
 * match once, so a web change that moves them stops the sync instead of
 * silently shipping the browser call.
 */
const PATCHES = {
  "stores/cloud-store.ts": [
    [
      "await runtime.signInWithPopup(auth, new runtime.GoogleAuthProvider());",
      'await (await import("@/platform/sign-in")).signInWithGoogle(auth);',
    ],
    // Signing in again stands in for reauthentication; the store checks the uid.
    [
      "await runtime.reauthenticateWithPopup(\n      auth.currentUser!,\n      new runtime.GoogleAuthProvider(),\n    );",
      'await (await import("@/platform/sign-in")).signInWithGoogle(auth);',
    ],
  ],
  // React Native's URL has no protocol setter or searchParams.set.
  "lib/room-client.ts": [
    [
      'url.protocol = url.protocol === "http:" ? "ws:" : "wss:";\n  url.searchParams.set("ticket", ticket);\n  return url.toString();',
      'return `${url.toString().replace(/^http/u, "ws")}?ticket=${encodeURIComponent(ticket)}`;',
    ],
  ],
};

const HEADER = "// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.\n";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const written = new Set();
for (const [from, to, skip] of SOURCES) {
  const root = join(web, from);
  for (const file of walk(root)) {
    const rel = relative(root, file);
    if (!/\.ts$/.test(rel) || /\.test\.ts$|\.d\.ts$/.test(rel)) continue;
    if (rel.split("/").some((part) => skip.includes(part))) continue;
    const target = join(to, rel);
    if (OVERRIDES.has(target)) continue;
    let source = readFileSync(file, "utf8");
    for (const [pattern, replacement] of REWRITES) source = source.replace(pattern, replacement);
    for (const [from, to] of PATCHES[target] ?? []) {
      if (source.split(from).length !== 2) throw new Error(`patch for ${target} no longer matches: ${from}`);
      source = source.replace(from, () => to);
    }
    const out = join(core, target);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, HEADER + source);
    written.add(target);
  }
}

// Drop synced files that disappeared from the web repo.
if (existsSync(core))
  for (const file of walk(core)) {
    const rel = relative(core, file);
    if (!written.has(rel) && !OVERRIDES.has(rel) && readFileSync(file, "utf8").startsWith(HEADER))
      rmSync(file);
  }

console.log(`synced ${written.size} files into src/core (${OVERRIDES.size} overrides kept)`);
