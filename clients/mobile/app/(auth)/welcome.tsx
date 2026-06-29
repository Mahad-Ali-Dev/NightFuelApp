import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter, Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CtaButton } from '@/components/ui';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { withAlpha } from '@/theme/utils';

// Bundled model hero — the male athlete asset (mockup: welcome-preview.html).
const HERO = require('../../assets/images/hero-male-1.png');

// The first onboarding route (see app/(onboarding)/_layout.tsx — `metrics-goals`
// is the first Stack.Screen). "Get started" sends a brand-new visitor here so
// they begin the onboarding flow rather than landing on the sign-in form.
const FIRST_ONBOARDING_ROUTE = '/(onboarding)/metrics-goals' as const;

// Per-block entrance: a staggered FadeInDown spring (transform/opacity only, so
// it's cheap + interruptible). The wordmark, pager, headline, sub and the CTA
// stack cascade in ~70ms apart — premium, not all-at-once. Mirrors the login
// screen's `enter()` idiom so the two auth screens share one motion language.
const enter = (i: number) =>
  FadeInDown.springify().damping(18).mass(0.9).delay(90 + i * 70);

/**
 * Welcome — the unauthenticated landing screen (mockup: welcome-preview.html).
 *
 * The first thing a new visitor sees: the ZEITRA wordmark + tagline over a
 * full-bleed model hero (lime glow + dark legibility scrim), a decorative 3-dot
 * pager, the broadened headline "Fitness that runs on your rhythm" and its
 * sub, then the lime "Get started" CTA (→ onboarding) and a "Sign in" link
 * (→ the existing login screen). `app/index.tsx` routes unauthenticated users
 * here first; authenticated users still go straight to the tabs.
 *
 * Brand rules applied:
 *  - Colors come from `useTheme()` tokens — NO raw hex (the lime is
 *    `accent.coral`, which resolves to Zeitra lime; ink-on-lime CTA is owned by
 *    the shared CtaButton). The hero scrims are non-coral gradient tokens, so
 *    they are decorative fills, not CTAs.
 *  - The primary action is the shared `CtaButton` (the one sanctioned lime fill
 *    + ink label + glow + pressed scale + a11y) — never an inline gradient CTA.
 *  - Saira is the brand face (via `typography.*`).
 *  - Copy uses "Get started" / "Sign in" — never "Log in".
 *  - Reanimated v4 FadeInDown spring entrance.
 */
export default function WelcomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // Hero occupies the lower portion of the frame; sized from the viewport so it
  // scales across devices (the mockup draws it ~74% of the 760px frame).
  const heroHeight = Math.round(height * 0.72);

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <StatusBar style="light" />

      {/* ── Full-bleed hero backdrop ─────────────────────────────────────── */}
      {/* Lime-tinted radial-ish glow rising from behind the model (top → bg). */}
      <LinearGradient
        colors={[
          withAlpha(colors.accent.coral, 0.16),
          colors.background.secondary,
          colors.background.primary,
        ]}
        locations={[0, 0.52, 1]}
        start={{ x: 0.5, y: 0.18 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.heroWrap, { height: heroHeight }]} pointerEvents="none">
        <Image
          source={HERO}
          style={styles.heroImage}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="Zeitra athlete"
        />
      </View>
      {/* Top + bottom legibility scrim so the wordmark and the content copy read
          cleanly over the photo (fades the image into the background). */}
      <LinearGradient
        colors={[
          withAlpha(colors.background.primary, 0.8),
          'transparent',
          'transparent',
          withAlpha(colors.background.primary, 0.9),
          colors.background.primary,
        ]}
        locations={[0, 0.24, 0.42, 0.66, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Wordmark + tagline (top) ─────────────────────────────────────── */}
      <Animated.View
        entering={enter(0)}
        style={[styles.brandBlock, { paddingTop: insets.top + spacing['4xl'] }]}
      >
        <ZeitraWordmark limeColor={colors.accent.coral} textColor={colors.text.primary} />
        <Text
          style={[styles.tagline, { color: colors.text.secondary }]}
          maxFontSizeMultiplier={1.3}
        >
          STRONG TODAY · BETTER EVERYDAY
        </Text>
      </Animated.View>

      {/* ── Content (bottom) ─────────────────────────────────────────────── */}
      <View style={[styles.content, { paddingBottom: insets.bottom + spacing['2xl'] }]}>
        {/* Decorative pager — 3 dots, first one the active lime pill. */}
        <Animated.View
          entering={enter(1)}
          style={styles.pager}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={[styles.dotActive, { backgroundColor: colors.accent.coral }]} />
          <View style={[styles.dot, { backgroundColor: withAlpha(colors.text.primary, 0.28) }]} />
          <View style={[styles.dot, { backgroundColor: withAlpha(colors.text.primary, 0.28) }]} />
        </Animated.View>

        <Animated.Text
          entering={enter(2)}
          style={[styles.headline, { color: colors.text.primary }]}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.25}
        >
          Fitness that runs{'\n'}on your rhythm
        </Animated.Text>

        <Animated.Text
          entering={enter(3)}
          style={[styles.subtitle, { color: '#C7C9CF' }]}
          maxFontSizeMultiplier={1.4}
        >
          Eat, train and sleep in sync with your body — your schedule, your
          energy, even your cycle.
        </Animated.Text>

        <Animated.View entering={enter(4)} style={styles.actions}>
          <CtaButton
            label="Get started"
            size="lg"
            flat
            onPress={() => router.push(FIRST_ONBOARDING_ROUTE)}
            style={styles.cta}
            testID="welcome-get-started-cta"
          />

          <View style={styles.signInRow}>
            <Text
              style={[styles.signInText, { color: '#C7C9CF' }]}
              maxFontSizeMultiplier={1.4}
            >
              Already have an account?{' '}
            </Text>
            <Link href="/(auth)/login" asChild>
              <Pressable
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                accessibilityRole="link"
                accessibilityLabel="Sign in to your account"
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={[styles.signInLink, { color: colors.accent.coral }]}>
                  Sign in
                </Text>
              </Pressable>
            </Link>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * ZeitraWordmark — the lockup the mockup draws in CSS: the cap "Z", three short
 * lime bars (the brand mark), then "ITRA". Rendered from theme tokens so it
 * tracks the active palette and stays crisp at any scale (the bundled
 * `logo_app.png` is the rounded APP ICON, not the wordmark, so the wordmark is
 * composed here exactly like the mockup). Marked as a single image to assistive
 * tech so it announces "Zeitra" rather than spelling the glyphs.
 */
function ZeitraWordmark({ limeColor, textColor }: { limeColor: string; textColor: string }) {
  return (
    <View
      style={styles.wordmark}
      accessibilityRole="image"
      accessibilityLabel="Zeitra"
    >
      <Text style={[styles.wordmarkText, { color: textColor }]} maxFontSizeMultiplier={1.2}>
        Z
      </Text>
      <View style={styles.wordmarkBars}>
        <View style={[styles.wordmarkBar, { backgroundColor: limeColor }]} />
        <View style={[styles.wordmarkBar, { backgroundColor: limeColor }]} />
        <View style={[styles.wordmarkBar, { backgroundColor: limeColor }]} />
      </View>
      <Text style={[styles.wordmarkText, { color: textColor }]} maxFontSizeMultiplier={1.2}>
        ITRA
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Hero photo pinned to the bottom of the frame, centered horizontally.
  heroWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  heroImage: {
    height: '100%',
    width: '100%',
  },

  // Wordmark + tagline.
  brandBlock: {
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  wordmarkText: {
    ...typography.display,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  wordmarkBars: {
    gap: 4,
  },
  wordmarkBar: {
    width: 20,
    height: 4,
    borderRadius: 2,
  },
  tagline: {
    ...typography.overline,
    fontSize: 10,
    letterSpacing: 2.5,
    marginTop: spacing.md,
    textAlign: 'center',
  },

  // Bottom content stack.
  content: {
    marginTop: 'auto',
    paddingHorizontal: spacing['2xl'],
    alignItems: 'center',
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginBottom: spacing['2xl'],
  },
  dotActive: {
    width: 22,
    height: 6,
    borderRadius: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headline: {
    ...typography.display,
    fontSize: 31,
    lineHeight: 35,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodySm,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  actions: {
    alignSelf: 'stretch',
    marginTop: spacing['2xl'] + spacing.xs,
  },
  cta: {
    width: '100%',
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: spacing.lg,
  },
  signInText: {
    ...typography.bodySm,
  },
  signInLink: {
    ...typography.bodySm,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
});
