// React Native override of the web's firebase module (kept by sync-core).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
// Metro resolves the React Native build at runtime; tsconfig maps the types
// there too, because the package lists its browser types first.
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from "firebase/auth";

import { firebaseEnvironment as config, isFirebaseConfigured } from "./firebase-config";

export { isFirebaseConfigured } from "./firebase-config";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  app ??= getApps().length ? getApp() : initializeApp(config);
  return app;
}

/** One Auth instance whose session survives restarts in AsyncStorage. */
export function getFirebaseAuth(): Auth | null {
  if (auth) return auth;
  const firebase = getFirebaseApp();
  if (!firebase) return null;
  try {
    auth = initializeAuth(firebase, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Fast refresh re-runs this module after Auth already exists.
    auth = getAuth(firebase);
  }
  return auth;
}

/** The web needs a same-origin handler for iOS Safari; the app has one Auth. */
export function getSameOriginAuth(): Auth | null {
  return getFirebaseAuth();
}

/** Persistence is fixed at initialisation on React Native. */
export async function configureFirebaseAuth(): Promise<Auth | null> {
  return getFirebaseAuth();
}
