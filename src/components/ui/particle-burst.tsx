import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { colors } from "@/lib/theme";

// The card's orange, pencil ink, and the green of a right answer.
const PALETTE = [
  colors.field,
  colors.foreground,
  colors.success,
  colors.fieldSoft,
  "#ffd23f",
];
const DURATION = 720;

interface Spark {
  dx: number;
  dy: number;
  size: number;
  round: boolean;
  spin: number;
  color: (typeof PALETTE)[number];
}

function sparks(count: number, reach: number): Spark[] {
  return Array.from({ length: count }, (_, index) => {
    // Evenly spread with a little jitter, so the burst never leaves a gap.
    const angle =
      (index / count) * Math.PI * 2 + (Math.random() - 0.5) * (Math.PI / count);
    const distance = reach * (0.55 + Math.random() * 0.45);
    return {
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      size: 5 + Math.random() * 5,
      round: index % 3 !== 0,
      spin: (Math.random() - 0.5) * 540,
      color: PALETTE[index % PALETTE.length]!,
    };
  });
}

function SparkView({
  spark,
  progress,
}: {
  spark: Spark;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p === 0 ? 0 : p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45,
      transform: [
        { translateX: spark.dx * p },
        // Each spark flies out, then falls a little as it fades.
        { translateY: spark.dy * p + 26 * p * p },
        { rotate: `${spark.spin * p}deg` },
        { scale: 1 - 0.5 * p },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.spark,
        {
          width: spark.size,
          height: spark.round ? spark.size : spark.size * 0.45,
          borderRadius: spark.round ? spark.size / 2 : 1.5,
          marginLeft: -spark.size / 2,
          marginTop: -spark.size / 2,
          backgroundColor: spark.color,
        },
        style,
      ]}
    />
  );
}

/**
 * A short burst of confetti from its own centre. It plays each time `play`
 * changes to a new truthy value and draws nothing otherwise; it never takes
 * touches, so it can sit over a button.
 */
export function ParticleBurst({
  play,
  count = 16,
  reach = 64,
}: {
  play: number;
  count?: number;
  reach?: number;
}) {
  const progress = useSharedValue(0);
  const list = useMemo(
    () => (play ? sparks(count, reach) : []),
    [play, count, reach],
  );

  useEffect(() => {
    if (!play) return;
    progress.set(0);
    progress.set(
      withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) }),
    );
  }, [play, progress]);

  if (!play) return null;
  return (
    <View pointerEvents="none" style={styles.origin}>
      {list.map((spark, index) => (
        <SparkView key={`${play}:${index}`} spark={spark} progress={progress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  origin: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 0,
    height: 0,
    overflow: "visible",
  },
  spark: { position: "absolute", left: 0, top: 0 },
});
