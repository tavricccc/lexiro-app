import { Stack } from "expo-router";

import { largeTitleOptions } from "@/components/stack-options";

export default function AccountLayout() {
  return (
    <Stack screenOptions={largeTitleOptions}>
      <Stack.Screen name="index" options={{ title: "我的" }} />
    </Stack>
  );
}
