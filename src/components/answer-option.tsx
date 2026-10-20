import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { PressableScale } from "@/components/ui/pressable-scale";
import { VerdictMark } from "@/components/ui/verdict-mark";
import { colors, radius, space } from "@/lib/theme";

/** `chosen` is a pick still waiting for its reveal, as in a live room. */
export type OptionState = "idle" | "chosen" | "right" | "wrong" | "dim";

const FADE = { duration: 190, easing: Easing.out(Easing.quad) };
const LIFT = { duration: 120, easing: Easing.out(Easing.cubic) };
const SETTLE = { duration: 200, easing: Easing.out(Easing.cubic) };
/** One overshoot, then still: a click of confirmation rather than a wobble. */
const POP = { duration: 260, easing: Easing.out(Easing.back(1.6)) };

/**
 * One answer. The reveal is quiet and exact: the chosen row settles, the right
 * answer lifts once, the rest step back, and the tick/cross pops in.
 */
export function AnswerOption({
  label,
  note,
  state,
  disabled,
  onPress,
}: {
  label: string;
  /** A line under the option, such as the blank it already fills. */
  note?: string;
  state: OptionState;
  disabled?: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const fade = useSharedValue(1);
  const mark = useSharedValue(0);

  useEffect(() => {
    fade.set(withTiming(state === "dim" || disabled ? 0.45 : 1, FADE));

    scale.set(
      state === "right"
        ? withSequence(withTiming(1.02, LIFT), withTiming(1, SETTLE))
        : withTiming(1, SETTLE),
    );

    mark.set(
      state === "right" || state === "wrong"
        ? withTiming(1, POP)
        : withTiming(0, { duration: 120 }),
    );
  }, [state, disabled, scale, fade, mark]);

  const motion = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: scale.value }],
  }));

  const markMotion = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, mark.value)),
    transform: [{ scale: 0.55 + 0.45 * mark.value }],
  }));

  const answered = state !== "idle" || Boolean(disabled);
  return (
    <Animated.View style={motion}>
      <PressableScale
        scaleTo={0.97}
        accessibilityRole="button"
        accessibilityState={{
          disabled: answered,
          selected: state === "chosen" || state === "wrong",
        }}
        disabled={answered}
        onPress={onPress}
        style={[
          styles.option,
          state === "chosen" && styles.chosen,
          state === "right" && styles.right,
          state === "wrong" && styles.wrong,
        ]}
      >
        <View style={styles.body}>
          <Text style={styles.text}>{label}</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
        {state === "right" || state === "wrong" ? (
          <Animated.View style={markMotion}>
            <VerdictMark correct={state === "right"} size={24} />
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
  chosen: { backgroundColor: colors.selected },
  right: { backgroundColor: colors.successSoft },
  wrong: { backgroundColor: colors.destructiveSoft },
  body: { flex: 1, gap: 2 },
  text: { fontSize: 17, lineHeight: 24, color: colors.foreground },
  note: { fontSize: 13, lineHeight: 18, color: colors.muted },
});
