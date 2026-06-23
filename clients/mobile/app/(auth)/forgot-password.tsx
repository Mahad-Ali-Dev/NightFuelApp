import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  AccessibilityInfo,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input, Button, CtaButton, GlassCard } from '@/components/ui';
import { useTheme } from '@/theme';
import { spacing, borderRadius } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { forgotPassword } from '@/api/auth';
import { isValidEmail, sanitizeInput } from '@/utils/validation';

// Per-item entrance: a staggered FadeInDown spring (matches login). Each block
// enters ~45ms after the previous so the hero, card and footer cascade in —
// premium, not all-at-once. Spring physics + transform/opacity only keeps it
// cheap, GPU-friendly and interruptible.
const enter = (i: number) =>
  FadeInDown.springify().damping(18).mass(0.9).delay(80 + i * 45);

// The three steps we promise after a successful request — reads as a calm,
// numbered "what happens next" so the screen never feels like a dead end.
const STEPS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'mail-outline', text: 'Check your inbox for our reply' },
  { icon: 'shield-checkmark-outline', text: 'We verify it’s really you' },
  { icon: 'key-outline', text: 'You set a fresh password' },
];

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  // The message the API hands back on a successful request. We surface this in
  // the success body instead of a hardcoded promise so the screen reflects what
  // the backend actually did (and stays correct if that copy ever changes).
  const [sentMessage, setSentMessage] = useState('');
  const [loading, setLoading] = useState(false);
  // Inline, per-field email validation surfaced on blur (recovery-friendly: the
  // message sits directly below the Email field, with a fix-it example).
  const [emailError, setEmailError] = useState('');
  // Submit-time banner (empty / network failures) — distinct from the per-field
  // blur hint so the user always sees a clear recovery path.
  const [formError, setFormError] = useState('');

  // Early, in-context feedback before the user ever presses the CTA. Empty stays
  // silent — "required" is the submit-time concern.
  const handleEmailBlur = () => {
    const cleanEmail = sanitizeInput(email);
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      setEmailError('Enter a valid email, e.g. you@example.com');
    } else {
      setEmailError('');
    }
  };

  const handleSubmit = async () => {
    const cleanEmail = sanitizeInput(email);
    if (!cleanEmail) {
      setFormError('Please enter your email address.');
      AccessibilityInfo.announceForAccessibility('Please enter your email address.');
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      setEmailError('Enter a valid email, e.g. you@example.com');
      setFormError('Please enter a valid email address.');
      AccessibilityInfo.announceForAccessibility('Please enter a valid email address.');
      return;
    }
    setFormError('');
    setLoading(true);
    try {
      const { message } = await forgotPassword(cleanEmail);
      setSentMessage(message);
      setSent(true);
      AccessibilityInfo.announceForAccessibility(
        `Request received. ${message} If you need a hand, reach us at support@zeitra.app`
      );
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? 'Something went wrong. Please try again.';
      setFormError(message);
      Alert.alert('Error', message);
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

      {sent ? (
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
            <Text
              style={[styles.kicker, { color: colors.success }]}
              accessibilityRole="text"
            >
              Request received
            </Text>
            <Text
              style={[styles.title, { color: colors.text.primary }]}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.3}
            >
              Almost{'\n'}
              <Text style={{ color: colors.success }}>there</Text>
            </Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              {sentMessage ||
                'We’ve got your request. Our team will help you get back into your account.'}
            </Text>
          </Animated.View>

          <Animated.View entering={enter(2)}>
            <GlassCard style={styles.card}>
              <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>
                What happens next
              </Text>
              {STEPS.map((step, i) => (
                <View key={step.text} style={styles.stepRow}>
                  <View
                    style={[
                      styles.stepNum,
                      {
                        backgroundColor: withAlpha(colors.accent.coral, 0.12),
                        borderColor: withAlpha(colors.accent.coral, 0.3),
                      },
                    ]}
                  >
                    <Text style={[styles.stepNumText, { color: colors.accent.coral }]}>
                      {i + 1}
                    </Text>
                  </View>
                  <Ionicons name={step.icon} size={18} color={colors.text.tertiary} />
                  <Text style={[styles.stepText, { color: colors.text.secondary }]}>
                    {step.text}
                  </Text>
                </View>
              ))}
            </GlassCard>
          </Animated.View>

          <Animated.View entering={enter(3)} style={styles.footerBlock}>
            <Button
              title="Back to Sign In"
              variant="outline"
              onPress={() => router.replace('/(auth)/login')}
              fullWidth
              size="lg"
            />
          </Animated.View>
        </ScrollView>
      ) : (
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
                <Ionicons name="lock-open-outline" size={32} color={colors.accent.coral} />
              </View>
              <Text style={[styles.kicker, { color: colors.accent.coral }]}>
                Account recovery
              </Text>
              <Text
                style={[styles.title, { color: colors.text.primary }]}
                accessibilityRole="header"
                maxFontSizeMultiplier={1.3}
              >
                Reset your{'\n'}
                <Text style={{ color: colors.accent.coral }}>password</Text>
              </Text>
              <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
                Enter the email tied to your account and we{'’'}ll help you get back in.
              </Text>
            </Animated.View>

            <Animated.View entering={enter(2)}>
              <GlassCard style={styles.card}>
                <Text style={[styles.sectionLabel, { color: colors.text.tertiary }]}>
                  Your account email
                </Text>

                <Input
                  label="Email"
                  placeholder="you@example.com"
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (emailError) setEmailError('');
                    if (formError) setFormError('');
                  }}
                  onBlur={handleEmailBlur}
                  error={emailError || undefined}
                  icon="mail-outline"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={handleSubmit}
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

                <CtaButton
                  label="Request Reset Help"
                  size="lg"
                  icon="chatbubble-ellipses-outline"
                  loading={loading}
                  onPress={handleSubmit}
                  style={styles.cta}
                />

                <View style={styles.trustRow}>
                  <Ionicons
                    name="shield-checkmark"
                    size={13}
                    color={colors.text.tertiary}
                  />
                  <Text style={[styles.trustText, { color: colors.text.tertiary }]}>
                    We never share your email. We’ll get you sorted fast.
                  </Text>
                </View>
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
  // Icon back button reads as a control/affordance, so it gets a subtle
  // pressed-scale to match the Aurora CtaButton/Button (transform + opacity
  // only — cheap and GPU-friendly).
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
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  trustText: {
    ...typography.caption,
    flex: 1,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    ...typography.captionMedium,
    fontWeight: '800',
  },
  stepText: {
    ...typography.bodySm,
    flex: 1,
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
