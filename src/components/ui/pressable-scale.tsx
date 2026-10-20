import type { ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS = { damping: 18, stiffness: 420, mass: 0.6 };
const RELEASE = { damping: 14, stiffness: 260, mass: 0.7 };

/** A pressable that sinks a little under the finger and springs back. */
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
        scale.set(withSpring(scaleTo, PRESS));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withSpring(1, RELEASE));
        onPressOut?.(event);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
