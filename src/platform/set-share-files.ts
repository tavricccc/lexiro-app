import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { strToU8, zipSync } from "fflate";

import { SET_SHARE_INTERNAL_FILENAME } from "@/core/constants";
import { readSetShare } from "@/core/lib/set-share";
import type { SetSharePayload } from "@/core/types";

/** The web's download name rules, so a file shared from the app looks the same. */
function safeName(name: string): string {
  const forbidden = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);
  const sanitized = [...name]
    .map((character) => (character.charCodeAt(0) < 32 || forbidden.has(character) ? "-" : character))
    .join("")
    .replace(/[. ]+$/gu, "")
    .trim();
  return sanitized || "Lexiro";
}

/** Replaces the web's download: the share sheet offers Files, AirDrop, Messages. */
export async function shareSetShareFile(payload: SetSharePayload): Promise<void> {
  const bytes = zipSync({ [SET_SHARE_INTERNAL_FILENAME]: strToU8(JSON.stringify(payload)) });
  const file = new File(Paths.cache, `${safeName(payload.sets[0]?.setName ?? "Lexiro")}.lexiro.zip`);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/zip",
    UTI: "public.zip-archive",
  });
}

/** Picks a .lexiro.zip from Files; null when the picker was dismissed. */
export async function pickSetShareFile(): Promise<SetSharePayload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/zip", "public.zip-archive"],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]) return null;
  // expo-file-system's File is a Blob with size and arrayBuffer(), all readSetShare reads.
  return readSetShare(new File(result.assets[0].uri) as unknown as globalThis.File);
}
