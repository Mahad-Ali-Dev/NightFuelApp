/**
 * GlassCard — the Aurora dark-glass surface primitive.
 *
 * A drop-in for the inline pattern duplicated across screens
 * (community.tsx / nutrition.tsx etc.):
 *
 *   <View style={{ borderRadius: borderRadius['2xl'], overflow: 'hidden',
 *                  borderWidth: 1, borderColor: withAlpha(colors.text.primary, 0.1) }}>
 *     <SafeBlurView tint="dark" intensity={40} style={…}>{children}</SafeBlurView>
 *   </View>
 *
 * The outer View owns the Aurora hairline border + radius + clipping (and an
 * optional soft glow); the inner SafeBlurView owns the frosted fill. We clip on
 * the outer View (overflow:'hidden') so the blur honours the rounded corners on
 * both iOS and Android, and keep the SafeBlurView border-less so the hairline
 * never doubles up.
 *
 * SafeBlurView (not raw BlurView) keeps Android < 12 from crashing — it falls
 * back to a matching semi-opaque View there.
 */
import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { SafeBlurView } from '@/components/SafeBlurView';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import type { BlurViewProps } from 'expo-blur';

export interface GlassCardProps {
  children?: React.ReactNode;
  /** Outer wrapper style (margins, width, padding overrides, etc.). */
  style?: StyleProp<ViewStyle>;
  /** Blur strength passed through to SafeBlurView. Default 40 (Aurora glass). */
  intensity?: number;
  /** Blur tint passed through to SafeBlurView. Default 'dark'. */
  tint?: BlurViewProps['tint'];
  /** When set, applies a soft `shadows.glow(glow)` halo on the wrapper. */
  glow?: string;
  /** Corner radius. Default borderRadius['2xl'] (24) — the Aurora card radius. */
  radius?: number;
  /**
   * Optional test handle, forwarded verbatim to the outer wrapper `<View>`.
   * Inert in production (testIDs are not rendered); defaults to `undefined`, so
   * every existing caller stays byte-identical and the wrapper receives
   * `testID={undefined}` exactly as before. Lets test suites grab a specific
   * glass surface without asserting on its body copy.
   */
  testID?: string;
}

/** True when a #RRGGBB background reads as a light surface (→ light blur tint). */
function isLightHex(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
}

export function GlassCard({
  children,
  style,
  intensity = 40,
  tint,
  glow,
  radius,
  testID,
}: GlassCardProps) {
  const { colors, borderRadius, shadows } = useTheme();
  const r = radius ?? borderRadius['2xl'];
  const effectiveTint = tint ?? (isLightHex(colors.background.primary) ? 'light' : 'dark');

  return (
    <View
      testID={testID}
      style={[
        {
          borderRadius: r,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: withAlpha(colors.text.primary, 0.1),
        },
        glow ? shadows.glow(glow) : null,
        style,
      ]}
    >
      <SafeBlurView tint={effectiveTint} intensity={intensity} style={{ borderWidth: 0 }}>
        {children}
      </SafeBlurView>
    </View>
  );
}
