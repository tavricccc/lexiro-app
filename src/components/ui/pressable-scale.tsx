import type { ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Sink under the finger, release cleanly: no spring, so nothing wobbles. */
const PRESS = { duration: 90, easing: Easing.out(Easing.quad) };
const RELEASE = { duration: 160, easing: Easing.out(Easing.cubic) };

/** A pressable that sinks a little under the finger and eases back. */
export function PressableScale({
  scaleTo = 0.96,
  style,
  children,
  onPressIn,
  onPressOut,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        scale.set(withTiming(scaleTo, PRESS));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withTiming(1, RELEASE));
        onPressOut?.(event);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
