import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";

import { useApp } from "@/lib/store";
import { BRAND_DARK, BRAND_LIGHT } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const ready = useApp((state) => state.ready);
  const start = useApp((state) => state.start);

  useEffect(() => start(), [start]);
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  const dark = scheme === "dark";
  const base = dark ? DarkTheme : DefaultTheme;
  const canvas = dark ? "#131d17" : "#eaf0ec";
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: dark ? BRAND_DARK : BRAND_LIGHT,
      background: canvas,
    },
  };

  return (
    <ThemeProvider value={theme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="practice"
          options={{
            headerShown: true,
            title: "練習",
            headerBackTitle: "返回",
            headerShadowVisible: false,
            headerTintColor: dark ? "#eef4f0" : "#13201a",
            headerStyle: { backgroundColor: canvas },
          }}
        />
        <Stack.Screen
          name="session"
          options={{ presentation: "fullScreenModal", gestureEnabled: false }}
        />
      </Stack>
    </ThemeProvider>
  );
}
