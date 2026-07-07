import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  AccessibilityInfo,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input, Button, CtaButton, GlassCard } from '@/components/ui';
import { useTheme } from '@/theme';
import { spacing, borderRadius } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { resetPassword } from '@/api/auth';
import { isStrongPassword, passwordIssues } from '@/utils/validation';

// Per-item entrance: a staggered FadeInDown spring (matches forgot-password).
// Each block enters ~45ms after the previous so the hero, card and footer
// cascade in — premium, not all-at-once. Spring physics + transform/opacity
// only keeps it cheap, GPU-friendly and interruptible.
const enter = (i: number) =>
  FadeInDown.springify().damping(18).mass(0.9).delay(80 + i * 45);

export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // The reset token arrives as a route/deep-link query param. deepLinks.ts maps
  // `/reset?token=…` → `/(auth)/reset?token=…`, so we read it here. A missing
  // token means the link was malformed/incomplete — we show the expired state.
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // Submit-time banner (validation / network / expired-token failures).
  const [formError, setFormError] = useState('');
  // Distinguish a dead/expired token (offer a fresh-link path) from a transient
  // error (let the user retry) so the screen never becomes a dead end.
  const [expired, setExpired] = useState(false);
  // Per-field inline errors, surfaced on blur (mirrors register.tsx).
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const validatePassword = () => {
    if (!password) return setPasswordError('Password is required');
    setPasswordError(
      isStrongPassword(password) ? '' : 'Password does not meet the requirements below',
    );
  };
  const validateConfirm = () => {
    if (!confirmPassword) return setConfirmError('Please re-enter your password');
    setConfirmError(password === confirmPassword ? '' : 'Passwords do not match');
  };

  const handleSubmit = async () => {
    // No token in the link → can't reset. Steer the user to request a new link.
    if (!token) {
      setExpired(true);
      setFormError('This reset link is invalid or has expired.');
      AccessibilityInfo.announceForAccessibility(
        'This reset link is invalid or has expired. Request a new one.',
      );
      return;
    }
    // Same validation as register.tsx: >=8 chars, an uppercase letter and a digit.
    if (!isStrongPassword(password)) {
      setPasswordError('Password does not meet the requirements below');
      setFormError('Please choose a stronger password.');
      AccessibilityInfo.announceForAccessibility('Please choose a stronger password.');
      return;
    }
    if (password !== confirmPassword) {
      setConfirmError('Passwords do not match');
      setFormError('Passwords do not match.');
      AccessibilityInfo.announceForAccessibility('Passwords do not match.');
      return;
    }

    setFormError('');
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      AccessibilityInfo.announceForAccessibility(
        'Password reset. Sign in with your new password.',
      );
    } catch (err: any) {
      // 400 = invalid/expired/used token → show the expired state with a fresh
      // request path. Any other failure is transient → let the user retry.
      const status = err?.response?.status;
      if (status === 400) {
        setExpired(true);
        setFormError(
          err?.response?.data?.error ??
            'This reset link is invalid or has expired.',
        );
        AccessibilityInfo.announceForAccessibility(
          'This reset link is invalid or has expired. Request a new one.',
        );
      } else {
        const message =
          err?.response?.data?.error ?? 'Something went wrong. Please try again.';
        setFormError(message);
        AccessibilityInfo.announceForAccessibility(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.container, { backgroundColor: colors.background.primary }]}
    >
      <StatusBar style="light" />

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
            pressed && styles.pressedScale,
          ]}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </Pressable>
      </Animated.View>

      {done ? (
        // ── Success state ─────────────────────────────────────────────────
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing['3xl'] },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={enter(1)} style={styles.heroBlock}>
            <View
              style={[
                styles.successIcon,
                {
                  backgroundColor: withAlpha(colors.success, 0.12),
                  borderColor: withAlpha(colors.success, 0.35),
                },
                shadows.glow(colors.success),
              ]}
            >
              <Ionicons name="checkmark-circle" size={44} color={colors.success} />
            </View>
            <Text style={[styles.kicker, { color: colors.success }]} accessibilityRole="text">
              All set
            </Text>
            <Text
              style={[styles.title, { color: colors.text.primary }]}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.3}
            >
              Password{'\n'}
              <Text style={{ color: colors.success }}>reset</Text>
            </Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              Sign in with your new password.
            </Text>
          </Animated.View>

          <Animated.View entering={enter(2)} style={styles.footerBlock}>
            <Button
              title="Back to Sign In"
              variant="primary"
              onPress={() => router.replace('/(auth)/login')}
              fullWidth
              size="lg"
            />
          </Animated.View>
        </ScrollView>
      ) : expired ? (
        // ── Expired / invalid-token state ─────────────────────────────────
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing['3xl'] },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={enter(1)} style={styles.heroBlock}>
            <View
              style={[
                styles.lockBadge,
                {
                  backgroundColor: withAlpha(colors.error, 0.1),
                  borderColor: withAlpha(colors.error, 0.3),
                },
                shadows.glow(colors.error),
              ]}
            >
              <Ionicons name="alert-circle-outline" size={32} color={colors.error} />
            </View>
            <Text style={[styles.kicker, { color: colors.error }]}>Link expired</Text>
            <Text
              style={[styles.title, { color: colors.text.primary }]}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.3}
            >
              This link{'\n'}
              <Text style={{ color: colors.error }}>no longer works</Text>
            </Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              {formError ||
                'Reset links expire for your security. Request a fresh one and we’ll send a new link.'}
            </Text>
          </Animated.View>

          <Animated.View entering={enter(2)} style={styles.footerBlock}>
            <Button
              title="Request a New Link"
              variant="primary"
              onPress={() => router.replace('/(auth)/forgot-password')}
              fullWidth
              size="lg"
            />
          </Animated.View>
        </ScrollView>
      ) : (
        // ── Form state ────────────────────────────────────────────────────
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + spacing['3xl'] },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View entering={enter(1)} style={styles.heroBlock}>
              <View
                style={[
                  styles.lockBadge,
                  {
                    backgroundColor: withAlpha(colors.accent.coral, 0.1),
                    borderColor: withAlpha(colors.accent.coral, 0.3),
                  },
                  shadows.glow(colors.accent.coral),
                ]}
              >
                <Ionicons name="key-outline" size={32} color={colors.accent.coral} />
              </View>
              <Text style={[styles.kicker, { color: colors.accent.coral }]}>
                Account recovery
              </Text>
              <Text
                style={[styles.title, { color: colors.text.primary }]}
                accessibilityRole="header"
                maxFontSizeMultiplier={1.3}
              >
                Set a new{'\n'}
                <Text style={{ color: colors.accent.coral }}>password</Text>
              </Text>
              <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
                Choose a strong password you don{'’'}t use anywhere else.
              </Text>
            </Animated.View>

            <Animated.View entering={enter(2)}>
              <GlassCard style={styles.card}>
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>
                  Your new password
                </Text>

                <Input
                  label="New Password"
                  placeholder="Min 8 characters"
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (passwordError) setPasswordError('');
                    if (formError) setFormError('');
                  }}
                  onBlur={validatePassword}
                  error={passwordError || undefined}
                  icon="lock-closed-outline"
                  secureTextEntry={!showPassword}
                  rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  onRightIconPress={() => setShowPassword(!showPassword)}
                  rightIconAccessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  rightIconActive={showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  returnKeyType="next"
                />

                {password.length > 0 && <PasswordRequirements password={password} />}

                <Input
                  label="Confirm Password"
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChangeText={(t) => {
                    setConfirmPassword(t);
                    if (confirmError) setConfirmError('');
                    if (formError) setFormError('');
                  }}
                  onBlur={validateConfirm}
                  error={confirmError || undefined}
                  icon="shield-checkmark-outline"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />

                {/* Live "passwords match" affirmation (color is NOT the only signal). */}
                {confirmPassword.length > 0 &&
                password === confirmPassword &&
                !confirmError ? (
                  <View
                    style={styles.matchRow}
                    accessibilityRole="text"
                    accessibilityLabel="Passwords match"
                  >
                    <Ionicons name="checkmark-circle" size={14} color={colors.accent.emerald} />
                    <Text style={[styles.matchText, { color: colors.accent.emerald }]}>
                      Passwords match
                    </Text>
                  </View>
                ) : null}

                {formError ? (
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
                    <Text style={[styles.errorText, { color: colors.error }]}>{formError}</Text>
                  </View>
                ) : null}

                <CtaButton
                  label="Reset Password"
                  size="lg"
                  icon="key-outline"
                  loading={loading}
                  onPress={handleSubmit}
                  style={styles.cta}
                />
              </GlassCard>
            </Animated.View>

            <Animated.View entering={enter(3)} style={styles.footerBlock}>
              <Text style={[styles.footerText, { color: colors.text.secondary }]}>
                Remembered it?{' '}
              </Text>
              <Pressable
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                accessibilityRole="link"
                accessibilityLabel="Back to sign in"
                onPress={() => router.replace('/(auth)/login')}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={[styles.footerLink, { color: colors.accent.coral }]}>Sign In</Text>
              </Pressable>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

/**
 * Password requirement checklist — the same three rules register.tsx enforces
 * (>=8 chars, one uppercase, one digit), backed by the shared `passwordIssues`
 * source of truth so the checklist and the submit guard always agree. Strength
 * is never signalled by color alone (each rule carries an explicit met/not-met).
 */
function PasswordRequirements({ password }: { password: string }) {
  const { colors } = useTheme();

  const rules = useMemo(
    () => [
      { label: 'At least 8 characters', met: password.length >= 8 },
      { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
      { label: 'One number (0-9)', met: /[0-9]/.test(password) },
    ],
    [password],
  );

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

      <View
        style={styles.strengthTrack}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {[0, 1, 2].map((i) => (
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
        {rules.map((rule) => (
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
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing['2xl'],
    marginTop: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  pressedScale: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['3xl'],
  },
  heroBlock: {
    alignItems: 'flex-start',
    marginBottom: spacing['2xl'],
  },
  lockBadge: {
    width: 64,
    height: 64,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  kicker: {
    ...typography.overline,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.display,
    fontSize: 32,
    lineHeight: 38,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.body,
  },
  card: {
    padding: spacing.xl,
  },
  sectionLabel: {
    ...typography.overline,
    marginBottom: spacing.lg,
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
  },
  footerBlock: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing['3xl'],
  },
  footerText: {
    ...typography.body,
  },
  footerLink: {
    ...typography.body,
    fontWeight: '700',
  },
  // Password strength (mirrors register.tsx)
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
