import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { descriptionPoints } from "@/core/lib/library";

/**
 * A sense description, one bullet per line. A single point reads as plain
 * text; `max` keeps a row short, and `numberOfLines` clamps each point.
 */
export function DescriptionPoints({
  text,
  max,
  style,
  textStyle,
  numberOfLines,
  selectable,
}: {
  text: string;
  max?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
}) {
  const points = descriptionPoints(text).slice(0, max);
  if (!points.length) return null;
  return (
    <View style={style}>
      {points.length === 1 ? (
        <Text
          style={textStyle}
          numberOfLines={numberOfLines}
          selectable={selectable}
        >
          {points[0]}
        </Text>
      ) : (
        points.map((point, index) => (
          <View key={index} style={styles.point}>
            <Text style={textStyle}>•</Text>
            <Text
              style={[textStyle, styles.pointText]}
              numberOfLines={numberOfLines}
              selectable={selectable}
            >
              {point}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  point: { flexDirection: "row", gap: 6 },
  pointText: { flexShrink: 1 },
});
