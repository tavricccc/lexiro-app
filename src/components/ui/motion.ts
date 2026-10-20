import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeInUp,
  FadeOut,
  LinearTransition,
  ZoomIn,
  ZoomOut,
} from "react-native-reanimated";

/**
 * One curve for everything that moves: fast off the mark, then a long soft
 * landing with no overshoot. Springs were dropped because their settle read
 * as slow drifting and wobbling.
 */
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
/** Gentler for things that travel, so a move is followed rather than jumped. */
export const EASE_MOVE = Easing.bezier(0.25, 0.8, 0.25, 1);

/**
 * Swapping one view for another, such as a tab panel, or a row being added.
 * Pages themselves appear at once: Screen skips entering on first mount.
 */
export const swapIn = FadeIn.duration(160);
export const swapOut = FadeOut.duration(100);

/** Neighbours glide when something above them changes size. */
export const glide = LinearTransition.duration(340).easing(EASE_MOVE);

/** A mark or badge appearing: a check, a crown, a finish icon. */
export const pop = ZoomIn.duration(200).easing(EASE_OUT);
export const popOut = ZoomOut.duration(100);

/** Reanimated's short fade-and-shift entrances, on the shared curve. */
export const enterDown = FadeInDown.duration(320).easing(EASE_MOVE);
export const enterUp = FadeInUp.duration(320).easing(EASE_MOVE);
/** The next question sliding in. */
export const slideNext = FadeInRight.duration(320).easing(EASE_MOVE);
