import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  AccessibilityInfo,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CtaButton, GlassCard } from '@/components/ui';
import { useTheme } from '@/theme';
import { spacing, borderRadius } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { useAuthStore } from '@/store/authStore';
import { verifyOtp, resendOtp } from '@/api/auth';
import { normalizeEmail } from '@/utils/validation';

// Per-item entrance: a staggered FadeInDown spring (matches reset.tsx). Each
// block enters ~45ms after the previous so the hero, card and footer cascade in —
// premium, not all-at-once. Spring physics + transform/opacity only keeps it
// cheap, GPU-friendly and interruptible.
const enter = (i: number) =>
  FadeInDown.springify().damping(18).mass(0.9).delay(80 + i * 45);

const CODE_LENGTH = 6;
// Resend cooldown, seconds. Mirrors the backend's >= 30s resend throttle so the
// button re-enables in step with when the server will actually accept a resend.
const RESEND_COOLDOWN = 30;

export default function VerifyOtpScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const socialLogin = useAuthStore((s) => s.socialLogin);

  // The email arrives as a route param (register/login push
  // `/verify?email=…`). deepLinks.ts also allowlists `/verify?token=…`, but the
  // OTP flow verifies by email + typed code, so `token` is accepted-and-ignored
  // here. Normalize the email exactly like the backend so the verify/resend
  // lookups match what was stored at register().
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const rawEmail = Array.isArray(params.email) ? params.email[0] : params.email;
  const email = normalizeEmail(rawEmail ?? '');

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // Submit-time banner (invalid / expired / network failures).
  const [formError, setFormError] = useState('');
  // Distinguish a dead/expired-or-too-many-attempts code (offer a resend) from a
  // transient error (let the user retry) so the screen never becomes a dead end.
  const [expired, setExpired] = useState(false);
  // Resend cooldown countdown. Starts armed so the very first tap still waits the
  // 30s the server enforces (the code was just sent at register()).
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState('');

  const inputRef = useRef<TextInput>(null);

  // Tick the resend cooldown down to 0 once per second.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // Only digits, capped at CODE_LENGTH — makes paste ("123456") just work while
  // stripping spaces/letters an autofill or clipboard might carry in.
  const onChangeCode = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (formError) setFormError('');
    if (expired) setExpired(false);
  };

  const submit = async (value: string) => {
    if (!email) {
      setFormError('Something went wrong. Please sign in again.');
      AccessibilityInfo.announceForAccessibility(
        'Something went wrong. Please sign in again.',
      );
      return;
    }
    if (value.length !== CODE_LENGTH) {
      setFormError(`Enter the ${CODE_LENGTH}-digit code we emailed you.`);
      AccessibilityInfo.announceForAccessibility(
        `Enter the ${CODE_LENGTH}-digit code we emailed you.`,
      );
      return;
    }
    setFormError('');
    setLoading(true);
    try {
      const res = await verifyOtp(email, value);
      // verifyOtp() persisted the tokens; socialLogin() hydrates the profile
      // (onboardingComplete / role / emailVerified) and flips isAuthenticated —
      // the same path Google/Apple use.
      await socialLogin(res);
      setDone(true);
      AccessibilityInfo.announceForAccessibility('Email verified. Signing you in.');
      // Onboarding-aware routing: a brand-new user goes to metrics-goals; a user
      // who already finished onboarding (e.g. re-verifying) lands on the tabs.
      const onboardingComplete = useAuthStore.getState().user?.onboardingComplete;
      router.replace(onboardingComplete ? '/(tabs)' : '/(onboarding)/metrics-goals');
    } catch (err: any) {
      const status = err?.response?.status;
      const serverMsg =
        err?.response?.data?.error ?? err?.response?.data?.message;
      // 400 = invalid / expired / too-many-attempts (the only failure status the
      // verify-otp endpoint returns) → steer to a resend. Anything else is
      // transient → let the user retry the same code.
      if (status === 400) {
        setExpired(true);
        setFormError(serverMsg ?? 'That code is invalid or has expired.');
        AccessibilityInfo.announceForAccessibility(
          'That code is invalid or has expired. Request a new one.',
        );
      } else {
        setFormError(serverMsg ?? 'Something went wrong. Please try again.');
        AccessibilityInfo.announceForAccessibility(
          serverMsg ?? 'Something went wrong. Please try again.',
        );
      }
      // Clear the field so the user retypes cleanly.
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending || !email) return;
    setResending(true);
    setResendNote('');
    setFormError('');
    setExpired(false);
    try {
      // resend-otp is anti-enumeration: always a generic 200. Surface the generic
      // message and re-arm the cooldown regardless of the outcome.
      const { message } = await resendOtp(email);
      setResendNote(message || 'If that email is registered, a new code is on its way.');
      AccessibilityInfo.announceForAccessibility('A new code has been requested.');
    } catch {
      // Even on a network hiccup we keep the copy generic (no enumeration) and
      // re-arm the cooldown so the user can try again shortly.
      setResendNote('If that email is registered, a new code is on its way.');
    } finally {
      setCooldown(RESEND_COOLDOWN);
      setResending(false);
    }
  };

  // Auto-submit once all 6 digits are in (keeps parity with the paste flow) —
  // but never while a request is already in flight.
  useEffect(() => {
    if (code.length === CODE_LENGTH && !loading && !done) {
      submit(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Render the 6 code cells from the single hidden TextInput's value so paste,
  // autofill (oneTimeCode) and hardware keyboards all flow through one field.
  const cells = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? '');
  const focusedIndex = Math.min(code.length, CODE_LENGTH - 1);

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
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'))}
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
              Email verified
            </Text>
            <Text
              style={[styles.title, { color: colors.text.primary }]}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.3}
            >
              You{'’'}re{'\n'}
              <Text style={{ color: colors.success }}>all set</Text>
            </Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              Taking you into Zeitra…
            </Text>
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
                <Ionicons name="mail-unread-outline" size={32} color={colors.accent.coral} />
              </View>
              <Text style={[styles.kicker, { color: colors.accent.coral }]}>
                Verify your email
              </Text>
              <Text
                style={[styles.title, { color: colors.text.primary }]}
                accessibilityRole="header"
                maxFontSizeMultiplier={1.3}
              >
                Enter the{'\n'}
                <Text style={{ color: colors.accent.coral }}>6-digit code</Text>
              </Text>
              <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
                We sent a code to{' '}
                <Text style={{ color: colors.text.primary, fontWeight: '700' }}>
                  {email || 'your email'}
                </Text>
                . Enter it below to finish setting up your account.
              </Text>
            </Animated.View>

            <Animated.View entering={enter(2)}>
              <GlassCard style={styles.card}>
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>
                  Your verification code
                </Text>

                {/* One hidden TextInput drives all six cells (paste / autofill /
                    hardware-keyboard friendly). Tapping any cell focuses it. */}
                <Pressable
                  onPress={() => inputRef.current?.focus()}
                  accessibilityRole="none"
                  style={styles.cellsRow}
                >
                  {cells.map((digit, i) => {
                    const isActive = i === focusedIndex && code.length < CODE_LENGTH;
                    const filled = digit !== '';
                    return (
                      <View
                        key={i}
                        style={[
                          styles.cell,
                          {
                            backgroundColor: colors.background.secondary,
                            borderColor: formError
                              ? colors.error
                              : isActive
                              ? colors.accent.coral
                              : filled
                              ? colors.border.light
                              : colors.border.default,
                            borderWidth: formError || isActive ? 1.5 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.cellText, { color: colors.text.primary }]}>
                          {digit}
                        </Text>
                      </View>
                    );
                  })}
                </Pressable>

                <TextInput
                  ref={inputRef}
                  value={code}
                  onChangeText={onChangeCode}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  autoFocus
                  maxLength={CODE_LENGTH}
                  returnKeyType="done"
                  onSubmitEditing={() => submit(code)}
                  editable={!loading}
                  // Off-screen but focusable: the visible UI is the cells above.
                  style={styles.hiddenInput}
                  accessibilityLabel="Verification code"
                  accessibilityHint={`Enter the ${CODE_LENGTH}-digit code sent to your email`}
                />

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

                {resendNote ? (
                  <View style={styles.noteRow} accessibilityRole="text">
                    <Ionicons name="paper-plane-outline" size={14} color={colors.accent.emerald} />
                    <Text style={[styles.noteText, { color: colors.text.secondary }]}>
                      {resendNote}
                    </Text>
                  </View>
                ) : null}

                <CtaButton
                  label={expired ? 'Enter a new code' : 'Verify email'}
                  size="lg"
                  icon="shield-checkmark-outline"
                  loading={loading}
                  onPress={() => submit(code)}
                  style={styles.cta}
                />

                {/* Resend row — disabled until the cooldown elapses. */}
                <View style={styles.resendRow}>
                  <Text style={[styles.resendPrompt, { color: colors.text.tertiary }]}>
                    Didn{'’'}t get it?{' '}
                  </Text>
                  <Pressable
                    onPress={handleResend}
                    disabled={cooldown > 0 || resending}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      cooldown > 0
                        ? `Resend code available in ${cooldown} seconds`
                        : 'Resend code'
                    }
                    accessibilityState={{ disabled: cooldown > 0 || resending }}
                    style={({ pressed }) => pressed && !(cooldown > 0) && styles.pressed}
                  >
                    <Text
                      style={[
                        styles.resendLink,
                        {
                          color:
                            cooldown > 0 || resending
                              ? colors.text.tertiary
                              : colors.accent.coral,
                        },
                      ]}
                    >
                      {resending
                        ? 'Sending…'
                        : cooldown > 0
                        ? `Resend in ${cooldown}s`
                        : 'Resend code'}
                    </Text>
                  </Pressable>
                </View>
              </GlassCard>
            </Animated.View>

            <Animated.View entering={enter(3)} style={styles.footerBlock}>
              <Text style={[styles.footerText, { color: colors.text.secondary }]}>
                Wrong email?{' '}
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
  // Six evenly-spaced code cells backed by one hidden input.
  cellsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  cell: {
    flex: 1,
    height: 56,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    ...typography.display,
    fontSize: 26,
    lineHeight: 30,
  },
  // The single input is visually hidden (the cells are the UI) but stays
  // focusable/paste-able. Zero-size + absolute so it never affects layout.
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    top: 0,
    left: 0,
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
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.lg,
  },
  noteText: {
    ...typography.caption,
    flex: 1,
  },
  cta: {
    width: '100%',
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  resendPrompt: {
    ...typography.bodySm,
  },
  resendLink: {
    ...typography.bodySm,
    fontWeight: '700',
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
});
