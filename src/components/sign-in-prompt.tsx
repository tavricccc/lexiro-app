import { Image } from "expo-image";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { t } from "@/core/lib/i18n";
import { useCloudStore } from "@/core/stores/cloud-store";
import { SignInCancelled } from "@/platform/sign-in";
import { colors, radius, type } from "@/lib/theme";

const icon = require("../../assets/images/icon.png");

export function useSignIn() {
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await useCloudStore.getState().signIn();
    } catch (reason) {
      if (!(reason instanceof SignInCancelled)) Alert.alert("登入失敗", "請再試一次。");
    } finally {
      setBusy(false);
    }
  };
  return { busy, signIn };
}

/** The web app's sign-in card: in place of a tab that needs an account, or at startup. */
export function SignInPrompt({ body, onSkip }: { body?: string; onSkip?: () => void }) {
  const { busy, signIn } = useSignIn();
  return (
    <View style={styles.root}>
      <Image source={icon} style={styles.icon} accessible={false} />
      <Text style={styles.title}>{t("startup.signInTitle")}</Text>
      <Text style={styles.body}>{body ?? t("startup.signInBody")}</Text>
      <Button
        label={busy ? "登入中…" : t("settings.signIn")}
        icon="arrow.right.circle"
        busy={busy}
        onPress={() => void signIn()}
        style={styles.button}
      />
      {onSkip ? (
        <Button
          label={t("startup.localOnly")}
          variant="ghost"
          onPress={onSkip}
          style={styles.button}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 28,
    backgroundColor: colors.canvas,
  },
  icon: { width: 88, height: 88, borderRadius: radius.control, borderCurve: "continuous" },
  title: { ...type.title, color: colors.foreground, marginTop: 8 },
  body: { ...type.body, color: colors.muted, textAlign: "center", marginBottom: 12 },
  button: { alignSelf: "stretch" },
});
