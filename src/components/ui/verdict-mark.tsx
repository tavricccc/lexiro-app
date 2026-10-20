import { View, type ColorValue } from "react-native";

import { colors } from "@/lib/theme";

/**
 * The right/wrong mark: a tick or cross on a filled disc.
 *
 * Drawn from plain views instead of a symbol image. expo-symbols rasterises
 * SF Symbols at the system point size (17pt) and then scales the image up to
 * the requested size, which is what made the 20–26pt marks look soft.
 */
export function VerdictMark({
  correct,
  size = 24,
  disc = true,
  tint,
  markColor,
}: {
  correct: boolean;
  size?: number;
  /** Draw the filled disc behind the mark; off places the mark on its own. */
  disc?: boolean;
  tint?: ColorValue;
  markColor?: ColorValue;
}) {
  const stroke = Math.max(2, size * 0.11);
  const ink = markColor ?? "#ffffff";
  const bar = {
    position: "absolute" as const,
    height: stroke,
    borderRadius: stroke / 2,
    backgroundColor: ink,
  };

  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={[
        { width: size, height: size },
        disc && {
          borderRadius: size / 2,
          backgroundColor: tint ?? (correct ? colors.success : colors.destructive),
        },
      ]}
    >
      {correct ? (
        <>
          {/* The short arm and the long arm of the tick, rounded at the ends. */}
          <View
            style={[
              bar,
              {
                width: size * 0.24 + stroke * 0.7,
                left: size * 0.355 - (size * 0.24 + stroke * 0.7) / 2,
                top: size * 0.595 - stroke / 2,
                transform: [{ rotate: "45deg" }],
              },
            ]}
          />
          <View
            style={[
              bar,
              {
                width: size * 0.45 + stroke * 0.7,
                left: size * 0.58 - (size * 0.45 + stroke * 0.7) / 2,
                top: size * 0.505 - stroke / 2,
                transform: [{ rotate: "-51deg" }],
              },
            ]}
          />
        </>
      ) : (
        <>
          <View
            style={[
              bar,
              {
                width: size * 0.44,
                left: size * 0.28,
                top: size / 2 - stroke / 2,
                transform: [{ rotate: "45deg" }],
              },
            ]}
          />
          <View
            style={[
              bar,
              {
                width: size * 0.44,
                left: size * 0.28,
                top: size / 2 - stroke / 2,
                transform: [{ rotate: "-45deg" }],
              },
            ]}
          />
        </>
      )}
    </View>
  );
}
