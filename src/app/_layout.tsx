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

  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: scheme === "dark" ? BRAND_DARK : BRAND_LIGHT,
    },
  };

  return (
    <ThemeProvider value={theme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="session"
          options={{ presentation: "fullScreenModal", gestureEnabled: false }}
        />
      </Stack>
    </ThemeProvider>
  );
}
