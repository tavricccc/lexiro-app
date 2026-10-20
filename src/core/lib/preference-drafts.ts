// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { z } from "zod";
import { AI_MODELS } from "@/core/ai-contract";

const model = z.object({ model: z.enum(AI_MODELS) }).strict();
export type ModelPatch = z.infer<typeof model>;

export function parseModelPatch(value: unknown): ModelPatch | null {
  const result = model.safeParse(value);
  return result.success ? result.data : null;
}
