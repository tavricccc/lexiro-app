import { NativeTabs } from "expo-router/unstable-native-tabs";

import { brand } from "@/lib/theme";

// The web app's four destinations, in its order.
export default function TabLayout() {
  return (
    <NativeTabs tintColor={brand} minimizeBehavior="never">
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Label>今天</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "sun.horizon", selected: "sun.horizon.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Label>我的單字</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "books.vertical", selected: "books.vertical.fill" }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="rooms">
        <NativeTabs.Trigger.Label>對戰</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "gamecontroller", selected: "gamecontroller.fill" }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>我的</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person", selected: "person.fill" }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
