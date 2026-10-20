import { ActionSheetIOS } from "react-native";

export interface SheetAction {
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** The iOS action sheet, with 取消 added as its cancel button. */
export function showActionSheet({
  title,
  message,
  actions,
}: {
  title?: string;
  message?: string;
  actions: SheetAction[];
}) {
  const options = [...actions.map((action) => action.label), "取消"];
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      message,
      options,
      cancelButtonIndex: actions.length,
      destructiveButtonIndex: actions.flatMap((action, index) => (action.destructive ? [index] : [])),
      disabledButtonIndices: actions.flatMap((action, index) => (action.disabled ? [index] : [])),
    },
    (index) => {
      if (index < actions.length) actions[index]!.onSelect();
    },
  );
}
