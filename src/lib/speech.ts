import * as Speech from "expo-speech";

/** Reads an English word with the system voice, cutting off the last one. */
export function speak(text: string) {
  Speech.stop();
  Speech.speak(text, { language: "en-US" });
}
