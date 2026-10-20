// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
"use client";
import { useRef, useState } from "react";
import { toast } from "@/platform/toast";
import type { LibraryQuestion } from "@/core/types";
import { useLibraryStore } from "@/core/stores/library-store";
import { t } from "@/core/lib/i18n";

export function useSaveGeneratedQuestions(onDone: () => void) {
  const saveQuestion = useLibraryStore((s) => s.saveQuestion);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveDiagnostic, setSaveDiagnostic] = useState("");
  const clearError = () => {
    setSaveError("");
    setSaveDiagnostic("");
  };
  const busy = useRef(false);
  const save = async (questions: LibraryQuestion[]) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    clearError();
    let stored = 0;
    try {
      for (const question of questions)
        if ((await saveQuestion(question)) === "saved") stored++;
      onDone();
      const duplicates = questions.length - stored;
      toast.success(
        duplicates > 0
          ? t("questions.savedCountWithDuplicates", {
              count: stored,
              duplicates,
            })
          : t("questions.savedCount", { count: stored }),
      );
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : t("ai.invalidReply");
      setSaveError(t("questions.saveFailedKept", { count: stored }));
      setSaveDiagnostic(message);
      toast.error(t("questions.saveFailedToast"));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return { saving, save, saveError, saveDiagnostic, clearError };
}
