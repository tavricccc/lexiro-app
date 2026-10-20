import * as Haptics from "expo-haptics";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";

import { colors, type } from "@/lib/theme";
import { Button } from "./button";

/** The end of a flow: what was done, the way out, and one more of the same. */
export function FinishPanel({
  title,
  description,
  finishLabel = "完成",
  onFinish,
  moreLabel,
  moreIcon,
  onMore,
}: {
  title: string;
  description?: string;
  finishLabel?: string;
  onFinish: () => void;
  moreLabel?: string;
  moreIcon?: SymbolViewProps["name"];
  onMore?: () => void;
}) {
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);
  return (
    <View style={styles.root}>
      <Animated.View
        entering={ZoomIn.springify().damping(12)}
        style={styles.mark}
      >
        <SymbolView
          name="checkmark"
          size={30}
          weight="bold"
          tintColor={colors.studyInk}
        />
      </Animated.View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.body}>{description}</Text> : null}
      </View>
      <Animated.View entering={FadeIn.delay(160)} style={styles.actions}>
        <Button label={finishLabel} onPress={onFinish} />
        {onMore && moreLabel ? (
          <Button
            label={moreLabel}
            icon={moreIcon}
            variant="ghost"
            onPress={onMore}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", gap: 22, padding: 24 },
  mark: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.studyLime,
  },
  text: { gap: 8 },
  title: { ...type.title, color: colors.foreground, textAlign: "center" },
  body: { ...type.body, color: colors.muted, textAlign: "center" },
  actions: { gap: 10 },
});
