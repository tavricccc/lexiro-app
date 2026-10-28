# Lexiro App

Native iOS client for [Lexiro](https://lexiro.vercel.app), built with Expo SDK 57,
Expo Router native tabs and `@expo/ui` SwiftUI views. It shares the web app's
library, sync, question and practice code and reads and writes the same cloud
library through the Lexiro Agent Worker.

## Develop

```bash
npm ci
npx expo start
```

Scan the QR code with Expo Go on the iPhone. Phone and computer must be on the
same network, or start with `npx expo start --tunnel`. Expo Go has no
expo-updates, so the over-the-air flow below only runs in the sideloaded build.

## Install and update

- Install: the `iOS IPA` workflow (`.github/workflows/ios-ipa.yml`) builds an
  unsigned `.ipa` for sideloading (AltStore, SideStore, Sideloadly re-sign it
  with your Apple ID). It builds only when the iOS native fingerprint changes;
  the artifact is named `ios-<fingerprint12>` and kept for 14 days. Run it by
  hand with `force` to rebuild.
- Update: the `EAS Update` workflow (`.github/workflows/eas-update.yml`)
  publishes every push to `main` to the `production` channel (needs the
  `EXPO_TOKEN` repo secret). `runtimeVersion` uses the fingerprint policy, so a
  native change reaches the phone only through a new `.ipa`.
  `src/lib/app-updates.ts` checks on foreground.

## Sign-in

Google sign-in runs on the web app (`/app-auth`), which hands a one-time code
back to the app. The app redeems it at the worker with its PKCE verifier and
signs in to Firebase with the returned Google ID token
(`src/platform/sign-in.ts`). In Expo Go the redirect uses the `exp://` scheme;
the installed app uses `lexiroapp://`.

## Checks

```bash
npx tsc --noEmit
npx expo lint
npx expo export --platform ios   # bundling smoke test
```

There is no test runner in this repo.

## Layout

- `src/app` — routes: tabs `today`, `library`, `rooms`, `account`; `practice` and
  the `session` modal; `sets/*` sheets (new set, add words, settings, share,
  word and question detail and edit, shared-set preview).
- `src/components` — screens' building blocks (`ui`, `library`, `practice`,
  `questions`, `rooms`) and the sign-in prompt.
- `src/core` — the web app's platform-free code (types, library, sync, questions,
  practice, stores), mirrored by `scripts/sync-core.mjs`. Change the web file
  first, then mirror it; do not hand-edit except the override files the script
  lists. Linting skips this folder.
- `src/platform` — React Native shims for what `src/core` expects from the browser
  (`install.ts`, key-value store, toast, share files, sign-in, public config).
- `src/lib` — app-only code: theme, speech, last-practiced set, update checks.
- `src/lexiro` — small view selectors over the shared library state.
