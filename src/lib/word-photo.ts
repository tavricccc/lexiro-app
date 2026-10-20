import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { LIMITS } from "@/core/ai-contract";
import { t } from "@/core/lib/i18n";

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
  name: string;
}

/**
 * The web's encodeWordPhoto on the phone: the longest edge is brought down to
 * the worker's limit and the photo is re-encoded as WebP until it fits. The
 * source photo is never uploaded or kept.
 */
export async function encodeWordPhoto(photo: PickedPhoto): Promise<string> {
  if (!photo.width || !photo.height) throw new Error(t("managed.imageInvalid"));
  const scale = Math.min(
    1,
    LIMITS.imageEdge / Math.max(photo.width, photo.height),
  );
  const context = ImageManipulator.manipulate(photo.uri);
  if (scale < 1)
    context.resize(
      photo.width >= photo.height
        ? { width: Math.round(photo.width * scale) }
        : { height: Math.round(photo.height * scale) },
    );
  const image = await context.renderAsync();
  try {
    for (const compress of [0.85, 0.7, 0.55, 0.4]) {
      const result = await image.saveAsync({
        format: SaveFormat.WEBP,
        compress,
        base64: true,
      });
      const base64 = result.base64 ?? "";
      if (base64 && (base64.length * 3) / 4 <= LIMITS.imageBytes) return base64;
    }
    throw new Error(t("managed.imageTooLarge"));
  } finally {
    image.release();
    context.release();
  }
}
