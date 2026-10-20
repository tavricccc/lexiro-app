import { useEffect, useState } from "react";
import { StyleSheet, View, type ColorValue } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/lib/theme";

/** The fill eases to each new value (the web app's local 180ms exception, a touch longer). */
export function ProgressBar({
  value,
  tint = colors.primary,
  track = colors.inset,
}: {
  value: number;
  tint?: ColorValue;
  track?: ColorValue;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.set(withTiming(clamped, { duration: 320, easing: Easing.out(Easing.cubic) }));
  }, [clamped, progress]);

  const fill = useAnimatedStyle(() => ({ width: progress.value * width }));

  return (
    <View
      style={[styles.track, { backgroundColor: track }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Animated.View style={[styles.fill, { backgroundColor: tint }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // A long bubble filling in from the left.
  track: { height: 12, borderRadius: 999, overflow: "hidden" },
  fill: { height: 12, borderRadius: 999 },
});
