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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter, Link } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/store/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input, CtaButton, GlassCard } from '@/components/ui';
import { useTheme } from '@/theme';
import { spacing, borderRadius } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { isValidEmail, sanitizeInput } from '@/utils/validation';

const ZEITRA_LOGO = require('../../assets/images/zeitra-logo.png');

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
            // Guarantee clearance for the CTA + footer above the home indicator
            // and below the status bar, instead of relying on SafeAreaView edge
            // padding under a vertically-centered layout (matches register.tsx).
            {
              paddingTop: insets.top + spacing['4xl'],
              paddingBottom: insets.bottom + spacing['3xl'],
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Branded hero */}
          <Animated.View entering={enter(0)} style={styles.header}>
            <View
              style={[
                styles.logoBadge,
                {
                  backgroundColor: withAlpha(colors.accent.coral, 0.1),
                  borderColor: withAlpha(colors.accent.coral, 0.3),
                },
                shadows.glow(colors.accent.coral),
              ]}
            >
              <Image
                source={ZEITRA_LOGO}
                style={styles.logoImage}
                resizeMode="contain"
                accessibilityRole="image"
                accessibilityLabel="Zeitra"
              />
            </View>

            <Text style={[styles.kicker, { color: colors.accent.coral }]}>Zeitra</Text>
            <Text
              style={[styles.logo, { color: colors.text.primary }]}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.3}
            >
              Welcome <Text style={{ color: colors.accent.coral }}>back</Text>
            </Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              Fuel your shift. Pick up right where you left off.
            </Text>

            {/* Calm trust cue — secure sign-in, lime-on-ink chip */}
            <View
              style={[
                styles.trustChip,
                {
                  backgroundColor: colors.background.secondary,
                  borderColor: colors.border.default,
                },
              ]}
            >
              <Ionicons name="shield-checkmark" size={13} color={colors.accent.coral} />
              <Text style={[styles.trustText, { color: colors.text.tertiary }]}>
                Encrypted, private sign-in
              </Text>
            </View>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={enter(1)}>
            <GlassCard style={styles.form}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>
                  Sign in to your account
                </Text>
                <Text style={[styles.requiredHint, { color: colors.text.tertiary }]}>
                  <Text style={{ color: colors.accent.coral }}>*</Text> Required
                </Text>
              </View>

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
                label="Sign In"
                size="lg"
                icon="log-in-outline"
                loading={loading}
                onPress={handleLogin}
                style={styles.cta}
              />
            </GlassCard>
          </Animated.View>

          {/* Register link */}
          <Animated.View entering={enter(2)} style={styles.registerRow}>
            <Text style={[styles.registerText, { color: colors.text.secondary }]}>
              Don't have an account?{' '}
            </Text>
            <Link href="/(auth)/register" asChild>
              <Pressable
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="link"
                accessibilityLabel="Sign up for a new account"
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={[styles.registerLink, { color: colors.accent.coral }]}>
                  Sign Up
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    // paddingTop / paddingBottom are applied inline from safe-area insets.
  },
  header: {
    alignItems: 'flex-start',
    marginBottom: spacing['3xl'],
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  logoImage: {
    width: 42,
    height: 42,
  },
  kicker: {
    ...typography.overline,
    marginBottom: spacing.xs,
  },
  logo: {
    ...typography.display,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  subtitle: {
    // Real token (no hand-mixed family override): Inter Medium 15/22 reads as a
    // calm, non-bold subtitle and won't silently break if a token changes.
    ...typography.bodyMedium,
    marginTop: spacing.sm,
  },
  trustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginTop: spacing.lg,
  },
  trustText: {
    ...typography.caption,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  form: {
    padding: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.overline,
  },
  requiredHint: {
    ...typography.caption,
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
