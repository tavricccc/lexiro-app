import { Alert } from "react-native";

import { t } from "@/core/lib/i18n";
import { useLibraryStore } from "@/core/stores/library-store";
import { toast } from "@/platform/toast";

/** Asks first, then removes one question or reading pack from the bank. */
export function confirmDeleteQuestion(id: string, onDeleted?: () => void) {
  Alert.alert(t("questions.delete"), t("questions.deleteConfirm"), [
    { text: t("common.cancel"), style: "cancel" },
    {
      text: t("questions.delete"),
      style: "destructive",
      onPress: () => {
        void useLibraryStore
          .getState()
          .deleteQuestion(id)
          .then(() => onDeleted?.())
          .catch((reason: unknown) =>
            toast.error(
              reason instanceof Error ? reason.message : String(reason),
            ),
          );
      },
    },
  ]);
}
