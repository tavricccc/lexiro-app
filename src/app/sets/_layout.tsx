import { Stack } from "expo-router";
import { useColorScheme } from "react-native";

import { plain } from "@/lib/theme";

/** The editing sheet: one native modal holding the create and edit flows. */
export default function SetsLayout() {
  const dark = useColorScheme() === "dark";
  const canvas = dark ? plain.canvas.dark : plain.canvas.light;
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        headerTintColor: dark ? plain.foreground.dark : plain.foreground.light,
        headerStyle: { backgroundColor: canvas },
        contentStyle: { backgroundColor: canvas },
      }}
    />
  );
}
