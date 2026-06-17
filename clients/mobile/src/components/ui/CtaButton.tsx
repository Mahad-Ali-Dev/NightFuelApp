/**
 * CtaButton — the Aurora primary call-to-action.
 *
 * A coral→pink gradient-fill pressable that renders the shared
 * `gradients.coralCta` token (the AA-lifted coralDark→pink fill). It mirrors the
 * inline "Log Meal" recipe from app/(tabs)/index.tsx: white label with a subtle
 * textShadow for AA on the bright fill, a coral glow halo, and a gentle pressed
 * scale. Use it for the primary action on a screen.
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

export interface CtaButtonProps {
  onPress?: () => void;
  /** Button text. Rendered white with a subtle shadow for AA on the fill. */
  label: string;
  /** Optional leading Ionicons glyph name. */
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  /** Defaults to `label` when omitted. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function CtaButton({
  onPress,
  label,
  icon,
  loading = false,
  disabled = false,
  accessibilityLabel,
  style,
}: CtaButtonProps) {
  const { colors, shadows } = useTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.btn,
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
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={17} color="#fff" /> : null}
          <Text style={styles.label} maxFontSizeMultiplier={1.4}>
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
    paddingVertical: 13,
    borderRadius: 14,
    minHeight: 48,
    overflow: 'hidden',
  },
  // textShadow lifts the white label clear of the bright pink gradient end (AA).
  label: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
