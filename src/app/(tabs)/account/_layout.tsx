import { Stack } from "expo-router";

import { largeTitleOptions } from "@/components/stack-options";
import { t } from "@/core/lib/i18n";

export default function AccountLayout() {
  return (
    <Stack screenOptions={largeTitleOptions}>
      <Stack.Screen name="index" options={{ title: "我的" }} />
      <Stack.Screen name="agents" options={{ title: t("agent.connections") }} />
    </Stack>
  );
}
