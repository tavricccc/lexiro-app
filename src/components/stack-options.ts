import { PlatformColor } from "react-native";

/** Native large titles that collapse into the bar as the list scrolls. */
export const largeTitleOptions = {
  headerLargeTitleEnabled: true,
  headerTransparent: true,
  headerLargeTitleShadowVisible: false,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: PlatformColor("systemGroupedBackground") },
} as const;
