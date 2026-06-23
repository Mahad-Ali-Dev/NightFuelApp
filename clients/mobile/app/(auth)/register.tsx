import React, { useMemo, useState } from 'react';
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/store/authStore';
import { useRouter, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input, CtaButton, GlassCard } from '@/components/ui';
import { useTheme } from '@/theme';
import { spacing, borderRadius } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { withAlpha } from '@/theme/utils';
import {
  isValidEmail,
  isStrongPassword,
  sanitizeInput,
  normalizeEmail,
  passwordIssues,
} from '@/utils/validation';

// Brand mark — the Zeitra lime logo asset (same source login.tsx uses) so the
// primary signup screen carries the real mark, not a generic glyph.
const ZEITRA_LOGO = require('../../assets/images/zeitra-logo.png');

// Staggered entrance: FadeInDown with SPRING physics (not duration/linear) so
// each block settles with a little overshoot. Keeps the original 60ms stagger
// deltas (delay 0 / 60 / 120 / 180 / 240) — back button, header, form, CTA,
// login row cascade in. Transform/opacity only → cheap + interruptible.
const enter = (delay: number) =>
  FadeInDown.delay(delay).springify().damping(16).mass(0.9);

export default function RegisterScreen() {
  const { colors, shadows } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { register } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Per-field inline errors, surfaced BELOW each field on blur (forms best-practice:
  // validate-on-blur + recovery path). Independent of the form-level `error` pill,
  // which still fronts server failures and the "fill all fields" guard.
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const setFieldError = (field: keyof typeof fieldErrors, message?: string) =>
    setFieldErrors(prev => ({ ...prev, [field]: message }));

  const validateName = () => {
    const clean = sanitizeInput(name);
    setFieldError('name', clean ? undefined : 'Please enter your name');
  };
  const validateEmail = () => {
    const clean = normalizeEmail(sanitizeInput(email));
    if (!clean) return setFieldError('email', 'Email is required');
    setFieldError('email', isValidEmail(clean) ? undefined : 'Enter a valid email address');
  };
  const validatePassword = () => {
    if (!password) return setFieldError('password', 'Password is required');
    setFieldError(
      'password',
      isStrongPassword(password) ? undefined : 'Password does not meet the requirements below',
    );
  };
  const validateConfirm = () => {
    if (!confirmPassword) return setFieldError('confirmPassword', 'Please re-enter your password');
    setFieldError(
      'confirmPassword',
      password === confirmPassword ? undefined : 'Passwords do not match',
    );
  };

  // Surface a validation/error message both visually (the error pill) and to
  // screen readers. liveRegion handles TalkBack on Android; announceForAccessibility
  // is what reaches VoiceOver on iOS (liveRegion is Android-only), so we fire both.
  const fail = (message: string) => {
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
  };

  const handleRegister = async () => {
    const cleanName = sanitizeInput(name);
    // Lowercase + trim the email exactly like the backend does before it is
    // stored/looked up, so the client never submits a value the server would
    // normalize differently. sanitizeInput first strips any stray HTML.
    const cleanEmail = normalizeEmail(sanitizeInput(email));
    if (!cleanName || !cleanEmail || !password) {
      fail('Please fill in all fields');
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      fail('Please enter a valid email address');
      return;
    }
    if (password !== confirmPassword) {
      fail('Passwords do not match');
      return;
    }
    if (!isStrongPassword(password)) {
      fail('Password must be at least 8 characters with a number and uppercase letter');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await register({
        displayName: cleanName,
        email: cleanEmail,
        password,
        region: 'US' // Defaulting to US, ideally we'd ask the user or detect it
      });
      router.replace('/(onboarding)/metrics-goals');
    } catch (e: any) {
      fail(e?.message ?? 'Registration failed. Please try again.');
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
            { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing['3xl'] },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          <Animated.View entering={enter(0)}>
            <Pressable
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backBtn,
                {
                  backgroundColor: colors.background.secondary,
                  borderColor: colors.border.default,
                },
                // Physical tap feedback: scale + dim (not opacity-only). 0.94
                // reads well on this 44pt control.
                pressed && styles.backBtnPressed,
              ]}
            >
              <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
            </Pressable>
          </Animated.View>

          {/* Header — Zeitra logo badge + big bold display title (matches login brand language) */}
          <Animated.View entering={enter(60)} style={styles.header}>
            <View
              style={[
                styles.logoBadge,
                {
                  backgroundColor: withAlpha(colors.accent.coral, 0.12),
                  borderColor: withAlpha(colors.accent.coral, 0.35),
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
            <Text style={[styles.kicker, { color: colors.accent.coral }]}>Get started</Text>
            <Text
              style={[styles.title, { color: colors.text.primary }]}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.3}
            >
              Create your{'\n'}
              <Text style={{ color: colors.accent.coral }}>account</Text>
            </Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              Start optimizing your shift nutrition today
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={enter(120)}>
            <GlassCard style={styles.formCard}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>
                  Your details
                </Text>
                <Text style={[styles.requiredHint, { color: colors.text.tertiary }]}>
                  <Text style={{ color: colors.accent.coral }}>*</Text> Required
                </Text>
              </View>

              <FieldLabel text="Full Name" required colors={colors} />
              <Input
                placeholder="John Doe"
                value={name}
                onChangeText={text => {
                  setName(text);
                  if (fieldErrors.name) setFieldError('name', undefined);
                }}
                onBlur={validateName}
                error={fieldErrors.name}
                icon="person-outline"
                autoCapitalize="words"
                textContentType="name"
                returnKeyType="next"
              />

              <FieldLabel text="Email" required colors={colors} />
              <Input
                placeholder="you@example.com"
                value={email}
                onChangeText={text => {
                  setEmail(text);
                  if (fieldErrors.email) setFieldError('email', undefined);
                }}
                onBlur={validateEmail}
                error={fieldErrors.email}
                icon="mail-outline"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                returnKeyType="next"
              />

              <FieldLabel text="Password" required colors={colors} />
              <Input
                placeholder="Min 8 characters"
                value={password}
                onChangeText={text => {
                  setPassword(text);
                  if (fieldErrors.password) setFieldError('password', undefined);
                }}
                onBlur={validatePassword}
                error={fieldErrors.password}
                icon="lock-closed-outline"
                secureTextEntry={!showPassword}
                rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onRightIconPress={() => setShowPassword(!showPassword)}
                rightIconAccessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                rightIconActive={showPassword}
                textContentType="newPassword"
                returnKeyType="next"
              />

              {password.length > 0 && <PasswordStrength password={password} />}

              <FieldLabel text="Confirm Password" required colors={colors} />
              <Input
                placeholder="Repeat your password"
                value={confirmPassword}
                onChangeText={text => {
                  setConfirmPassword(text);
                  if (fieldErrors.confirmPassword) setFieldError('confirmPassword', undefined);
                }}
                onBlur={validateConfirm}
                error={fieldErrors.confirmPassword}
                icon="shield-checkmark-outline"
                secureTextEntry={!showPassword}
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleRegister}
              />

              {/* Live "passwords match" affirmation (recovery-positive, color is NOT the only signal) */}
              {confirmPassword.length > 0 &&
              password === confirmPassword &&
              !fieldErrors.confirmPassword ? (
                <View style={styles.matchRow} accessibilityRole="text" accessibilityLabel="Passwords match">
                  <Ionicons name="checkmark-circle" size={14} color={colors.accent.emerald} />
                  <Text style={[styles.matchText, { color: colors.accent.emerald }]}>
                    Passwords match
                  </Text>
                </View>
              ) : null}

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
            </GlassCard>
          </Animated.View>

          {/* Primary CTA — outside the GlassCard so the coral glow halo reads on the dark bg */}
          <Animated.View entering={enter(180)}>
            <CtaButton
              label="Create Account"
              size="lg"
              icon="rocket-outline"
              loading={loading}
              onPress={handleRegister}
              style={styles.cta}
            />
          </Animated.View>

          {/* Login link */}
          <Animated.View entering={enter(240)} style={styles.loginRow}>
            <Text style={[styles.loginText, { color: colors.text.secondary }]}>
              Already have an account?{' '}
            </Text>
            <Link href="/(auth)/login" asChild>
              <Pressable
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="link"
                accessibilityLabel="Sign in to an existing account"
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={[styles.loginLink, { color: colors.accent.coral }]}>Sign In</Text>
              </Pressable>
            </Link>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Visible, required-marked field label (forms best-practice: label not placeholder-only). */
function FieldLabel({
  text,
  required,
  colors,
}: {
  text: string;
  required?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>
      {text}
      {required ? <Text style={{ color: colors.accent.coral }}> *</Text> : null}
    </Text>
  );
}

/**
 * Password strength meter — an animated 3-segment bar + a labeled tier, backed by
 * the same `passwordIssues` rules the submit guard uses, followed by the explicit
 * requirement checklist (so strength is never signalled by color alone).
 */
function PasswordStrength({ password }: { password: string }) {
  const { colors } = useTheme();

  const rules = useMemo(
    () => [
      { label: 'At least 8 characters', met: password.length >= 8 },
      { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
      { label: 'One number (0-9)', met: /[0-9]/.test(password) },
    ],
    [password],
  );

  // Met-count drives the tier. `passwordIssues` is the source of truth for the
  // submit guard; we derive the score from it so the meter and the guard agree.
  const metCount = 3 - passwordIssues(password).length;
  const tier =
    metCount >= 3
      ? { label: 'Strong', color: colors.accent.emerald }
      : metCount === 2
      ? { label: 'Fair', color: colors.warning }
      : { label: 'Weak', color: colors.error };

  return (
    <View
      style={[
        styles.strengthCard,
        {
          backgroundColor: withAlpha(colors.text.primary, 0.04),
          borderColor: colors.border.default,
        },
      ]}
    >
      <View style={styles.strengthHeader}>
        <Text style={[styles.strengthLabel, { color: colors.text.tertiary }]}>
          Password strength
        </Text>
        <Text
          style={[styles.strengthTier, { color: tier.color }]}
          accessibilityLabel={`Password strength: ${tier.label}`}
        >
          {tier.label}
        </Text>
      </View>

      {/* Segmented strength bar — transform/opacity-free, width-tiered fill per segment */}
      <View style={styles.strengthTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map(i => (
          <View
            key={i}
            style={[
              styles.strengthSeg,
              { backgroundColor: withAlpha(colors.text.primary, 0.08) },
            ]}
          >
            {i < metCount ? (
              <Animated.View
                entering={FadeInDown.springify().damping(15).mass(0.7)}
                style={[styles.strengthSegFill, { backgroundColor: tier.color }]}
              />
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.pwReqs}>
        {rules.map(rule => (
          <View
            key={rule.label}
            style={styles.pwReqRow}
            accessibilityRole="text"
            accessibilityLabel={`${rule.label}, ${rule.met ? 'met' : 'not met'}`}
          >
            <Ionicons
              name={rule.met ? 'checkmark-circle' : 'ellipse-outline'}
              size={14}
              color={rule.met ? colors.accent.emerald : colors.text.tertiary}
            />
            <Text
              style={[
                styles.pwReqText,
                { color: rule.met ? colors.text.secondary : colors.text.tertiary },
              ]}
            >
              {rule.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing['2xl'],
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  header: {
    marginBottom: spacing['2xl'],
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  logoImage: {
    width: 34,
    height: 34,
  },
  kicker: {
    ...typography.overline,
    marginBottom: spacing.sm,
  },
  // Title intentionally mirrors login.tsx's display treatment (40/46/-1) so the
  // two auth screens share an identical brand wordmark size — a deliberate,
  // documented override (the raw typography.display token is 36/44; login runs
  // it at 40, and we match login here rather than the bare token).
  title: {
    ...typography.display,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1,
  },
  subtitle: {
    ...typography.body,
    marginTop: spacing.sm,
  },
  formCard: {
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
  fieldLabel: {
    ...typography.captionMedium,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  pressed: {
    opacity: 0.6,
  },
  // Back button: scale + dim so the primary touch affordance feels physical
  // (not opacity-only). 0.94 reads well on a 44pt control.
  backBtnPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.94 }],
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  matchText: {
    ...typography.caption,
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
    marginTop: spacing.xl,
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing['3xl'],
  },
  loginText: {
    ...typography.body,
  },
  loginLink: {
    ...typography.body,
    fontWeight: '700',
  },
  // Password strength
  strengthCard: {
    marginTop: -spacing.xs,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  strengthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  strengthLabel: {
    ...typography.overline,
    fontSize: 10,
    letterSpacing: 1,
  },
  strengthTier: {
    ...typography.captionMedium,
    fontWeight: '700',
  },
  strengthTrack: {
    flexDirection: 'row',
    gap: 6,
  },
  strengthSeg: {
    flex: 1,
    height: 5,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  strengthSegFill: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.full,
  },
  pwReqs: {
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  pwReqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pwReqText: {
    ...typography.caption,
  },
});
