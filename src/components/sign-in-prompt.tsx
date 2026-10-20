import { Image } from "expo-image";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { SignInCancelled, signInWithGoogle } from "@/lib/sign-in";
import { colors, radius, type } from "@/lib/theme";

const icon = require("../../assets/images/icon.png");

export function useSignIn() {
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (reason) {
      if (!(reason instanceof SignInCancelled)) Alert.alert("登入失敗", "請再試一次。");
    } finally {
      setBusy(false);
    }
  };
  return { busy, signIn };
}

/** Shown in place of a tab that needs the cloud library, worded as on the web app. */
export function SignInPrompt({ body }: { body?: string }) {
  const { busy, signIn } = useSignIn();
  return (
    <View style={styles.root}>
      <Image source={icon} style={styles.icon} accessible={false} />
      <Text style={styles.title}>登入 Lexiro</Text>
      <Text style={styles.body}>
        {body ?? "登入後單字集和練習進度會在每台裝置同步，也能分享單字集、和朋友開房對戰。"}
      </Text>
      <Button
        label={busy ? "登入中…" : "使用 Google 登入"}
        icon="arrow.right.circle"
        busy={busy}
        onPress={() => void signIn()}
        style={styles.button}
      />
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
