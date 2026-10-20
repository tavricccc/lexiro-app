import { Stack } from "expo-router";

import { largeTitleOptions } from "@/components/stack-options";

export default function RoomsLayout() {
  return (
    <Stack screenOptions={largeTitleOptions}>
      <Stack.Screen name="index" options={{ title: "對戰" }} />
    </Stack>
  );
}
