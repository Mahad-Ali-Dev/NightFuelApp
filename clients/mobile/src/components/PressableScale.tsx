/**
 * PressableScale — the canonical Aurora/Zeitra tactile press wrapper.
 *
 * A drop-in interactive container that reproduces the established press
 * language used by the app's own components (GoalGridCard, SelectionChip,
 * ExerciseGridCard, DietPrefChip): a Reanimated shared-value scale that dips
 * to 0.96 on press-in (110ms) and springs back to 1 on press-out (140ms),
 * transform-only so it's cheap and interruptible.
 *
 * It exists so screens that were using a plain <TouchableOpacity activeOpacity>
 * (an opacity fade, not the skill-mandated scale) can adopt the same physical
 * feedback without re-implementing the shared value each time. Pure
 * presentation: every prop (onPress, accessibility*, style, hitSlop, testID…)
 * is forwarded to an underlying Pressable, so callers keep their exact
 * handlers, a11y and test hooks.
 *
 * `style` may be a plain style or a style array; it's applied to the inner
 * Animated.View alongside the scale transform so existing layout styles are
 * preserved. Pass `disabled` to freeze the animation (no scale on press).
 */
import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** Style for the inner animated view (scale transform is composed on top). */
  style?: StyleProp<ViewStyle>;
  /** Press-in target scale. Defaults to the Aurora 0.96. */
  activeScale?: number;
  children?: React.ReactNode;
}

export function PressableScale({
  style,
  activeScale = 0.96,
  disabled,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(e) => {
        if (!disabled) {
          scale.value = withTiming(activeScale, { duration: 110 });
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!disabled) {
          scale.value = withTiming(1, { duration: 140 });
        }
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
