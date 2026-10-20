import { Stack } from "expo-router";

import { largeTitleOptions } from "@/components/stack-options";

export default function PracticeLayout() {
  return (
    <Stack screenOptions={largeTitleOptions}>
      <Stack.Screen name="index" options={{ title: "練習" }} />
    </Stack>
  );
}
