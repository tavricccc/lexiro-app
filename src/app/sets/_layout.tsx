import { Stack } from "expo-router";
import { useColorScheme } from "react-native";

/** The editing sheet: one native modal holding the create and edit flows. */
export default function SetsLayout() {
  const dark = useColorScheme() === "dark";
  const canvas = dark ? "#131d17" : "#eaf0ec";
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        headerTintColor: dark ? "#eef4f0" : "#13201a",
        headerStyle: { backgroundColor: canvas },
        contentStyle: { backgroundColor: canvas },
      }}
    />
  );
}
