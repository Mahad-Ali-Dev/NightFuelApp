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
import { withAlpha, isLightHex } from '@/theme/utils';
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
  /**
   * When true (and no `glow`), lifts the card with an elevation shadow
   * (`shadows.lg`) + a slightly brighter hairline rim — so bare content cards
   * (e.g. the exercise detail sections) read raised instead of flat. The rim is
   * what carries the lift on near-black surfaces; the cast adds depth on light.
   */
  shadow?: boolean;
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

export function GlassCard({
  children,
  style,
  intensity = 40,
  tint,
  glow,
  shadow,
  radius,
  testID,
}: GlassCardProps) {
  const { colors, borderRadius, shadows } = useTheme();
  const r = radius ?? borderRadius['2xl'];
  const effectiveTint = tint ?? (isLightHex(colors.background.primary) ? 'light' : 'dark');
  const lifted = shadow && !glow;

  return (
    <View
      testID={testID}
      style={[
        {
          borderRadius: r,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: withAlpha(colors.text.primary, lifted ? 0.14 : 0.1),
        },
        glow ? shadows.glow(glow) : lifted ? shadows.lg : null,
        style,
      ]}
    >
      <SafeBlurView tint={effectiveTint} intensity={intensity} style={{ borderWidth: 0 }}>
        {children}
      </SafeBlurView>
    </View>
  );
}
