import { SymbolView } from "expo-symbols";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { Button } from "@/components/ui/button";
import { t } from "@/core/lib/i18n";
import { colors, type } from "@/lib/theme";

/** The web's 接續上次進度？ choice, shown when a flow finds an unsaved draft. */
export function ResumeChoice({
  description,
  invalid,
  onResume,
  onRestart,
}: {
  description: string;
  invalid?: boolean;
  onResume: () => void;
  onRestart: () => void;
}) {
  return (
    <View style={styles.root}>
      <Animated.View style={styles.mark}>
        <SymbolView
          name={invalid ? "exclamationmark.triangle" : "clock.arrow.circlepath"}
          size={30}
          tintColor={colors.brand}
        />
      </Animated.View>
      <Animated.View style={styles.text}>
        <Text style={styles.title}>{t(invalid ? "draft.invalidTitle" : "draft.title")}</Text>
        <Text style={styles.body}>{description}</Text>
      </Animated.View>
      <Animated.View style={styles.actions}>
        {invalid ? null : <Button label={t("draft.resume")} onPress={onResume} />}
        <Button
          label={t("draft.restart")}
          variant={invalid ? "primary" : "ghost"}
          onPress={onRestart}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", gap: 20, padding: 24, backgroundColor: colors.canvas },
  mark: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
  },
  text: { gap: 8 },
  title: { ...type.title, color: colors.foreground, textAlign: "center" },
  body: { ...type.body, color: colors.muted, textAlign: "center" },
  actions: { gap: 10 },
});
