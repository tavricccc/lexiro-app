import * as Speech from "expo-speech";
import { Platform } from "react-native";

const LANGUAGE = "en-US";

/**
 * iOS hides its good narrators behind Settings › Accessibility › Spoken
 * Content, and also lists novelty voices. Named voices let us use the best
 * English one the device has instead of whatever `language` defaults to.
 */
const NOVELTY =
  /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox)$/i;

let voice: string | undefined;
let loading: Promise<void> | null = null;
let generation = 0;

/** Prefers en-US, then a downloaded premium/enhanced voice, never a joke one. */
function rank(candidate: Speech.Voice) {
  const language = candidate.language.replace("_", "-").toLowerCase();
  if (!language.startsWith("en") || NOVELTY.test(candidate.name)) return -1;

  const id = candidate.identifier.toLowerCase();
  let score = language === "en-us" ? 100 : language === "en-gb" ? 80 : 60;
  if (candidate.quality === Speech.VoiceQuality.Enhanced) score += 20;
  if (id.includes("premium")) score += 40;
  if (id.includes("enhanced")) score += 20;
  if (id.includes("compact")) score -= 20;
  return score;
}

async function findVoice() {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    voice = voices
      .map((candidate) => ({ candidate, score: rank(candidate) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)[0]?.candidate.identifier;
  } catch {
    // Fall back to the system voice for the language.
  }
}

/** Reads English with the native voice, cutting off the last word. */
export function speak(text: string) {
  const request = ++generation;
  void Speech.stop();

  const start = () => {
    if (request !== generation) return;
    Speech.speak(
      text,
      voice ? { voice, language: LANGUAGE } : { language: LANGUAGE },
    );
  };

  // Android and web pick a system voice from the language alone; only iOS
  // exposes the installed premium/enhanced voices we want to name.
  if (Platform.OS !== "ios" || voice) {
    start();
    return;
  }

  loading ??= findVoice().finally(() => {
    loading = null;
  });
  void loading.then(start);
}
