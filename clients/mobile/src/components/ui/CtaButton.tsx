/**
 * CtaButton — the Zeitra primary call-to-action.
 *
 * A pressable filled with the shared `gradients.coralCta` token — the softened
 * electric-lime brand gradient (lime → deeper lime; "coral" is the legacy token
 * name, its value is now Zeitra lime). The label, leading icon and loading
 * spinner all render in INK (#0A0C12, the theme's text.inverse) — NEVER white:
 * the Zeitra brand forbids white-on-lime (too low contrast), so ink-on-lime is
 * the high-contrast, athletic recipe (no textShadow needed). A soft lime glow
 * halo and a gentle pressed scale complete it. Use it for the primary action on
 * a screen.
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
    paddingHorizontal: number;
    fontSize: number;
    icon: number;
    spinner: number | 'small' | 'large';
  }
> = {
  sm: { minHeight: 40, paddingVertical: 9, paddingHorizontal: 16, fontSize: 13, icon: 15, spinner: 15 },
  md: { minHeight: 48, paddingVertical: 13, paddingHorizontal: 20, fontSize: 15, icon: 17, spinner: 'small' },
  lg: { minHeight: 56, paddingVertical: 16, paddingHorizontal: 24, fontSize: 17, icon: 19, spinner: 19 },
};

export interface CtaButtonProps {
  onPress?: () => void;
  /** Button text. Rendered ink (#0A0C12) on the lime fill — never white. */
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
  /**
   * Flat matte-lime fill — a SOLID lime background (no gradient), NO glow halo,
   * a 16/600 label and a 15px radius. Matches the design mockups' flat lime
   * buttons (welcome / auth / onboarding / paywall). Default (false) keeps the
   * brand gradient + glow recipe so every existing caller renders unchanged.
   */
  flat?: boolean;
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
  flat = false,
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
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.btn,
        { minHeight: sz.minHeight, paddingVertical: sz.paddingVertical, paddingHorizontal: sz.paddingHorizontal },
        // Flat: solid lime fill + 15px radius, no glow. Default: brand glow halo.
        flat ? { backgroundColor: colors.accent.coral, borderRadius: 15 } : shadows.glow(colors.accent.coral),
        // Cap the pressed scale at 0.97 (never > 1, never < 0.97) so the tap
        // feedback is a subtle inset, matching the rest of Aurora.
        pressed && !isDisabled ? { transform: [{ scale: 0.97 }] } : null,
        isDisabled ? { opacity: 0.6 } : null,
        style,
      ]}
    >
      {!flat && (
        <LinearGradient
          colors={colors.gradients.coralCta}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      {loading ? (
        <ActivityIndicator size={sz.spinner} color="#0A0C12" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={sz.icon} color="#0A0C12" /> : null}
          <Text
            style={[styles.label, flat ? styles.labelFlat : { fontSize: sz.fontSize }]}
            maxFontSizeMultiplier={1.4}
          >
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
  // Ink label on the bright Zeitra lime fill — max contrast, athletic (no shadow).
  label: {
    color: '#0A0C12',
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  // Flat-variant label — the mockups' 16/600 matte-lime button text.
  labelFlat: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0,
  },
});
