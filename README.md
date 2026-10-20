# Lexiro App

Native iOS client for [Lexiro](https://lexiro.vercel.app), built with Expo SDK 57,
Expo Router native tabs and `@expo/ui` SwiftUI views. It reads the same cloud
library as the web app through the Lexiro Agent Worker.

## Develop

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go on the iPhone. Phone and computer must be on the
same network, or start with `npx expo start --tunnel`.

## Sign-in

Google sign-in runs on the web app (`/app-auth`), which hands a one-time code
back to the app. The app redeems it at the worker with its PKCE verifier and
signs in to Firebase with the returned Google ID token. In Expo Go the redirect
uses the `exp://` scheme; release builds use `lexiroapp://`.

## Checks

```bash
npx tsc --noEmit
npx expo lint
```

## Layout

- `src/app` — routes: `(tabs)/library`, `(tabs)/practice`, `(tabs)/account`, and the `session` modal.
- `src/lexiro` — library types, record merging and 英選中 / 中選英 question building, ported from the web app.
- `src/lib` — Firebase, sign-in, cloud pull, app store, speech and theme.
- `src/components` — inset grouped list rows and the sign-in prompt.
