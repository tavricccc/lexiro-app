import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { EASE_OUT } from "@/components/ui/motion";
import { ParticleBurst } from "@/components/ui/particle-burst";
import { PressableScale } from "@/components/ui/pressable-scale";
import { VerdictMark } from "@/components/ui/verdict-mark";
import { colors, radius, space } from "@/lib/theme";

/** `chosen` is a pick still waiting for its reveal, as in a live room. */
export type OptionState = "idle" | "chosen" | "right" | "wrong" | "dim";

const FADE = { duration: 160, easing: Easing.out(Easing.quad) };
const LIFT = { duration: 90, easing: Easing.out(Easing.quad) };
const SETTLE = { duration: 180, easing: EASE_OUT };
const POP = { duration: 200, easing: EASE_OUT };

/**
 * One answer. The reveal is quick and exact: the chosen row settles, the right
 * answer lifts once, the rest step back, and the tick/cross pops in. A right
 * pick of your own also throws a burst of confetti from its tick.
 */
export function AnswerOption({
  label,
  note,
  state,
  celebrate = false,
  disabled,
  onPress,
}: {
  label: string;
  /** A line under the option, such as the blank it already fills. */
  note?: string;
  state: OptionState;
  /** This was your pick and it is right; plays only when it turns true. */
  celebrate?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const fade = useSharedValue(1);
  const mark = useSharedValue(0);
  const [burst, setBurst] = useState(0);
  // An answer already shown when the option mounts, as when looking back,
  // does not celebrate again.
  const celebrated = useRef(celebrate);

  useEffect(() => {
    if (celebrate && !celebrated.current) setBurst((count) => count + 1);
    celebrated.current = celebrate;
  }, [celebrate]);

  useEffect(() => {
    fade.set(withTiming(state === "dim" || disabled ? 0.45 : 1, FADE));

    scale.set(
      state === "right"
        ? withSequence(withTiming(1.03, LIFT), withTiming(1, SETTLE))
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
    <Animated.View style={[motion, burst > 0 && styles.above]}>
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
          <View>
            <Animated.View style={markMotion}>
              <VerdictMark correct={state === "right"} size={24} />
            </Animated.View>
            <ParticleBurst play={burst} />
          </View>
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
  // The burst flies over the neighbouring options, not under them.
  above: { zIndex: 1 },
  chosen: { backgroundColor: colors.selected },
  right: { backgroundColor: colors.successSoft },
  wrong: { backgroundColor: colors.destructiveSoft },
  body: { flex: 1, gap: 2 },
  text: { fontSize: 17, lineHeight: 24, color: colors.foreground },
  note: { fontSize: 13, lineHeight: 18, color: colors.muted },
});
