import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input, Button } from '@/components/ui';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/spacing';
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
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Failed to send reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
      </Pressable>

      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          Reset your{'\n'}
          <Text style={{ color: colors.accent.coral }}>password</Text>
        </Text>

        {sent ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <Text style={[styles.successTitle, { color: colors.text.primary }]}>
              Check your email
            </Text>
            <Text style={[styles.successText, { color: colors.text.secondary }]}>
              We've sent password reset instructions to {email}
            </Text>
            <Button
              title="Back to Sign In"
              variant="outline"
              onPress={() => router.replace('/(auth)/login')}
              fullWidth
              size="lg"
              style={{ marginTop: spacing['2xl'] }}
            />
          </View>
        ) : (
          <>
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

            <Button
              title="Send Reset Link"
              onPress={handleSubmit}
              loading={loading}
              fullWidth
              size="lg"
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.lg,
    marginTop: spacing.sm,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['3xl'],
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 40,
    marginBottom: spacing.lg,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing['3xl'],
  },
  successBox: {
    alignItems: 'center',
    marginTop: spacing['4xl'],
    gap: spacing.md,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: spacing.lg,
  },
  successText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
