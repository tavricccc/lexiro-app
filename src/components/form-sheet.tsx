import { router, Stack } from "expo-router";
import type { ReactNode } from "react";

import { Screen } from "@/components/ui/layout";
import { showActionSheet } from "@/components/ui/menu";
import { t } from "@/core/lib/i18n";
import type { DraftPersistence } from "@/core/lib/draft-persistence";

/** A form inside the editing sheet: keyboard-aware, taps reach the fields. */
export function FormScreen({ children }: { children: ReactNode }) {
  return (
    <Screen
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </Screen>
  );
}

/**
 * The sheet's title with 取消 on the left and the save verb on the right, as
 * native toolbar buttons.
 */
export function SheetHeader({
  title,
  saveLabel,
  onSave,
  onCancel,
  busy,
}: {
  title: string;
  saveLabel?: string;
  onSave?: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <>
      <Stack.Screen options={{ title }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={onCancel} disabled={busy}>
          {t("common.cancel")}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      {onSave ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button variant="done" onPress={onSave} disabled={busy}>
            {saveLabel ?? "儲存"}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
    </>
  );
}

/**
 * Leaving a flow with unsaved typing asks first, like the web's 稍後繼續: the
 * draft can stay for next time or be thrown away.
 */
export function leaveFlow(persistence: DraftPersistence, clear: () => void) {
  if (persistence !== "saved") {
    router.back();
    return;
  }
  showActionSheet({
    title: t("setEditor.unsavedTitle"),
    actions: [
      { label: t("draft.leave"), onSelect: () => router.back() },
      {
        label: t("setEditor.discard"),
        destructive: true,
        onSelect: () => {
          clear();
          router.back();
        },
      },
    ],
  });
}
