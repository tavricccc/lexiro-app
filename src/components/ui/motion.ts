import { FadeIn, FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";

/** Content rises into place, each item a beat after the one before. */
export const rise = (index = 0) =>
  FadeInDown.delay(Math.min(index, 8) * 45)
    .springify()
    .damping(20)
    .stiffness(220);

/** Swapping one view for another, such as a tab panel. */
export const swapIn = FadeIn.duration(220);
export const swapOut = FadeOut.duration(120);

/** Neighbours glide when something above them changes size. */
export const glide = LinearTransition.springify().damping(22).stiffness(240);
