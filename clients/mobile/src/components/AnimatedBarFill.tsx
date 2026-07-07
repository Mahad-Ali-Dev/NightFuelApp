/**
 * AnimatedBarFill — a Reanimated width-growing progress fill (Aurora/Zeitra).
 *
 * Local helper for gamified progress bars. Instead of a hardcoded-width <View>
 * that pops in at full length, the fill's width animates from 0% up to the
 * target percent with Reanimated (withTiming, ~800ms ease-out) on mount and on
 * value change — a premium bar grows, it doesn't appear.
 *
 * It renders an Animated.View whose animated width is composed onto any style
 * the caller passes, and forwards `children` so a gradient fill (or any inner
 * content) can live inside it. Pure presentation; owns no data.
 */
import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface AnimatedBarFillProps {
  /** Target fill, 0–100 (percent of track). */
  percent: number;
  /** Style for the fill (height/color/radius). Width is composed on top. */
  style?: StyleProp<ViewStyle>;
  /** Sweep duration in ms. */
  duration?: number;
  children?: React.ReactNode;
}

export function AnimatedBarFill({
  percent,
  style,
  duration = 800,
  children,
}: AnimatedBarFillProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(clamped, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [clamped, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
