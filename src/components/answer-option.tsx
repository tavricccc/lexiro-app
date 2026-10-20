import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { Bubble, type BubbleState } from "@/components/ui/bubble";
import { EASE_OUT } from "@/components/ui/motion";
import { ParticleBurst } from "@/components/ui/particle-burst";
import { PressableScale } from "@/components/ui/pressable-scale";
import { colors, radius, space } from "@/lib/theme";

/** `chosen` is a pick still waiting for its reveal, as in a live room. */
export type OptionState = "idle" | "chosen" | "right" | "wrong" | "dim";

const FADE = { duration: 160, easing: Easing.out(Easing.quad) };
const LIFT = { duration: 90, easing: Easing.out(Easing.quad) };
const SETTLE = { duration: 180, easing: EASE_OUT };

const BUBBLE: Record<OptionState, BubbleState> = {
  idle: "empty",
  chosen: "filled",
  right: "right",
  wrong: "wrong",
  dim: "empty",
};

/**
 * One answer, a line on the answer card: its bubble fills in when picked, and
 * the reveal turns the bubble into the verdict. A right pick of your own also
 * throws a burst of confetti from its bubble.
 */
export function AnswerOption({
  letter,
  label,
  note,
  state,
  celebrate = false,
  disabled,
  onPress,
}: {
  letter: string;
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
  }, [state, disabled, scale, fade]);

  const motion = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: scale.value }],
  }));

  const answered = state !== "idle" || Boolean(disabled);
  return (
    <Animated.View style={[motion, burst > 0 && styles.above]}>
      <PressableScale
        scaleTo={0.97}
        accessibilityRole="button"
        accessibilityLabel={`${letter} ${label}`}
        accessibilityState={{
          disabled: answered,
          selected: state === "chosen" || state === "wrong",
        }}
        disabled={answered}
        onPress={onPress}
        style={[
          styles.option,
          state === "right" && styles.right,
          state === "wrong" && styles.wrong,
        ]}
      >
        <View>
          <Bubble letter={letter} state={BUBBLE[state]} />
          <ParticleBurst play={burst} />
        </View>
        <View style={styles.body}>
          <Text style={styles.text}>{label}</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 64,
    paddingHorizontal: space.block,
    paddingVertical: 14,
    borderRadius: radius.control,
    borderCurve: "continuous",
    backgroundColor: colors.card,
  },
  // The burst flies over the neighbouring options, not under them.
  above: { zIndex: 1 },
  right: { backgroundColor: colors.successSoft },
  wrong: { backgroundColor: colors.destructiveSoft },
  body: { flex: 1, gap: 2 },
  text: { fontSize: 17, lineHeight: 24, color: colors.foreground },
  note: { fontSize: 13, lineHeight: 18, color: colors.muted },
});
