import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors, latin } from "@/lib/theme";
import { EASE_OUT } from "./motion";
import { VerdictMark } from "./verdict-mark";

export type BubbleState = "empty" | "filled" | "right" | "wrong";

const FILL = { duration: 220, easing: EASE_OUT };

/**
 * The answer-card bubble: an oval printed in green around its letter, filled
 * in as if by pencil when it is chosen. It is the one shape the app repeats.
 */
export function Bubble({
  letter,
  state = "empty",
  size = 30,
}: {
  letter: string;
  state?: BubbleState;
  /** The bubble's height; it is half as wide again. */
  size?: number;
}) {
  const fill = useSharedValue(state === "empty" ? 0 : 1);
  useEffect(() => {
    fill.set(withTiming(state === "empty" ? 0 : 1, FILL));
  }, [state, fill]);

  // The lead spreads out from the middle of the oval.
  const lead = useAnimatedStyle(() => ({
    opacity: fill.value === 0 ? 0 : 1,
    transform: [{ scaleX: 0.3 + 0.7 * fill.value }, { scaleY: 0.5 + 0.5 * fill.value }],
  }));

  const width = Math.round(size * 1.5);
  const tint =
    state === "right"
      ? colors.success
      : state === "wrong"
        ? colors.destructive
        : colors.foreground;
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={[
        styles.oval,
        { width, height: size, borderWidth: Math.max(2, size / 14) },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.lead, { backgroundColor: tint }, lead]} />
      {state === "right" || state === "wrong" ? (
        <VerdictMark correct={state === "right"} size={size * 0.9} disc={false} />
      ) : (
        <Text
          style={[
            styles.letter,
            { fontSize: size * 0.56 },
            state === "filled" && styles.letterFilled,
          ]}
        >
          {letter}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  oval: {
    borderRadius: 999,
    borderColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  lead: { borderRadius: 999 },
  letter: { ...latin.bold, color: colors.brand },
  letterFilled: { color: colors.card },
});
