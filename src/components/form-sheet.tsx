import { router, Stack } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { Alert } from "react-native";

import { Screen } from "@/components/ui/layout";
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
  cancelLabel,
  cancelIcon,
  onSave,
  onCancel,
  busy,
}: {
  title: string;
  saveLabel?: string;
  cancelLabel?: string;
  /** A step back inside a flow: the icon alone, as the native back button. */
  cancelIcon?: ComponentProps<typeof Stack.Toolbar.Button>["icon"];
  onSave?: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <>
      <Stack.Screen options={{ title }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon={cancelIcon}
          onPress={onCancel}
          disabled={busy}
        >
          {cancelLabel ?? t("common.cancel")}
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
  Alert.alert(t("setEditor.unsavedTitle"), undefined, [
    { text: t("draft.leave"), onPress: () => router.back() },
    {
      text: t("setEditor.discard"),
      style: "destructive",
      onPress: () => {
        clear();
        router.back();
      },
    },
    { text: t("common.cancel"), style: "cancel" },
  ]);
}
