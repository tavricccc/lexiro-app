// React Native override of the web's firebase-config (kept by sync-core).
// Public client configuration; the same values ship in the web app bundle.
export const firebaseEnvironment = {
  apiKey: "AIzaSyDoHftH1q00ZG39QClV5F9zZh0hGPl1sIE",
  authDomain: "wordmem-497209.firebaseapp.com",
  projectId: "wordmem-497209",
  storageBucket: "wordmem-497209.firebasestorage.app",
  messagingSenderId: "220488210743",
  appId: "1:220488210743:web:8f7289aba8997a1121e2b2",
  emulatorEnabled: undefined as string | undefined,
  emulatorHost: undefined as string | undefined,
  // Google sign-in goes through the web app's /app-auth bridge, not a client id here.
  googleClientId: undefined as string | undefined,
  appCheckSiteKey: undefined as string | undefined,
};

export function isFirebaseConfigured(): boolean {
  const config = firebaseEnvironment;
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}
