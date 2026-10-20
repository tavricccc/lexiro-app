import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";

import { AGENT_WORKER_URL, WEB_ORIGIN } from "./config";
import { firebaseAuth } from "./firebase";

function base64url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier(): string {
  const bytes = Crypto.getRandomBytes(32);
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return base64url(btoa(text));
}

export class SignInCancelled extends Error {}

/**
 * Google sign-in through the web app (see lexiro /app-auth): the page signs in
 * and returns a one-time code; only this app holds the PKCE verifier that
 * redeems it, so the redirect itself carries nothing usable.
 */
export async function signInWithGoogle(): Promise<void> {
  const verifier = randomVerifier();
  const challenge = base64url(
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    }),
  );
  const redirect = Linking.createURL("auth");
  const url = `${WEB_ORIGIN}/app-auth?challenge=${encodeURIComponent(
    challenge,
  )}&redirect=${encodeURIComponent(redirect)}`;
  const result = await WebBrowser.openAuthSessionAsync(url, redirect);
  if (result.type !== "success") throw new SignInCancelled();
  const code = Linking.parse(result.url).queryParams?.code;
  if (typeof code !== "string") throw new Error("missing_code");
  const response = await fetch(`${AGENT_WORKER_URL}/app-auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, verifier }),
  });
  if (!response.ok) throw new Error(`token_${response.status}`);
  const { googleIdToken } = (await response.json()) as { googleIdToken: string };
  await signInWithCredential(
    firebaseAuth(),
    GoogleAuthProvider.credential(googleIdToken),
  );
}
