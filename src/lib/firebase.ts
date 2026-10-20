import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
// Metro resolves the React Native build at runtime; tsconfig maps the types
// there too, because the package lists its browser types first.
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";

import { firebaseConfig } from "./config";

let auth: Auth | null = null;

/** One Auth instance whose session survives restarts in AsyncStorage. */
export function firebaseAuth(): Auth {
  if (auth) return auth;
  if (getApps().length) {
    auth = getAuth(getApp());
    return auth;
  }
  const app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
  return auth;
}
