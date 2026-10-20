import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, type } from "@/lib/theme";
import { toast, useToasts } from "@/platform/toast";
import { enterUp, swapOut } from "@/components/ui/motion";

const ICONS = {
  success: "checkmark.circle.fill",
  error: "exclamationmark.triangle.fill",
  info: "info.circle.fill",
} as const;

/** Shows the shared code's sonner-style toasts as a pill under the status bar. */
export function ToastHost() {
  const current = useToasts((state) => state.current);
  const insets = useSafeAreaInsets();
  if (!current) return null;
  return (
    <Animated.View
      key={current.id}
      entering={enterUp}
      exiting={swapOut}
      style={[styles.wrap, { top: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      <Pressable onPress={toast.dismiss} style={styles.pill} accessibilityRole="alert">
        <SymbolView
          name={ICONS[current.kind]}
          size={18}
          tintColor={current.kind === "error" ? colors.destructive : colors.brand}
        />
        <Text style={styles.text} numberOfLines={3}>
          {current.text}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.control,
    borderCurve: "continuous",
    backgroundColor: colors.card,
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  },
  text: { ...type.body, color: colors.foreground, flexShrink: 1 },
});
