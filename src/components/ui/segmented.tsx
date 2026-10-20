import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, useColorScheme } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

import { colors, hexPalette, radius } from "@/lib/theme";

const PADDING = 4;
const GAP = 4;
const SPRING = { damping: 22, stiffness: 260, mass: 0.9 };

/**
 * Equal-width tabs on a card track; the contrast pill slides to the chosen
 * one, as on the web app's 今天 page.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const position = useSharedValue(index);

  useEffect(() => {
    position.set(withSpring(index, SPRING));
  }, [index, position]);

  const segment = width ? (width - PADDING * 2 - GAP * (options.length - 1)) / options.length : 0;
  const pill = useAnimatedStyle(() => ({
    width: segment,
    transform: [{ translateX: position.value * (segment + GAP) }],
  }));

  return (
    <View
      style={styles.track}
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width ? <Animated.View style={[styles.pill, pill]} /> : null}
      {options.map((option, optionIndex) => (
        <Segment
          key={String(option.value)}
          label={option.label}
          index={optionIndex}
          position={position}
          selected={optionIndex === index}
          onPress={() => {
            if (optionIndex === index) return;
            void Haptics.selectionAsync();
            onChange(option.value);
          }}
        />
      ))}
    </View>
  );
}

function Segment({
  label,
  index,
  position,
  selected,
  onPress,
}: {
  label: string;
  index: number;
  position: SharedValue<number>;
  selected: boolean;
  onPress: () => void;
}) {
  const palette = hexPalette(useColorScheme() === "dark");
  // 1 while the pill sits under this segment, fading as it slides away.
  const cover = useDerivedValue(() => Math.max(0, 1 - Math.abs(position.value - index)));
  const text = useAnimatedStyle(() => ({
    color: interpolateColor(cover.value, [0, 1], [palette.muted, palette.primaryForeground]),
  }));
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.segment}
    >
      <Animated.Text
        style={[styles.label, selected && styles.selectedLabel, text]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: PADDING,
    gap: GAP,
    borderRadius: radius.control + PADDING,
    borderCurve: "continuous",
    backgroundColor: colors.card,
  },
  pill: {
    position: "absolute",
    top: PADDING,
    bottom: PADDING,
    left: PADDING,
    borderRadius: radius.segment,
    borderCurve: "continuous",
    backgroundColor: colors.primary,
  },
  segment: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15, fontWeight: "500" },
  selectedLabel: { fontWeight: "600" },
});
