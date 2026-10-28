# Handoff: Lexiro iOS app

You are continuing work on the native iOS client of Lexiro. Read this first,
then `README.md` and `AGENTS.md`.

## Goal and ground rules

- iOS-native look: use system controls (NativeTabs, large titles, search bars,
  SwiftUI views from `@expo/ui/swift-ui`, SF Symbols, `PlatformColor` /
  `DynamicColorIOS`). Do not port the web app's layout. The look is the 學測
  answer card in Lexiro green (`src/lib/theme.ts`; tint `#3f7c5a` light /
  `#8ecdab` dark) and the web product's structure: 今天, 我的單字 (library →
  sets → words and questions), 對戰 (rooms), 我的 (account).
- Expo SDK 57. Day-to-day development runs in Expo Go; the phone runs a
  sideloaded .ipa from CI that takes JS updates over the air (see `README.md`
  and `AGENTS.md`). A native module Expo Go lacks needs a new .ipa and can't be
  tried in Expo Go.
- UI text is Traditional Chinese (Taiwan). Talk to the user in 繁體中文.
- User preferences:
  - Ask before commit, push, install or any external action, unless the user
    has already approved that kind of action in the session.
  - Split commits finely: one logical change per commit.
  - Use ASK mode at decision points.
  - Use subagents only when clearly cheaper than doing the work directly.

## Environment

- Develop in WSL Ubuntu at `~/projects/lexiro-app`. Sibling repos:
  `~/projects/lexiro` (client-only Vite + React Router web app, deployed to
  https://lexiro.vercel.app) and `~/projects/lexiro-worker` (Cloudflare
  Workers; the agent Worker is https://lexiro-agent.tavric.workers.dev).
- Remote: github.com/tavricccc/lexiro-app (public), branch `main`. A push to
  `main` publishes an EAS Update and may build a new .ipa.
- Node 24 comes from nvm and only loads in interactive bash. From Windows run
  `wsl.exe -d Ubuntu -- bash -ic '<cmd>'`. The user's login shell is fish, so
  give them commands that work there (for example `bash -ic '…'`).
- On Windows, files can be edited through `\\wsl$\Ubuntu\home\tavric\projects\…`.
- Device testing: run `npx expo start --tunnel` and scan the QR code with
  Expo Go on the user's iPhone.

## Checks

```bash
npx tsc --noEmit
npx expo lint
npx expo export --platform ios   # bundling smoke test
```

This repo has no test runner. The web repo uses `npm run typecheck`,
`npm run lint` (oxlint), `npm test` (vitest, `vitest.next.config.ts`) and
prettier. The worker repo uses its own vitest suite. After pulling any of the
three repos, run `npm ci` there before checks.

## What exists

- `src/app`: expo-router screens.
  - `_layout.tsx`: root Stack; `practice` is a pushed screen, `sets` a modal
    group, `session` a fullScreenModal. It also hosts the sign-in gate and the
    update check.
  - `index.tsx`: redirects `/` to the first tab. `+native-intent.tsx` maps web
    share links (`…/app/shared/<id>`) to `sets/shared/[shareId]`.
  - `(tabs)/_layout.tsx`: NativeTabs 今天 / 我的單字 / 對戰 / 我的
    (`today`, `library`, `rooms`, `account`).
  - `(tabs)/library`: folders and sets (drag to reorder or move, context
    menus), a set's words and questions.
  - `(tabs)/rooms`: join by code, create a room, live room (`[code]`).
  - `practice.tsx` and `session.tsx`: setup, then the question session.
  - `sets/*`: new set, add words, settings, share, word and question detail
    and edit sheets, shared-set preview.
- `src/core`: the web app's platform-free code, mirrored from `../lexiro` by
  `scripts/sync-core.mjs` (types, library, sync, question and practice logic,
  stores). Change the web file first, then mirror the same edit here; the copies
  differ only in import paths and the "Synced from" header. The script's
  `OVERRIDES` (Firebase, App Check, a draft-editor type file) are hand-written
  for React Native.
- `src/platform`: shims for browser APIs the shared code uses (`install.ts`:
  localStorage, events, lifecycle; `kv.ts`: AsyncStorage in place of idb-keyval),
  plus `sign-in.ts`, `config.ts` (public origins), toast and set-share files.
- `src/lib`: `theme.ts`, `speech.ts` (expo-speech, en-US), `last-practiced.ts`,
  `app-updates.ts` (expo-updates: check on foreground, apply after ten minutes
  away; off in development and Expo Go).
- `src/lexiro/library.ts`: view selectors over the shared library state.
- `src/components`: shared UI (`ui/`), library, practice, question and room
  pieces, the sign-in prompt, toast host.

The app syncs both ways with the cloud library through the shared cloud store
(pull by cursor, push of local edits). Sense data follows the web rules: a
sense `description` holds one point per line, rendered with
`DescriptionPoints`; `meaningZh` is only the Chinese meaning.

## Sign-in (web bridge, PKCE)

Expo Go cannot run the native Google SDK, so sign-in goes through the web app:

1. The app creates a PKCE verifier and challenge, then opens
   `https://lexiro.vercel.app/app-auth?challenge=…&redirect=…` with
   `WebBrowser.openAuthSessionAsync`. The redirect uses the `exp:` or
   `lexiroapp:` scheme.
2. The page signs in with Google: a popup first, falling back to a redirect.
   It then posts `{challenge, googleIdToken}` to the worker's
   `POST /app-auth/codes` with the user's Firebase bearer token.
3. The worker stores only the code hash in D1 (`app_auth_codes`, 60-second
   TTL). The page redirects to the app with `?code=`.
4. The app calls `POST /app-auth/token {code, verifier}`. The worker deletes
   the code as it reads it, so each code works once. This route is
   rate-limited per IP. The worker returns the Google ID token.
5. The app calls `signInWithCredential(GoogleAuthProvider.credential(idToken))`.

Web code: `components/agent/native-app-sign-in.tsx` and
`app/app-auth/page.tsx`. Worker code: `src/agent/app-auth.ts` and the routes
in `src/agent/index.ts`.

The iOS auth sheet partitions storage, so the page uses a same-origin Firebase
auth domain: `vercel.json` in the web repo proxies `/__/auth/*` and
`/__/firebase/*` to the Firebase auth domain, and `https://lexiro.vercel.app/__/auth/handler`
must be an Authorized redirect URI of the Web OAuth client in Google Cloud
Console (project `wordmem-497209`), or Google returns `redirect_uri_mismatch`.
`/__/firebase/init.json` returns Firebase's "Site Not Found" page because the
project has no Firebase Hosting; that is expected.

## Next work

Confirm priorities with the user before starting.

## Notes

- App Check is configured but not enforced. Native requests carry no Origin
  header, so CORS does not apply to them, and the app sends no App Check
  header (`src/core/lib/app-check.ts` is an override that returns none).
- The Firebase web config is public and lives in
  `src/core/lib/firebase-config.ts`; the worker and web origins in
  `src/platform/config.ts`.
- A known residual risk of the bridge: a malicious app could register the
  scheme and start the flow itself. PKCE only stops another app from
  redeeming a code it did not start.
