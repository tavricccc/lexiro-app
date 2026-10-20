import { SymbolView } from "expo-symbols";
import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";

import { PressableScale } from "@/components/ui/pressable-scale";
import { colors, radius, space } from "@/lib/theme";

export type OptionState = "idle" | "right" | "wrong" | "dim";

/** One answer: the right one pops, a wrong pick shakes, the rest step back. */
export function AnswerOption({
  label,
  state,
  onPress,
}: {
  label: string;
  state: OptionState;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const shift = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    if (state === "right")
      scale.set(
        withSequence(
          withSpring(1.035, { damping: 10, stiffness: 400 }),
          withSpring(1, { damping: 12, stiffness: 220 }),
        ),
      );
    if (state === "wrong")
      shift.set(
        withSequence(
          withTiming(-8, { duration: 50 }),
          withTiming(8, { duration: 70 }),
          withTiming(-5, { duration: 60 }),
          withTiming(5, { duration: 60 }),
          withTiming(0, { duration: 50 }),
        ),
      );
    fade.set(withTiming(state === "dim" ? 0.5 : 1, { duration: 220 }));
  }, [state, scale, shift, fade]);

  const motion = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: shift.value }, { scale: scale.value }],
  }));

  const answered = state !== "idle";
  return (
    <Animated.View style={motion}>
      <PressableScale
        scaleTo={0.97}
        accessibilityRole="button"
        accessibilityState={{ disabled: answered, selected: state === "wrong" }}
        disabled={answered}
        onPress={onPress}
        style={[
          styles.option,
          state === "right" && styles.right,
          state === "wrong" && styles.wrong,
        ]}
      >
        <Text style={styles.text}>{label}</Text>
        {state === "right" || state === "wrong" ? (
          <Animated.View entering={ZoomIn.springify().damping(12)}>
            <SymbolView
              name={state === "right" ? "checkmark.circle.fill" : "xmark.circle.fill"}
              size={24}
              tintColor={state === "right" ? colors.success : colors.destructive}
            />
          </Animated.View>
        ) : null}
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    paddingHorizontal: space.row,
    paddingVertical: 14,
    borderRadius: radius.control,
    borderCurve: "continuous",
    backgroundColor: colors.card,
  },
  right: { backgroundColor: colors.successSoft },
  wrong: { backgroundColor: colors.destructiveSoft },
  text: { flex: 1, fontSize: 17, lineHeight: 24, color: colors.foreground },
});
