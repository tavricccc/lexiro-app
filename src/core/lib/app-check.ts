// React Native override of the web's app-check module (kept by sync-core).
// The web only attaches App Check with a reCAPTCHA site key, which has no
// native counterpart in Expo Go, so requests go out without its header.
export async function appCheckHeaders(): Promise<Record<string, string>> {
  return {};
}
