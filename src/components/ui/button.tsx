import * as Haptics from "expo-haptics";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type ViewStyle,
} from "react-native";

import { colors } from "@/lib/theme";
import { PressableScale } from "./pressable-scale";

/** `ink` and `onField` sit on the orange field and look the same in both modes. */
type Variant = "primary" | "secondary" | "ghost" | "destructive" | "ink" | "onField";

const fills: Record<Variant, { background: ColorValue; text: ColorValue }> = {
  primary: { background: colors.primary, text: colors.primaryForeground },
  secondary: { background: colors.card, text: colors.foreground },
  ghost: { background: colors.secondary, text: colors.foreground },
  destructive: { background: colors.destructiveSoft, text: colors.destructive },
  ink: { background: colors.fieldInk, text: colors.field },
  onField: { background: "rgba(11,15,20,0.12)", text: colors.fieldInk },
};

/** The web app's pill: one flat fill, 50pt tall, no shadow. */
export function Button({
  label,
  icon,
  variant = "primary",
  busy,
  disabled,
  onPress,
  style,
}: {
  label: string;
  icon?: SymbolViewProps["name"];
  variant?: Variant;
  busy?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const fill = fills[variant];
  const inactive = disabled || busy;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={() => {
        if (variant === "primary" || variant === "ink") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={[
        styles.button,
        { backgroundColor: fill.background },
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {busy ? (
          <ActivityIndicator color={fill.text} />
        ) : icon ? (
          <SymbolView name={icon} size={17} weight="semibold" tintColor={fill.text} />
        ) : null}
        <Text style={[styles.label, { color: fill.text }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: 999,
    paddingHorizontal: 22,
    justifyContent: "center",
  },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  label: { fontSize: 17, fontWeight: "600" },
  disabled: { opacity: 0.4 },
});
