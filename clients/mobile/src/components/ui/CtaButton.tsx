/**
 * CtaButton — the Aurora primary call-to-action.
 *
 * A coral→pink gradient-fill pressable that renders the shared
 * `gradients.coralCta` token (the AA-lifted coralDark→pink fill). It mirrors the
 * inline "Log Meal" recipe from app/(tabs)/index.tsx: white label with a subtle
 * textShadow for AA on the bright fill, a coral glow halo, and a gentle pressed
 * scale. Use it for the primary action on a screen.
 *
 * Sizes: `size` picks one of three footprints (sm / md / lg). 'md' is the
 * default and is byte-identical to the original single-size button (minHeight
 * 48 / fontSize 15 / paddingVertical 13 / icon 17), so existing callers that
 * pass no `size` render exactly as before. 'sm' and 'lg' scale the Pressable
 * (minHeight + paddingVertical), the label fontSize, the leading Ionicons glyph
 * and the loading ActivityIndicator together.
 *
 * a11y: exposes accessibilityRole="button", a label (falls back to `label`),
 * and accessibilityState.disabled. Disabled / loading both dim the fill and
 * block the press.
 */
import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';

/** Size footprint for the CTA. 'md' is the original (default) sizing. */
export type CtaButtonSize = 'sm' | 'md' | 'lg';

// Per-size sizing table. 'md' reproduces the original constants exactly
// (minHeight 48 / fontSize 15 / paddingVertical 13 / icon 17, spinner "small")
// so no existing/no-size caller shifts. 'sm'/'lg' scale the touch target,
// label, icon and spinner in step.
const SIZES: Record<
  CtaButtonSize,
  {
    minHeight: number;
    paddingVertical: number;
    fontSize: number;
    icon: number;
    spinner: number | 'small' | 'large';
  }
> = {
  sm: { minHeight: 40, paddingVertical: 9, fontSize: 13, icon: 15, spinner: 15 },
  md: { minHeight: 48, paddingVertical: 13, fontSize: 15, icon: 17, spinner: 'small' },
  lg: { minHeight: 56, paddingVertical: 16, fontSize: 17, icon: 19, spinner: 19 },
};

export interface CtaButtonProps {
  onPress?: () => void;
  /** Button text. Rendered white with a subtle shadow for AA on the fill. */
  label: string;
  /** Optional leading Ionicons glyph name. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Size footprint. Defaults to 'md' (the original sizing). */
  size?: CtaButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Defaults to `label` when omitted. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Optional test handle, forwarded verbatim to the root Pressable. */
  testID?: string;
}

export function CtaButton({
  onPress,
  label,
  icon,
  size = 'md',
  loading = false,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: CtaButtonProps) {
  const { colors, shadows } = useTheme();
  const isDisabled = disabled || loading;
  const sz = SIZES[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.btn,
        { minHeight: sz.minHeight, paddingVertical: sz.paddingVertical },
        shadows.glow(colors.accent.coral),
        // Cap the pressed scale at 0.97 (never > 1, never < 0.97) so the tap
        // feedback is a subtle inset, matching the rest of Aurora.
        pressed && !isDisabled ? { transform: [{ scale: 0.97 }] } : null,
        isDisabled ? { opacity: 0.6 } : null,
        style,
      ]}
    >
      <LinearGradient
        colors={colors.gradients.coralCta}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      {loading ? (
        <ActivityIndicator size={sz.spinner} color="#fff" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={sz.icon} color="#fff" /> : null}
          <Text style={[styles.label, { fontSize: sz.fontSize }]} maxFontSizeMultiplier={1.4}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    overflow: 'hidden',
  },
  // textShadow lifts the white label clear of the bright pink gradient end (AA).
  label: {
    color: '#fff',
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
