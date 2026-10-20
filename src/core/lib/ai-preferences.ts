// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { AI_MODELS, DEFAULT_AI_MODEL, type AiModel } from "@/core/ai-contract";
import { isRecord } from "./schema";

export interface AiPreferences {
  schemaVersion: 1;
  model: AiModel;
  updatedAt: string;
}

export { AI_PREFERENCES_STORAGE_KEY } from "@/core/constants";
export const defaultAiPreferences = (): AiPreferences => ({
  schemaVersion: 1,
  model: DEFAULT_AI_MODEL,
  updatedAt: "",
});

export function normalizeAiPreferences(value: unknown): AiPreferences {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !AI_MODELS.includes(value.model as AiModel) ||
    typeof value.updatedAt !== "string"
  ) {
    throw new Error("AI 模型設定格式錯誤");
  }
  return {
    schemaVersion: 1,
    model: value.model as AiModel,
    updatedAt: value.updatedAt,
  };
}

export function mergeAiPreferences(
  local: AiPreferences,
  remote: AiPreferences | null,
): AiPreferences {
  return remote && remote.updatedAt > local.updatedAt ? remote : local;
}
