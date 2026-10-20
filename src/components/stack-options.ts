import { colors } from "@/lib/theme";

/** Native large titles over the mist canvas; they collapse into the bar on scroll. */
export const largeTitleOptions = {
  headerLargeTitleEnabled: true,
  headerTransparent: true,
  headerLargeTitleShadowVisible: false,
  headerShadowVisible: false,
  headerTintColor: colors.foreground as string,
  headerLargeTitleStyle: { fontWeight: "800" },
  contentStyle: { backgroundColor: colors.canvas },
} as const;
