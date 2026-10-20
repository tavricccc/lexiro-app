import { Stack } from "expo-router";

import { largeTitleOptions } from "@/components/stack-options";

export default function LibraryLayout() {
  return (
    <Stack screenOptions={largeTitleOptions}>
      <Stack.Screen name="index" options={{ title: "單字庫" }} />
      <Stack.Screen name="[setId]" options={{ title: "" }} />
    </Stack>
  );
}
