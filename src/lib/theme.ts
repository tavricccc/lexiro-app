import { DynamicColorIOS, type ColorValue } from "react-native";

/** A light/dark pair that iOS resolves itself, so styles need no color-scheme hook. */
function pair(light: string, dark: string): ColorValue {
  return DynamicColorIOS({ light, dark });
}

/**
 * The look is the 學測 answer card: its orange print, the 2B pencil that
 * fills a bubble, and the white of the sheet. Orange is the one accent; ink
 * is the strong fill; the bubble (a full oval) is the one shape that recurs.
 */
export const ORANGE = "#ff6a13";
export const INK = "#0b0f14";

/** The tint for controls: switches, sliders, the tab bar. */
export const BRAND_LIGHT = "#f05a06";
export const BRAND_DARK = "#ff8a3d";
export const brand = pair(BRAND_LIGHT, BRAND_DARK);

/** Plain values for native options that take a string, not a dynamic color. */
export const plain = {
  canvas: { light: "#f1f2f0", dark: "#0b0f13" },
  foreground: { light: INK, dark: "#f1f2ee" },
} as const;

/** Surfaces are told apart by a step in tone, not by lines or shadows. */
export const colors = {
  brand,
  canvas: pair(plain.canvas.light, plain.canvas.dark),
  card: pair("#ffffff", "#171c22"),
  foreground: pair(plain.foreground.light, plain.foreground.dark),
  muted: pair("#535b63", "#a2aab2"),
  faint: pair("rgba(11,15,20,0.42)", "rgba(241,242,238,0.42)"),
  // Pencil on paper: ink with orange words; at night the orange takes over.
  primary: pair(INK, ORANGE),
  primaryForeground: pair("#ff7a2a", INK),
  secondary: pair("rgba(11,15,20,0.06)", "rgba(255,255,255,0.08)"),
  inset: pair("rgba(11,15,20,0.05)", "rgba(255,255,255,0.06)"),
  pressed: pair("rgba(11,15,20,0.08)", "rgba(255,255,255,0.10)"),
  separator: pair("rgba(11,15,20,0.12)", "rgba(255,255,255,0.12)"),
  selected: pair("#e4e6e8", "#262d35"),
  brandSoft: pair("#ffe6d6", "#3a1e0c"),
  destructive: pair("#d22f2f", "#ff7a7a"),
  destructiveSoft: pair("#fde6e4", "#3d1717"),
  success: pair("#10894d", "#4fd18b"),
  successSoft: pair("#dcf3e5", "#0f3020"),
  // The orange field keeps ink on it in both modes, like the printed card.
  field: ORANGE,
  fieldInk: INK,
  fieldSoft: "#ffb27f",
  fieldDeep: "#e25404",
} as const;

export const radius = {
  control: 22,
  card: 24,
  stage: 24,
  segment: 21,
  /** The bubble: always a full oval. */
  bubble: 999,
} as const;

export const space = {
  gutter: 16,
  section: 28,
  block: 16,
  row: 20,
} as const;

/**
 * Albert Sans sets the Latin side of the app (the words being learnt, the
 * numbers, the A–D letters); Chinese stays in the system face. Each weight is
 * its own family, so styles name the family and never set fontWeight.
 */
export const fonts = {
  "AlbertSans-500": require("../../assets/fonts/AlbertSans-500.ttf"),
  "AlbertSans-600": require("../../assets/fonts/AlbertSans-600.ttf"),
  "AlbertSans-700": require("../../assets/fonts/AlbertSans-700.ttf"),
  "AlbertSans-800": require("../../assets/fonts/AlbertSans-800.ttf"),
};

export const latin = {
  medium: { fontFamily: "AlbertSans-500" },
  semibold: { fontFamily: "AlbertSans-600" },
  bold: { fontFamily: "AlbertSans-700" },
  heavy: { fontFamily: "AlbertSans-800" },
} as const;

/** Text with nothing outside Latin script, which can be set in Albert Sans. */
export function isLatin(text: string) {
  return /^[\u0000-\u024f\u2000-\u206f]*$/.test(text);
}

/** Two sizes do the work, a very large one and a small one. */
export const type = {
  /** Numbers and words at poster size. */
  poster: { ...latin.heavy, fontSize: 88, lineHeight: 88, letterSpacing: -4 },
  display: { fontSize: 36, fontWeight: "800", letterSpacing: -1 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  section: { fontSize: 18, fontWeight: "700", letterSpacing: -0.2 },
  row: { fontSize: 17, fontWeight: "400" },
  body: { fontSize: 16, lineHeight: 24 },
  hint: { fontSize: 13, lineHeight: 19 },
} as const;

/**
 * Plain hex values for animated styles: Reanimated interpolates strings, not
 * the dynamic colors above, so animations pick a mode with useColorScheme.
 */
export function hexPalette(dark: boolean) {
  return dark
    ? {
        foreground: "#f1f2ee",
        muted: "#a2aab2",
        primaryForeground: INK,
        card: "#171c22",
        selected: "#262d35",
      }
    : {
        foreground: INK,
        muted: "#535b63",
        primaryForeground: "#ff7a2a",
        card: "#ffffff",
        selected: "#e4e6e8",
      };
}
