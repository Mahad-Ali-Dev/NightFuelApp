import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  AccessibilityInfo,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input, Button, CtaButton, GlassCard } from '@/components/ui';
import { useTheme } from '@/theme';
import { spacing, borderRadius } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { forgotPassword } from '@/api/auth';
import { isValidEmail, sanitizeInput } from '@/utils/validation';

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const cleanEmail = sanitizeInput(email);
    if (!cleanEmail) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(cleanEmail);
      setSent(true);
      AccessibilityInfo.announceForAccessibility(
        'Request received. Password reset by email is not available yet. Reach us at support@nightfuel.app'
      );
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Failed to send reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const header = (
    <>
      {!sent && (
        <Text style={[styles.kicker, { color: colors.accent.coral }]}>Account recovery</Text>
      )}
      <Text style={[styles.title, { color: colors.text.primary }]}>
        Reset your{'\n'}
        <Text style={{ color: colors.accent.coral }}>password</Text>
      </Text>
    </>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <StatusBar style="light" />

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
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
      </Pressable>

      {sent ? (
        <View style={styles.content}>
          {header}

          <GlassCard
            style={{
              padding: spacing['2xl'],
              alignItems: 'center',
              gap: spacing.md,
              marginTop: spacing['4xl'],
            }}
          >
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
              <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            </View>
            <Text style={[styles.successKicker, { color: colors.success }]}>Request received</Text>
            <Text style={[styles.successTitle, { color: colors.text.primary }]}>
              Almost there
            </Text>
            <Text style={[styles.successText, { color: colors.text.secondary }]}>
              Password reset by email isn't available just yet. Please contact support and we'll
              help you reset your password.
            </Text>
            <View
              style={[
                styles.hintRow,
                {
                  backgroundColor: colors.background.secondary,
                  borderColor: colors.border.default,
                },
              ]}
            >
              <Ionicons name="mail-outline" size={16} color={colors.text.tertiary} />
              <Text style={[styles.hintText, { color: colors.text.tertiary }]}>
                Reach us at support@nightfuel.app
              </Text>
            </View>
            <Button
              title="Back to Sign In"
              variant="outline"
              onPress={() => router.replace('/(auth)/login')}
              fullWidth
              size="lg"
              style={{ marginTop: spacing['2xl'] }}
            />
          </GlassCard>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {header}

          <GlassCard style={{ padding: spacing['2xl'] }}>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              Enter the email address associated with your account and we'll send you a link to reset
              your password.
            </Text>

            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              icon="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <CtaButton
              label="Send Reset Link"
              size="lg"
              loading={loading}
              onPress={handleSubmit}
              style={{ width: '100%' }}
            />
          </GlassCard>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  content: {
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['3xl'],
  },
  kicker: {
    ...typography.overline,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.display,
    fontSize: 32,
    lineHeight: 40,
    marginBottom: spacing.lg,
  },
  subtitle: {
    ...typography.body,
    marginBottom: spacing.lg,
  },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  successKicker: {
    ...typography.overline,
  },
  successTitle: {
    ...typography.h2,
    marginTop: spacing.xxs,
  },
  successText: {
    ...typography.body,
    textAlign: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
  hintText: {
    ...typography.caption,
  },
});
