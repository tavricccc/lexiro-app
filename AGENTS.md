This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Lexiro specifics (learned the hard way)

- Node 24 comes from nvm and loads only in interactive bash: run tools as `bash -ic '<cmd>'`.
- After pulling any of the three repos (`lexiro-app`, `../lexiro`, `../lexiro-worker`), run `npm ci` there before checks. A stale `node_modules` (an old `@lexiro/agent-contract`, the pre-Vite web deps) shows up as failing tests that are not real.
- `src/core` mirrors the web repo (`../lexiro/src/lib`, `src/types`, parts of `lib` and `components/practice`), see `scripts/sync-core.mjs`. Change the web file first, then mirror the same edit here; the copies differ only in import paths and the "Synced from" header. Only run the sync script when the web repo has nothing unrelated you would drag in.
- This repo has no test runner. Checks: `npx tsc --noEmit`, `npx expo lint`, `npx expo export --platform ios` (bundle smoke test).
- Distribution: `.github/workflows/ios-ipa.yml` builds an unsigned .ipa for sideloading; `.github/workflows/eas-update.yml` publishes every push to main as an EAS Update on channel `production` (needs the `EXPO_TOKEN` repo secret). `runtimeVersion` uses the fingerprint policy, so a change to native code or native config only reaches the phone through a new .ipa; JS-only changes arrive over the air. expo-updates is off in development and Expo Go. `src/lib/app-updates.ts` checks on foreground and applies a downloaded update after ten minutes away.
- A sense `description` holds one point per line (`\n`), with no bullets or numbers typed in; screens render it with `DescriptionPoints` (`src/components/library/description-points.tsx`) and `descriptionPoints()` from `@/core/lib/library`. `meaningZh` is only the Chinese meaning, because it is shown as an answer option.
- A set lists its words A to Z with `compareWords()` from `@/core/lib/library` (`setWords` in `src/lexiro/library.ts` already sorts); membership order carries no meaning.
- iPad: phones stay portrait, while the iPad may rotate (`UISupportedInterfaceOrientations~ipad` in `app.json`; changing it is native config, so it ships only in a new .ipa). Pages keep a reading column through `Screen` (`CONTENT_MAX_WIDTH`); a screen that is not a `Screen`, such as the practice session or its docks, constrains itself the same way. `useSplitView()` (a window at least 960pt wide) puts a reading passage beside its question.
- Speech (`src/lib/speech.ts`) runs only from a speak button, never on its own, and uses its own iOS audio session (`useApplicationAudioSession: false`) so it is heard with the ring switch on silent.
