import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input, Button, Card } from '@/components/ui';
import { useTheme } from '@/theme';
import { spacing, borderRadius } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { withAlpha } from '@/theme/utils';
import { isValidEmail, isStrongPassword, sanitizeInput, normalizeEmail } from '@/utils/validation';

export default function RegisterScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const { register } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    const cleanName = sanitizeInput(name);
    // Lowercase + trim the email exactly like the backend does before it is
    // stored/looked up, so the client never submits a value the server would
    // normalize differently. sanitizeInput first strips any stray HTML.
    const cleanEmail = normalizeEmail(sanitizeInput(email));
    if (!cleanName || !cleanEmail || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      setError('Please enter a valid email address');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!isStrongPassword(password)) {
      setError('Password must be at least 8 characters with a number and uppercase letter');
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
      setError(e?.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back + Header */}
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

          <View style={styles.header}>
            <Text style={[styles.kicker, { color: colors.accent.coral }]}>Get started</Text>
            <Text style={[styles.title, { color: colors.text.primary }]}>
              Create your{'\n'}
              <Text style={{ color: colors.accent.coral }}>account</Text>
            </Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              Start optimizing your shift nutrition today
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>
              Your details
            </Text>

            <Input
              label="Full Name"
              placeholder="John Doe"
              value={name}
              onChangeText={setName}
              icon="person-outline"
              autoCapitalize="words"
            />

            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              icon="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Input
              label="Password"
              placeholder="Min 8 characters"
              value={password}
              onChangeText={setPassword}
              icon="lock-closed-outline"
              secureTextEntry={!showPassword}
              rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
              onRightIconPress={() => setShowPassword(!showPassword)}
            />

            {password.length > 0 && (
              <PasswordRequirements password={password} />
            )}

            <Input
              label="Confirm Password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              icon="shield-checkmark-outline"
              secureTextEntry={!showPassword}
            />

            {error ? (
              <View
                style={[
                  styles.errorBox,
                  {
                    backgroundColor: withAlpha(colors.error, 0.1),
                    borderColor: withAlpha(colors.error, 0.25),
                  },
                ]}
              >
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            ) : null}

            <Button
              title="Create Account"
              onPress={handleRegister}
              loading={loading}
              fullWidth
              size="lg"
              icon={<Ionicons name="rocket-outline" size={20} color={colors.text.primary} />}
            />
          </View>

          {/* Login link */}
          <View style={styles.loginRow}>
            <Text style={[styles.loginText, { color: colors.text.secondary }]}>
              Already have an account?{' '}
            </Text>
            <Link href="/(auth)/login" asChild>
              <Pressable
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={[styles.loginLink, { color: colors.accent.coral }]}>Sign In</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasswordRequirements({ password }: { password: string }) {
  const { colors } = useTheme();
  const rules = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'One number (0-9)', met: /[0-9]/.test(password) },
  ];
  return (
    <Card variant="glass" padding="md" style={styles.pwReqs}>
      {rules.map(rule => (
        <View key={rule.label} style={styles.pwReqRow}>
          <Ionicons
            name={rule.met ? 'checkmark-circle' : 'ellipse-outline'}
            size={14}
            color={rule.met ? colors.accent.emerald : colors.text.tertiary}
          />
          <Text
            style={[
              styles.pwReqText,
              { color: rule.met ? colors.accent.emerald : colors.text.tertiary },
            ]}
          >
            {rule.label}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
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
    marginBottom: spacing['3xl'],
  },
  kicker: {
    ...typography.overline,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.display,
    fontSize: 32,
    lineHeight: 40,
  },
  subtitle: {
    ...typography.body,
    marginTop: spacing.sm,
  },
  form: {},
  sectionLabel: {
    ...typography.overline,
    marginBottom: spacing.lg,
  },
  pressed: {
    opacity: 0.6,
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
  pwReqs: {
    marginTop: -spacing.xs,
    marginBottom: spacing.lg,
    gap: spacing.xs,
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
