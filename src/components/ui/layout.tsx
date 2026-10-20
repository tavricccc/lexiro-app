import { Image } from "expo-image";
import type { ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type ScrollViewProps,
  type ViewStyle,
} from "react-native";

import { LayoutAnimationConfig } from "react-native-reanimated";

import { colors, radius, space, type } from "@/lib/theme";

const reading = require("../../../assets/illustrations/reading.svg");

/** A scrolling page on the canvas, under the native large title. */
export function Screen({ children, ...props }: ScrollViewProps & { children: ReactNode }) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
      {...props}
      contentContainerStyle={[styles.content, props.contentContainerStyle]}
    >
      <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>
    </ScrollView>
  );
}

/** An opaque surface for one task. */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** The Open Doodles reader, tinted with the text color as on the web app. */
export function Illustration({ size = 132 }: { size?: number }) {
  const dark = useColorScheme() === "dark";
  return (
    <Image
      source={reading}
      tintColor={dark ? "#eef4f0" : "#13201a"}
      contentFit="contain"
      style={{ width: size, height: (size * 3) / 4 }}
      accessible={false}
    />
  );
}

export function EmptyState({
  title,
  body,
  action,
  illustrated = true,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  illustrated?: boolean;
}) {
  return (
    <Card style={styles.empty}>
      {illustrated ? <Illustration size={180} /> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas },
  content: { padding: space.gutter, paddingBottom: 48, gap: space.section },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: "continuous",
    padding: space.row,
  },
  empty: { alignItems: "center", gap: 10, paddingVertical: 32 },
  emptyTitle: { ...type.title, color: colors.foreground, textAlign: "center", marginTop: 6 },
  emptyBody: { ...type.body, color: colors.muted, textAlign: "center", maxWidth: 300 },
  emptyAction: { alignSelf: "stretch", marginTop: 10 },
});
