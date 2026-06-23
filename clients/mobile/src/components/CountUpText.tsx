/**
 * CountUpText — a tiny animated count-up numeral (Zeitra).
 *
 * Extracts the proven count-up idiom already used inside MealMacroSummary so any
 * screen can render a big condensed number that tweens from 0 → `value` on the
 * UI thread, with NO per-frame JS re-render. It drives an animated TextInput's
 * `text` prop via Reanimated `useSharedValue` + `withTiming` (the standard
 * cross-platform RN count-up target; no new dependency).
 *
 * PURE PRESENTATION — owns no data, fires nothing. Colors/typography are passed
 * in through `style` by the caller (which already reads `useTheme()` tokens), so
 * this component itself stays theme-agnostic. On-lime callers must pass ink, not
 * white, per the brand rule — but a count-up hero typically sits on dark glass.
 */
import React, { useEffect } from 'react';
import { TextInput, StyleSheet, type TextStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';

// TextInput is the cross-platform-safe target whose `text` prop Reanimated can
// drive from the UI thread without a JS re-render (mirrors MealMacroSummary).
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface CountUpTextProps {
  /** Target number to count up to (rounded each frame). */
  value: number;
  /** Text style (font, color, size) — caller passes theme-derived values. */
  style?: StyleProp<TextStyle>;
  /** Optional suffix appended to the number, e.g. 'g' or ' kcal'. */
  suffix?: string;
  /** Tween duration in ms. Default 700. */
  duration?: number;
  /** Optional spoken label for screen readers (defaults to the resolved value). */
  accessibilityLabel?: string;
}

/** A finite, non-negative number (defensive against NaN/undefined inputs). */
const clampNum = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

function CountUpTextComponent({
  value,
  style,
  suffix = '',
  duration = 700,
  accessibilityLabel,
}: CountUpTextProps) {
  const v = useSharedValue(0);
  const target = clampNum(value);

  useEffect(() => {
    v.value = withTiming(target, { duration, easing: Easing.out(Easing.cubic) });
  }, [target, duration, v]);

  const animatedProps = useAnimatedProps(() => {
    const n = Math.round(v.value);
    return { text: `${n}${suffix}`, defaultValue: `${n}${suffix}` } as any;
  });

  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      style={[styles.text, style]}
      // a11y: announce the resolved value as static text, not an editable field.
      accessible
      accessibilityLabel={accessibilityLabel ?? `${target}${suffix}`}
      value={`0${suffix}`}
      animatedProps={animatedProps}
      maxFontSizeMultiplier={1.3}
    />
  );
}

/** Memoized: props are primitives; re-renders only when `value`/`suffix` change. */
export const CountUpText = React.memo(CountUpTextComponent);

const styles = StyleSheet.create({
  // Tight metrics so the numeral aligns like real text, not an input field.
  text: { padding: 0, margin: 0, includeFontPadding: false as any, textAlignVertical: 'center' as any },
});
