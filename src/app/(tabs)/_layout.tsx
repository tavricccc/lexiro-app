import { NativeTabs } from "expo-router/unstable-native-tabs";

import { brand } from "@/lib/theme";

export default function TabLayout() {
  return (
    <NativeTabs tintColor={brand} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Label>單字庫</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "books.vertical", selected: "books.vertical.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="practice">
        <NativeTabs.Trigger.Label>練習</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "checkmark.circle", selected: "checkmark.circle.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>我的</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
