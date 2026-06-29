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
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/store/authStore';
import { useRouter, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input, CtaButton } from '@/components/ui';
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

// Hero model — bundled male athlete asset (mockup: signup-preview.html).
const HERO_MALE = require('../../assets/images/hero-male-2.png');

// Staggered entrance: FadeInDown with SPRING physics (not duration/linear) so
// each block settles with a little overshoot. Keeps the original 60ms stagger
// deltas (delay 0 / 60 / 120 / 180 / 240) — hero, form, CTA, login row cascade
// in. Transform/opacity only → cheap + interruptible.
const enter = (delay: number) =>
  FadeInDown.delay(delay).springify().damping(16).mass(0.9);

export default function RegisterScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const { register } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Terms & Privacy consent. Gates submission (a standard signup requirement);
  // surfaced as the mockup's checkbox row. Defaults to unchecked.
  const [termsAccepted, setTermsAccepted] = useState(false);

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
    if (!termsAccepted) {
      fail('Please accept the Terms & Privacy Policy to continue');
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

  // Social sign-up is not yet provisioned (no Apple/Google provider wired in this
  // build). The buttons are part of the design; rather than silently no-op, give
  // an honest, accessible "coming soon" cue via the same error surface.
  const handleSocial = (provider: 'Apple' | 'Google') => {
    fail(`${provider} sign-up is coming soon.`);
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
            { paddingBottom: insets.bottom + spacing['3xl'] },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero band — male athlete + dark gradient fade + overlaid title.
              Holds the back button (top-left) so navigation is preserved. */}
          <Animated.View
            entering={enter(0)}
            style={[
              styles.hero,
              { width, marginLeft: -spacing['2xl'], marginRight: -spacing['2xl'] },
            ]}
          >
            <LinearGradient
              colors={[withAlpha(colors.accent.coral, 0.16), colors.background.secondary, colors.background.primary]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <Image
              source={HERO_MALE}
              style={styles.heroImage}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel="Zeitra"
            />
            <LinearGradient
              colors={[
                withAlpha(colors.background.primary, 0.33),
                'transparent',
                withAlpha(colors.background.primary, 0.73),
                colors.background.primary,
              ]}
              locations={[0, 0.28, 0.76, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Back button */}
            <Pressable
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backBtn,
                { top: insets.top + spacing.sm, backgroundColor: withAlpha(colors.background.secondary, 0.8), borderColor: colors.border.default },
                pressed && styles.backBtnPressed,
              ]}
            >
              <Ionicons name="chevron-back" size={20} color={colors.text.primary} />
            </Pressable>

            <View style={[styles.heroCopy, { paddingTop: insets.top }]}>
              <Text
                style={[styles.heroTitle, { color: colors.text.primary }]}
                accessibilityRole="header"
                maxFontSizeMultiplier={1.3}
              >
                Create account
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.text.secondary }]}>
                Start training on your clock.
              </Text>
            </View>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={enter(120)} style={styles.form}>
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

            {/* Terms & Privacy consent row */}
            <Pressable
              onPress={() => setTermsAccepted(v => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              accessibilityLabel="I agree to the Terms and Privacy Policy"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={({ pressed }) => [styles.termsRow, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.checkbox,
                  termsAccepted
                    ? { backgroundColor: colors.accent.coral, borderColor: colors.accent.coral }
                    : { backgroundColor: 'transparent', borderColor: colors.border.light },
                ]}
              >
                {termsAccepted ? (
                  <Ionicons name="checkmark" size={13} color={colors.text.inverse} />
                ) : null}
              </View>
              <Text style={[styles.termsText, { color: colors.text.secondary }]}>
                I agree to the{' '}
                <Text style={{ color: colors.accent.coral, fontWeight: '600' }}>Terms</Text>
                {' & '}
                <Text style={{ color: colors.accent.coral, fontWeight: '600' }}>Privacy</Text>
              </Text>
            </Pressable>

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
              label="Create account"
              size="lg"
              flat
              loading={loading}
              onPress={handleRegister}
              style={styles.cta}
            />

            {/* "or sign up with" divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border.default }]} />
              <Text style={[styles.dividerText, { color: colors.text.secondary }]}>
                or sign up with
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
                <Text style={[styles.loginLink, { color: colors.accent.coral }]}>Sign in</Text>
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

const HERO_HEIGHT = 214;

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing['2xl'],
  },
  hero: {
    height: HERO_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    marginBottom: spacing.lg,
  },
  heroImage: {
    position: 'absolute',
    top: -6,
    alignSelf: 'center',
    height: HERO_HEIGHT + 86,
    width: '100%',
  },
  heroCopy: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.md,
  },
  heroTitle: {
    ...typography.display,
    fontSize: 29,
    lineHeight: 33,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    ...typography.bodyMedium,
    marginTop: spacing.xs,
  },
  backBtn: {
    position: 'absolute',
    left: spacing.lg,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  // Back button: scale + dim so the primary touch affordance feels physical
  // (not opacity-only). 0.94 reads well on a 44pt control.
  backBtnPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.94 }],
  },
  form: {
    paddingTop: spacing.xs,
  },
  fieldLabel: {
    ...typography.captionMedium,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  pressed: {
    opacity: 0.6,
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsText: {
    ...typography.bodySm,
    flex: 1,
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
