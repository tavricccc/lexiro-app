import { useState, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from "react-native";

import Animated, { LayoutAnimationConfig } from "react-native-reanimated";

import { colors, radius, space, type } from "@/lib/theme";
import { Bubble } from "./bubble";
import { swapIn } from "./motion";
import { useTransitionDone } from "./use-transition-done";

/**
 * A scrolling page on the canvas, under the native large title. The body
 * waits for the page's transition, so the tap is answered at once and the
 * content fades in after; anything inside appears without its own entrance.
 */
export function Screen({ children, ...props }: ScrollViewProps & { children: ReactNode }) {
  const ready = useTransitionDone();
  const [instant] = useState(ready);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
      {...props}
      contentContainerStyle={[styles.content, props.contentContainerStyle]}
    >
      {ready ? (
        <Animated.View entering={instant ? undefined : swapIn} style={styles.body}>
          <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

/** An opaque surface for one task. */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Three bubbles of the answer card, the first filled in: the app's mark. */
export function BubbleMark({ size = 30 }: { size?: number }) {
  return (
    <View style={styles.mark} accessible={false}>
      <Bubble letter="A" state="filled" size={size} />
      <Bubble letter="B" size={size} />
      <Bubble letter="C" size={size} />
    </View>
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
      {illustrated ? <BubbleMark /> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas },
  content: { padding: space.gutter, paddingBottom: 48 },
  body: { gap: space.section },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: "continuous",
    padding: space.row,
  },
  mark: { flexDirection: "row", gap: 8, marginBottom: 12 },
  empty: { gap: 8, padding: 24, paddingVertical: 28 },
  emptyTitle: { ...type.title, color: colors.foreground },
  emptyBody: { ...type.body, color: colors.muted },
  emptyAction: { alignSelf: "stretch", marginTop: 10 },
});
