import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Image,
  AccessibilityInfo,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter, Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/store/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input, CtaButton } from '@/components/ui';
import { useTheme } from '@/theme';
import { spacing, borderRadius } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { withAlpha } from '@/theme/utils';
import { isValidEmail, sanitizeInput } from '@/utils/validation';

// Hero model — bundled female athlete asset (mockup: login-preview.html).
const HERO_FEMALE = require('../../assets/images/hero-female-1.png');

// Per-item entrance: a staggered FadeInDown spring. Each block enters ~45ms
// after the previous so the hero, form, CTA and footer cascade in (premium,
// not all-at-once). Spring physics + transform/opacity only keeps it cheap and
// interruptible.
const enter = (i: number) =>
  FadeInDown.springify().damping(18).mass(0.9).delay(80 + i * 45);

export default function LoginScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Inline, per-field validation surfaced on blur (recovery-friendly: each
  // message sits directly below its field, not in the submit pill). This mirrors
  // register.tsx so the two auth screens speak the same forms language.
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const { login } = useAuthStore();

  // Validate the email on blur so the user gets early, in-context feedback and
  // a clear recovery path before they ever press Sign In. Empty stays silent —
  // "required" is the submit-time concern.
  const handleEmailBlur = () => {
    const cleanEmail = sanitizeInput(email);
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      setEmailError('Enter a valid email, e.g. you@example.com');
    } else {
      setEmailError('');
    }
  };

  // Password on-blur validation to match register's per-field UX. The only
  // client-side rule a sign-in password must satisfy is "not empty"; surface
  // that below the field so the user recovers in-context rather than at submit.
  const handlePasswordBlur = () => {
    setPasswordError(password ? '' : 'Password is required');
  };

  const handleLogin = async () => {
    const cleanEmail = sanitizeInput(email);
    if (!cleanEmail || !password) {
      setError('Please fill in all fields');
      AccessibilityInfo.announceForAccessibility('Please fill in all fields');
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      setError('Please enter a valid email address');
      AccessibilityInfo.announceForAccessibility('Please enter a valid email address');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(cleanEmail, password);
      // Let app/index.tsx decide: onboarding vs tabs based on onboardingComplete
      router.replace('/');
    } catch (e: any) {
      const message = e?.message ?? 'Login failed. Please try again.';
      setError(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      setLoading(false);
    }
  };

  // Social sign-in is not yet provisioned (no Apple/Google provider wired in this
  // build). The buttons are part of the design; rather than silently no-op, give
  // an honest, accessible "coming soon" cue via the same error surface.
  const handleSocial = (provider: 'Apple' | 'Google') => {
    const message = `${provider} sign-in is coming soon.`;
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
  };

  // Full-bleed hero width: cancel the ScrollView's horizontal padding so the band
  // spans edge to edge under the rounded form card.
  const heroWidth = width;

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            // Bottom clearance for the CTA + footer above the home indicator.
            { paddingBottom: insets.bottom + spacing['3xl'] },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero band — female athlete + dark gradient fade + overlaid title */}
          <Animated.View
            entering={enter(0)}
            style={[
              styles.hero,
              { width: heroWidth, marginLeft: -spacing['2xl'], marginRight: -spacing['2xl'] },
            ]}
          >
            <LinearGradient
              colors={[withAlpha(colors.accent.coral, 0.16), colors.background.secondary, colors.background.primary]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <Image
              source={HERO_FEMALE}
              style={styles.heroImage}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel="Zeitra"
            />
            {/* Fade the image down into the background so the title reads cleanly */}
            <LinearGradient
              colors={[
                withAlpha(colors.background.primary, 0.33),
                'transparent',
                withAlpha(colors.background.primary, 0.73),
                colors.background.primary,
              ]}
              locations={[0, 0.3, 0.78, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[styles.heroCopy, { paddingTop: insets.top }]}>
              <Text
                style={[styles.heroTitle, { color: colors.text.primary }]}
                accessibilityRole="header"
                maxFontSizeMultiplier={1.3}
              >
                Welcome back
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.text.secondary }]}>
                Sign in to keep your streak going 🔥
              </Text>
            </View>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={enter(1)} style={styles.form}>
            <Text
              style={[styles.fieldLabel, { color: colors.text.secondary }]}
              maxFontSizeMultiplier={1.4}
            >
              Email <Text style={{ color: colors.accent.coral }}>*</Text>
            </Text>
            <Input
              placeholder="you@example.com"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (emailError) setEmailError('');
              }}
              onBlur={handleEmailBlur}
              error={emailError || undefined}
              icon="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />

            {/* Password field. The show/hide toggle is rendered as a
                dedicated 44x44 overlay (PasswordToggle) rather than the Input
                primitive's rightIcon, whose ~28px tap area is sub-44pt — and
                the primitive is shared, so it is fixed here on-screen instead.
                The label is rendered locally (with an explicit lineHeight) so
                the input box sits at a deterministic offset the overlay can
                anchor to; the TextInput reserves room via paddingRight. */}
            <View style={styles.passwordField}>
              <Text
                style={[styles.fieldLabel, { color: colors.text.secondary }]}
                maxFontSizeMultiplier={1.4}
              >
                Password <Text style={{ color: colors.accent.coral }}>*</Text>
              </Text>
              <Input
                placeholder="Enter your password"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (passwordError) setPasswordError('');
                }}
                onBlur={handlePasswordBlur}
                error={passwordError || undefined}
                icon="lock-closed-outline"
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
              />
              <PasswordToggle
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                tintColor={colors.text.tertiary}
                pressedColor={colors.accent.coral}
              />
            </View>

            <Link href="/(auth)/forgot-password" asChild>
              <Pressable
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="link"
                accessibilityLabel="Forgot password"
                style={({ pressed }) => [styles.forgotLink, pressed && styles.pressed]}
              >
                <Text style={[styles.forgotText, { color: colors.accent.coral }]}>
                  Forgot password?
                </Text>
              </Pressable>
            </Link>

            {error ? (
              <View
                style={[
                  styles.errorBox,
                  {
                    backgroundColor: withAlpha(colors.error, 0.1),
                    borderColor: withAlpha(colors.error, 0.25),
                  },
                ]}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
              >
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            ) : null}

            <CtaButton
              label="Sign in"
              size="lg"
              icon="log-in-outline"
              loading={loading}
              onPress={handleLogin}
              style={styles.cta}
            />

            {/* "or continue with" divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border.default }]} />
              <Text style={[styles.dividerText, { color: colors.text.tertiary }]}>
                or continue with
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border.default }]} />
            </View>

            {/* Social auth — Apple + Google */}
            <View style={styles.socialRow}>
              <SocialButton
                provider="Apple"
                icon="logo-apple"
                onPress={() => handleSocial('Apple')}
                colors={colors}
              />
              <SocialButton
                provider="Google"
                icon="logo-google"
                onPress={() => handleSocial('Google')}
                colors={colors}
              />
            </View>
          </Animated.View>

          {/* Register link */}
          <Animated.View entering={enter(2)} style={styles.registerRow}>
            <Text style={[styles.registerText, { color: colors.text.secondary }]}>
              New to Zeitra?{' '}
            </Text>
            <Link href="/(auth)/register" asChild>
              <Pressable
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="link"
                accessibilityLabel="Create a new account"
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={[styles.registerLink, { color: colors.accent.coral }]}>
                  Create account
                </Text>
              </Pressable>
            </Link>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * SocialButton — a dark, outlined provider button (Apple / Google) matching the
 * mockup's `.soc` chips. Icon + label, 44pt+ tall, transform/opacity pressed
 * feedback and full a11y wiring.
 */
function SocialButton({
  provider,
  icon,
  onPress,
  colors,
}: {
  provider: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Continue with ${provider}`}
      style={({ pressed }) => [
        styles.social,
        {
          backgroundColor: colors.background.secondary,
          borderColor: colors.border.default,
        },
        pressed && styles.socialPressed,
      ]}
    >
      <Ionicons name={icon} size={19} color={colors.text.primary} />
      <Text style={[styles.socialText, { color: colors.text.primary }]}>{provider}</Text>
    </Pressable>
  );
}

/**
 * PasswordToggle — a self-contained show/hide control for the password field.
 *
 * Rendered as a 44x44 overlay anchored to the right edge of the Input box (the
 * box is 52px tall; the toggle centers on it) so it meets the >=44pt touch
 * target the shared Input primitive's rightIcon does not, without editing that
 * primitive. transform/opacity-only pressed feedback; full a11y wiring.
 */
function PasswordToggle({
  visible,
  onToggle,
  tintColor,
  pressedColor,
}: {
  visible: boolean;
  onToggle: () => void;
  tintColor: string;
  pressedColor: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      accessibilityState={{ selected: visible }}
      style={styles.pwToggle}
    >
      {({ pressed }) => (
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={pressed ? pressedColor : tintColor}
        />
      )}
    </Pressable>
  );
}

const HERO_HEIGHT = 252;

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing['2xl'],
    // paddingBottom is applied inline from safe-area insets.
  },
  hero: {
    height: HERO_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    marginBottom: spacing.lg,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    height: HERO_HEIGHT + 78,
    width: '100%',
  },
  heroCopy: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.lg,
  },
  heroTitle: {
    ...typography.display,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    ...typography.bodyMedium,
    marginTop: spacing.xs,
  },
  form: {
    paddingTop: spacing.xs,
  },
  // Visible, required-marked field label (forms best-practice: label not
  // placeholder-only), rendered locally so it stays consistent across Email and
  // Password and so the password input box sits at a known, fixed offset that
  // the 44pt PasswordToggle overlay can anchor to. lineHeight is explicit (16)
  // so that offset does not drift with platform font metrics.
  fieldLabel: {
    ...typography.captionMedium,
    fontSize: 13,
    lineHeight: 16,
    marginBottom: spacing.xs,
  },
  passwordField: {
    position: 'relative',
  },
  // Reserve trailing room inside the TextInput so password text never slides
  // under the toggle (icon 20 + its visual padding within the 44pt target).
  passwordInput: {
    paddingRight: 40,
  },
  // 44x44 tap target, anchored to the right edge of the 52px input box and
  // vertically centered on it. top = fieldLabel block (lineHeight 16 + marginBottom
  // xs 4 = 20) + (52 - 44) / 2 = 24. right nudged so the 20px glyph optically
  // matches the field's 16px inner padding.
  pwToggle: {
    position: 'absolute',
    top: 24,
    right: spacing.sm,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: -spacing.sm,
    marginBottom: spacing.xl,
  },
  forgotText: {
    ...typography.bodySm,
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  errorText: {
    ...typography.bodySm,
    flex: 1,
  },
  cta: {
    width: '100%',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    ...typography.caption,
  },
  socialRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  social: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 50,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  socialPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  socialText: {
    ...typography.bodySm,
    fontWeight: '600',
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing['3xl'],
  },
  registerText: {
    ...typography.body,
  },
  registerLink: {
    ...typography.body,
    fontWeight: '700',
  },
});
