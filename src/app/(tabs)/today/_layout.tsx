import { Stack } from "expo-router";

import { largeTitleOptions } from "@/components/stack-options";

export default function TodayLayout() {
  return (
    <Stack screenOptions={largeTitleOptions}>
      <Stack.Screen name="index" options={{ title: "今天" }} />
    </Stack>
  );
}
