/**
 * PressableScale — a tiny press-feedback wrapper for the Workout Report screen.
 *
 * Mirrors the Zeitra interaction spec: a spring-damped pressed scale on a
 * `Pressable`, animating ONLY `transform` (GPU-cheap, interruptible) so it never
 * touches layout. Used for the report header actions (back / share) and the
 * per-exercise breakdown cards, which previously used flat <TouchableOpacity> /
 * <View> with no tactile feedback.
 *
 * Local to the report surface on purpose — it is NOT a shared primitive
 * (CtaButton already owns the canonical 0.97 CTA scale); this is the lighter
 * 0.96 card/icon press used by sibling redesigned screens.
 */
import React from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends PressableProps {
  children?: React.ReactNode;
  /** Pressed scale target. Default 0.96 (Zeitra card/icon press). */
  activeScale?: number;
  style?: StyleProp<ViewStyle>;
}

export function PressableScale({
  children,
  activeScale = 0.96,
  style,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        scale.value = withSpring(activeScale, { damping: 18, mass: 0.5, stiffness: 320 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 18, mass: 0.5, stiffness: 320 });
        rest.onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
