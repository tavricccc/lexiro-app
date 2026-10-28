# Handoff: Lexiro iOS app

You are continuing a rewrite of the Lexiro frontend as a native-feeling iOS app.
Read this first, then `README.md`.

## Goal and ground rules

- iOS-native look: use system controls (NativeTabs, large titles, search bars,
  SwiftUI `Form`/`Picker`/`Toggle` from `@expo/ui/swift-ui`, SF Symbols,
  `PlatformColor`). Do not port the web app's visual design. Keep only the
  brand color (`#3f7c5a` light / `#8ecdab` dark, see `src/lib/theme.ts`) and
  the product's structure (library → sets → words; practice; account).
- Expo SDK 57. Day-to-day development runs in Expo Go; the phone runs a
  sideloaded .ipa from CI that takes JS updates over the air (see AGENTS.md).
  A native module Expo Go lacks needs a new .ipa and can't be tried in Expo Go.
- UI text is Traditional Chinese (Taiwan). Talk to the user in 繁體中文.
- User preferences:
  - Ask before commit, push, install or any external action, unless the user
    has already approved that kind of action in the session.
  - Split commits finely: one logical change per commit.
  - Use ASK mode at decision points.
  - Use subagents only when clearly cheaper than doing the work directly.

## Environment

- Develop in WSL Ubuntu at `~/projects/lexiro-app`. Sibling repos:
  `~/projects/lexiro` (Next.js web app, deployed to https://lexiro.vercel.app)
  and `~/projects/lexiro-worker` (Cloudflare Workers; the agent Worker is
  https://lexiro-agent.tavric.workers.dev).
- Remote: github.com/tavricccc/lexiro-app (public), branch `main`.
- Node 24 comes from nvm and only loads in interactive bash. From Windows run
  `wsl.exe -d Ubuntu -- bash -ic '<cmd>'`. The user's login shell is fish, so
  give them commands that work there (for example `bash -ic '…'`).
- On Windows, files can be edited through `\\wsl$\Ubuntu\home\tavric\projects\…`.
- Device testing: run `npx expo start --tunnel` and scan the QR code with
  Expo Go on the user's iPhone. Tailscale is an option the user may set up
  later.

## Checks

```bash
npx tsc --noEmit
npx expo lint
npx expo export --platform ios   # bundling smoke test
```

The web repo uses `npm run typecheck`, `npm run lint` (oxlint), `npm test`
and prettier. The worker repo uses its own vitest suite.

## What exists

- `src/app`: expo-router screens.
  - `_layout.tsx`: root Stack; `session` opens as a fullScreenModal.
  - `index.tsx`: redirects `/` to `/library`.
  - `(tabs)/_layout.tsx`: NativeTabs 單字庫 / 練習 / 我的.
  - `library/index.tsx`: folders and sets, with a search bar.
  - `library/[setId].tsx`: the words in a set, with speak buttons and a
    toolbar action to practise.
  - `practice/index.tsx`: SwiftUI Form to choose the set, question types
    (英選中 / 中選英) and question count.
  - `account/index.tsx`: account, sync status, sync now, sign out.
  - `session.tsx`: four-choice quiz with haptics and a result screen. 英選中
    auto-speaks the prompt; 中選英 has no TTS.
- `src/lexiro`: pure logic ported from the web app. `types.ts`; `library.ts`
  merges cloud records into the library and lists study words; `questions.ts`
  builds the 英選中 and 中選英 questions (seeded shuffle, three distractors
  with different meanings).
- `src/lib`:
  - `firebase.ts`: Firebase JS SDK 13 Auth with AsyncStorage persistence.
    tsconfig `paths` maps `firebase/auth` types to the React Native d.ts.
  - `sign-in.ts`: the web-bridge Google sign-in (below).
  - `cloud.ts`: `GET /sync/records?cursor=`, starting from cursor `""`.
  - `store.ts`: zustand app store. Caches the library per uid in
    AsyncStorage.
  - `speech.ts`: expo-speech, en-US.
  - `theme.ts`: brand color.
- `src/components`: inset grouped rows, the sign-in prompt and its hook, and
  the large-title stack options.

The app is read-only so far: it pulls the cloud library but never pushes
changes.

## Sign-in (web bridge, PKCE)

Expo Go cannot run the native Google SDK, so sign-in goes through the web app:

1. The app creates a PKCE verifier and challenge, then opens
   `https://lexiro.vercel.app/app-auth?challenge=…&redirect=…` with
   `WebBrowser.openAuthSessionAsync`. The redirect must use the `exp:` or
   `lexiroapp:` scheme.
2. The page signs in with Google: a popup first, falling back to a redirect.
   It then posts `{challenge, googleIdToken}` to the worker's
   `POST /app-auth/codes` with the user's Firebase bearer token.
3. The worker stores only the code hash in D1 (`app_auth_codes`, 60-second
   TTL). The page redirects to the app with `?code=`.
4. The app calls `POST /app-auth/token {code, verifier}`. The worker deletes
   the code as it reads it (`DELETE … RETURNING`), so each code works once.
   This route is rate-limited to 20 per minute per IP. The worker returns
   the Google ID token.
5. The app calls `signInWithCredential(GoogleAuthProvider.credential(idToken))`.

Web code: `components/agent/native-app-sign-in.tsx` and
`app/app-auth/page.tsx`. Worker code: `src/agent/app-auth.ts` and the routes
in `src/agent/index.ts`.

## Open issue: finish verifying sign-in on the device

- Symptom: after choosing a Google account, the sheet went back to the Lexiro
  sign-in page.
- Cause: the iOS auth sheet partitions storage, so the Firebase redirect
  result stored on `wordmem-497209.firebaseapp.com` was lost.
- Fix, pushed to lexiro in commits 30d4815 and 25ac751:
  - Next rewrites proxy `/__/auth/*` and `/__/firebase/*` to the Firebase
    auth domain.
  - The service worker skips `/__/`.
  - The bridge page uses `getSameOriginAuth()` (`src/lib/firebase.ts`), whose
    authDomain is `lexiro.vercel.app`.
  - A missing redirect result now shows 「登入失敗」 instead of silently
    resetting.
- **User action pending:** add `https://lexiro.vercel.app/__/auth/handler` to
  the Authorized redirect URIs of the Web OAuth client in Google Cloud
  Console (project `wordmem-497209`). Without it Google returns
  `redirect_uri_mismatch`.
- Not yet verified on the device:
  - the whole round trip;
  - whether Firebase accepts the web client's Google ID token in
    `signInWithCredential`.
  If the token is rejected, check the audience / client ID first.
- `/__/firebase/init.json` returns Firebase's "Site Not Found" page because
  the project has no Firebase Hosting. That is expected: the handler falls
  back to its query parameters.

## Next work (confirm priorities with the user)

1. Get sign-in working end to end on the iPhone, then test the cloud pull with
   a real library.
2. 今天 / review: a daily review tab or section like the web app's progress
   view. Port the logic from the web repo; do not invent a scheduler.
3. Saved question types beyond word questions (the web app has generated and
   reading questions). Port them read-only first.
4. Editing with push sync: create and edit sets and words, and write them
   back through the worker's sync endpoints. Study the web app's sync code
   before designing this.
5. Build an .ipa for sideloading through CI (EAS or a GitHub macOS runner)
   once Expo Go limits matter. The release scheme `lexiroapp` and bundle id
   `app.lexiro.ios` are already set in `app.json`.

## Notes

- App Check is configured but not enforced. Native requests carry no Origin
  header, so CORS does not apply to them.
- The Firebase web config is public and lives in `src/lib/config.ts`.
- A known residual risk of the bridge: a malicious app could register the
  scheme and start the flow itself. PKCE only stops another app from
  redeeming a code it did not start.
