// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { PracticeTask } from "@/core/types";

import { t } from "@/core/lib/i18n";
import {
  questionFormatHint,
  questionFormatLabel,
} from "@/core/lib/question-options";

/**
 * The card tasks read the same way the question formats do, so the setup
 * screen, the session header and the result screen can name any task through
 * one pair of functions without knowing which half it came from.
 */
export function practiceTaskLabel(task: PracticeTask): string {
  if (task === "meaning") return t("practice.taskMeaning");
  if (task === "reverse") return t("practice.taskReverse");
  return questionFormatLabel(task);
}

export function practiceTaskHint(task: PracticeTask): string {
  if (task === "meaning") return t("practice.taskMeaningHint");
  if (task === "reverse") return t("practice.taskReverseHint");
  return questionFormatHint(task);
}
