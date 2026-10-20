import { DynamicColorIOS, type ColorValue } from "react-native";

/** A light/dark pair that iOS resolves itself, so styles need no color-scheme hook. */
function pair(light: string, dark: string): ColorValue {
  return DynamicColorIOS({ light, dark });
}

/** Lexiro green (web --brand-500 / dark --brand-600), the app-wide tint. */
export const BRAND_LIGHT = "#3f7c5a";
export const BRAND_DARK = "#8ecdab";
export const brand = pair(BRAND_LIGHT, BRAND_DARK);

/**
 * The web app's tokens (lexiro/app/globals.css): a mist-green canvas, opaque
 * cards, and a near-black contrast pill as the one strong fill. Surfaces are
 * told apart by a step in tone, not by lines or shadows.
 */
export const colors = {
  brand,
  canvas: pair("#eaf0ec", "#131d17"),
  card: pair("#ffffff", "#0c130f"),
  foreground: pair("#13201a", "#eef4f0"),
  muted: pair("#4f6157", "#a3b5aa"),
  faint: pair("rgba(19,32,26,0.42)", "rgba(238,244,240,0.42)"),
  primary: pair("#15211b", "#f3f7f4"),
  primaryForeground: pair("#f4f8f5", "#0f1813"),
  secondary: pair("rgba(19,32,26,0.06)", "rgba(255,255,255,0.07)"),
  inset: pair("rgba(19,32,26,0.05)", "rgba(255,255,255,0.06)"),
  pressed: pair("rgba(19,32,26,0.08)", "rgba(255,255,255,0.10)"),
  separator: pair("rgba(19,32,26,0.12)", "rgba(255,255,255,0.12)"),
  selected: pair("#e6f0ea", "#1d3428"),
  brandSoft: pair("#e3f0e8", "#16261d"),
  destructive: pair("#c83b3b", "#ff7a7a"),
  destructiveSoft: pair("#fbe9e9", "#3a1a1a"),
  success: pair("#1f8a5d", "#5cc99a"),
  successSoft: pair("#e1f2e9", "#123326"),
  // The completion surface keeps the same ink and spring green in both modes.
  studyInk: "#173f32",
  studyPaper: "#f4fbf6",
  studySoft: "#c6dfd1",
  studyLime: "#ccf3a9",
} as const;

export const radius = {
  control: 24,
  card: 28,
  stage: 36,
  segment: 21,
} as const;

export const space = {
  gutter: 16,
  section: 24,
  block: 16,
  row: 20,
} as const;

/** Type roles from the web DESIGN.md, scaled up a step for a phone held in hand. */
export const type = {
  display: { fontSize: 34, fontWeight: "700", letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  section: { fontSize: 18, fontWeight: "700", letterSpacing: -0.2 },
  row: { fontSize: 17, fontWeight: "400" },
  body: { fontSize: 15, lineHeight: 23 },
  hint: { fontSize: 13, lineHeight: 20 },
} as const;

/**
 * Plain hex values for animated styles: Reanimated interpolates strings, not
 * the dynamic colors above, so animations pick a mode with useColorScheme.
 */
export function hexPalette(dark: boolean) {
  return dark
    ? {
        foreground: "#eef4f0",
        muted: "#a3b5aa",
        primaryForeground: "#0f1813",
        card: "#0c130f",
        selected: "#1d3428",
      }
    : {
        foreground: "#13201a",
        muted: "#4f6157",
        primaryForeground: "#f4f8f5",
        card: "#ffffff",
        selected: "#e6f0ea",
      };
}
