/**
 * PressableScale — a thin Pressable that adds the Zeitra house pressed-scale.
 *
 * On press-in it springs to a subtle 0.96 inset (transform-only, interruptible)
 * and back to 1 on release — the exact recipe ExerciseGridCard uses, factored
 * out so option tiles (goal / level / day / chip / equipment) on a form screen
 * can opt into the same tactile feedback without each re-deriving a shared value.
 *
 * It is a behaviour wrapper only: every interaction/a11y prop (onPress,
 * accessibilityRole/State/Label, hitSlop, disabled, style, testID, children) is
 * forwarded verbatim to the underlying Pressable, so callers keep full control
 * of semantics and layout. Pass `pressedScale` to tune the inset (default 0.96).
 *
 * Lives under src/components/ui so feature screens can compose it without
 * touching any shared primitive or the theme.
 */
import React from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends PressableProps {
  /** Target scale on press-in. Defaults to 0.96 (the Aurora tile inset). */
  pressedScale?: number;
  style?: StyleProp<ViewStyle>;
}

export function PressableScale({
  pressedScale = 0.96,
  disabled,
  style,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (!disabled) scale.value = withSpring(pressedScale, { damping: 18, stiffness: 320 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 18, stiffness: 320 });
        rest.onPressOut?.(e);
      }}
      style={[style as ViewStyle, animStyle]}
    >
      {children as React.ReactNode}
    </AnimatedPressable>
  );
}
