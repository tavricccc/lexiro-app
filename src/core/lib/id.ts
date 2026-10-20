// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
/**
 * `crypto.randomUUID` is only exposed in secure contexts, so it is missing
 * whenever the app is opened over plain http — a LAN address during
 * development, or a device reaching the dev server by IP. Every id in the app
 * goes through this helper so those pages behave the same as the https ones.
 */
export function randomUUID(): string {
  const webCrypto = globalThis.crypto;

  if (typeof webCrypto?.randomUUID === "function")
    return webCrypto.randomUUID();

  const bytes = new Uint8Array(16);

  if (typeof webCrypto?.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1)
      bytes[index] = Math.floor(Math.random() * 256);
  }

  // Stamp the version (4) and variant (10xx) bits so the value is a well-formed
  // v4 UUID and stays interchangeable with what the native call produces.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
