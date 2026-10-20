import { DynamicColorIOS } from "react-native";

/** Lexiro green (web --brand-500 / dark --brand-600), the app-wide tint. */
export const BRAND_LIGHT = "#3f7c5a";
export const BRAND_DARK = "#8ecdab";
export const brand = DynamicColorIOS({ light: BRAND_LIGHT, dark: BRAND_DARK });
