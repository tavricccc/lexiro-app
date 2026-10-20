import { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

/**
 * Swapping one view for another, such as a tab panel, or a row being added.
 * Pages themselves appear at once: Screen skips entering on first mount.
 */
export const swapIn = FadeIn.duration(220);
export const swapOut = FadeOut.duration(120);

/** Neighbours glide when something above them changes size. */
export const glide = LinearTransition.springify().damping(22).stiffness(240);
