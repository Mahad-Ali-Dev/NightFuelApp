/**
 * RoutinePressable — the springy pressed-scale wrapper for the Workout Routines
 * screen (app/(exercises)/routines.tsx).
 *
 * Local-only presentational helper (lives outside the shared `ui/` barrel). It
 * is a drop-in replacement for the plain `TouchableOpacity` cards/chips/buttons
 * whose only press feedback was an opacity fade. Instead of a fade it drives a
 * Reanimated SPRING scale (default 0.96, matching the skill's pressed-scale
 * spec + the sibling hub's spring entrances) on press-in and springs back on
 * press-out, so every interactive surface on the screen shares one tactile
 * press language.
 *
 * It owns no data — every prop (onPress, accessibilityRole/Label/State, testID,
 * hitSlop, disabled, style, children …) is forwarded straight to the underlying
 * Pressable, so callers keep their exact behaviour, a11y and test hooks.
 * Transform-only and fully interruptible (a new gesture re-targets the same
 * shared value). `style` may be a plain style or a style array; it is applied to
 * the inner Animated.View alongside the scale transform so existing layout
 * styles are preserved.
 */
import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

export interface RoutinePressableProps extends Omit<PressableProps, 'style'> {
  /** Pressed-in scale target. Defaults to 0.96 (the skill's pressed-scale spec). */
  pressedScale?: number;
  /** Style for the inner animated view (scale transform is composed on top). */
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

const SPRING = { damping: 18, stiffness: 320, mass: 0.7 } as const;

export function RoutinePressable({
  pressedScale = 0.96,
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: RoutinePressableProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(e) => {
        if (!disabled) scale.value = withSpring(pressedScale, SPRING);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, SPRING);
        onPressOut?.(e);
      }}
      {...props}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
