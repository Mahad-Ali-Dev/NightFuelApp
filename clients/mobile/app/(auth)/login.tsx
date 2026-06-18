import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  AccessibilityInfo,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter, Link } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input, CtaButton, GlassCard } from '@/components/ui';
import { useTheme } from '@/theme';
import { spacing, borderRadius } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { shadows } from '@/theme/shadows';
import { withAlpha } from '@/theme/utils';
import { isValidEmail, sanitizeInput } from '@/utils/validation';

export default function LoginScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuthStore();

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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
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
              <Ionicons name="moon" size={28} color={colors.accent.coral} />
            </View>
            <Text style={[styles.kicker, { color: colors.accent.coral }]}>Welcome back</Text>
            <Text style={[styles.logo, { color: colors.text.primary }]}>
              Night<Text style={{ color: colors.accent.coral }}>Fuel</Text>
            </Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              Fuel your shift. Pick up right where you left off.
            </Text>
          </View>

          {/* Form */}
          <GlassCard style={styles.form}>
            <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>
              Sign in to your account
            </Text>

            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              icon="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Input
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              icon="lock-closed-outline"
              secureTextEntry={!showPassword}
              rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
              onRightIconPress={() => setShowPassword(!showPassword)}
            />

            <Link href="/(auth)/forgot-password" asChild>
              <Pressable
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
              style={{ width: '100%' }}
            />
          </GlassCard>

          {/* Register link */}
          <View style={styles.registerRow}>
            <Text style={[styles.registerText, { color: colors.text.secondary }]}>
              Don't have an account?{' '}
            </Text>
            <Link href="/(auth)/register" asChild>
              <Pressable
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={[styles.registerLink, { color: colors.accent.coral }]}>
                  Sign Up
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['5xl'],
    paddingBottom: spacing['3xl'],
  },
  header: {
    marginBottom: spacing['4xl'],
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  kicker: {
    ...typography.overline,
    marginBottom: spacing.xs,
  },
  logo: {
    ...typography.display,
    letterSpacing: -1,
  },
  subtitle: {
    ...typography.subtitle,
    fontFamily: typography.body.fontFamily,
    marginTop: spacing.sm,
  },
  form: {
    padding: spacing.xl,
  },
  sectionLabel: {
    ...typography.overline,
    marginBottom: spacing.lg,
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
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
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
