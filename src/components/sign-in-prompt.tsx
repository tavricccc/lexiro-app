import { Button, Host } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, tint } from "@expo/ui/swift-ui/modifiers";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Alert, PlatformColor, StyleSheet, Text, View } from "react-native";

import { SignInCancelled, signInWithGoogle } from "@/lib/sign-in";
import { BRAND_LIGHT, brand } from "@/lib/theme";

export function useSignIn() {
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (reason) {
      if (!(reason instanceof SignInCancelled))
        Alert.alert("登入失敗", "請再試一次。");
    } finally {
      setBusy(false);
    }
  };
  return { busy, signIn };
}

/** Shown in place of a tab that needs the cloud library. */
export function SignInPrompt() {
  const { busy, signIn } = useSignIn();
  return (
    <View style={styles.root}>
      <SymbolView name="books.vertical.fill" size={56} tintColor={brand} />
      <Text style={styles.title}>登入 Lexiro</Text>
      <Text style={styles.body}>用 Google 帳號登入，同步你的單字集和題目。</Text>
      <Host matchContents>
        <Button
          label={busy ? "登入中…" : "用 Google 登入"}
          systemImage="person.crop.circle"
          onPress={() => void signIn()}
          modifiers={[buttonStyle("glassProminent"), controlSize("large"), tint(BRAND_LIGHT)]}
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  title: { color: PlatformColor("label"), fontSize: 28, fontWeight: "700", marginTop: 8 },
  body: {
    color: PlatformColor("secondaryLabel"),
    fontSize: 17,
    textAlign: "center",
    marginBottom: 12,
  },
});
