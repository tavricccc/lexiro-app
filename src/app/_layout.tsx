// Browser globals for the shared web code; must load before anything from src/core.
import { hydrateLocalStorage } from "@/platform/install";

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { reloadAppAsync } from "expo";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { FadeOut } from "react-native-reanimated";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/layout";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { ToastHost } from "@/components/toast-host";
import { useCloudStore } from "@/core/stores/cloud-store";
import { BRAND_DARK, BRAND_LIGHT, colors, fonts, plain } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

// Same key as the web's CloudGate: the visitor chose to stay on this device.
const LOCAL_ONLY_KEY = "lexiro:local-only";

export default function RootLayout() {
  const scheme = useColorScheme();
  const ready = useCloudStore((state) => state.ready);
  const configured = useCloudStore((state) => state.configured);
  const user = useCloudStore((state) => state.user);
  const error = useCloudStore((state) => state.error);
  const [localOnly, setLocalOnly] = useState<boolean | null>(null);
  // A font that fails to load falls back to the system face; it never blocks.
  const [fontsLoaded, fontError] = useFonts(fonts);
  const fontsSettled = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    void hydrateLocalStorage().then(() => {
      setLocalOnly(localStorage.getItem(LOCAL_ONLY_KEY) === "1");
      return useCloudStore.getState().initialize();
    });
  }, []);
  // Only a startup that never loaded the local library stops here.
  const failed = !ready && Boolean(error);
  // The local library is shown at once; sync catches up underneath.
  useEffect(() => {
    if (!fontsSettled) return;
    if ((ready && localOnly !== null) || failed) void SplashScreen.hideAsync();
  }, [ready, localOnly, failed, fontsSettled]);

  const askSignIn = ready && configured && !user && localOnly === false;

  const dark = scheme === "dark";
  const base = dark ? DarkTheme : DefaultTheme;
  const canvas = dark ? plain.canvas.dark : plain.canvas.light;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: dark ? BRAND_DARK : BRAND_LIGHT,
      background: canvas,
    },
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={theme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="practice"
            options={{
              headerShown: true,
              title: "練習",
              headerBackButtonDisplayMode: "minimal",
              headerShadowVisible: false,
              headerTintColor: dark
                ? plain.foreground.dark
                : plain.foreground.light,
              headerStyle: { backgroundColor: canvas },
            }}
          />
          <Stack.Screen name="sets" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="session"
            options={{ presentation: "fullScreenModal", gestureEnabled: false }}
          />
        </Stack>
        {askSignIn ? (
          <Animated.View
            exiting={FadeOut.duration(240)}
            style={StyleSheet.absoluteFill}
          >
            <SignInPrompt
              onSkip={() => {
                localStorage.setItem(LOCAL_ONLY_KEY, "1");
                setLocalOnly(true);
              }}
            />
          </Animated.View>
        ) : null}
        {failed ? (
          <View style={[StyleSheet.absoluteFill, styles.failed]}>
            <EmptyState
              illustrated={false}
              title="無法載入資料"
              body={error}
              action={
                <Button
                  label="重新載入"
                  icon="arrow.clockwise"
                  onPress={() => void reloadAppAsync()}
                />
              }
            />
          </View>
        ) : null}
        <ToastHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  failed: {
    justifyContent: "center",
    padding: 16,
    backgroundColor: colors.canvas,
  },
});
