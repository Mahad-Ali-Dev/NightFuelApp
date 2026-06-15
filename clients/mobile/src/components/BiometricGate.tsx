/**
 * Biometric gate — wraps content that should require Face ID / Touch ID
 * before rendering.
 *
 * Use cases:
 *   - Settings → Subscription (manage payment, change tier)
 *   - Settings → Privacy → Delete account
 *   - Settings → Export data
 *   - Coach Hub admin actions
 *
 * The gate auto-bypasses on devices without biometric hardware OR when the
 * user has not enrolled (we don't want to lock people out of their own
 * subscription). Sentry receives a soft event so we can see how often this
 * happens in the wild.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import {
  authenticateBiometric,
  getBiometricCapability,
  type BiometricKind,
} from '@/lib/biometric';

interface BiometricGateProps {
  /**
   * What we're protecting — shows in the prompt and the "denied" screen.
   *
   * Examples: "View your payment method", "Delete your account",
   *           "Export your data".
   */
  prompt: string;
  /**
   * Render this when the gate is satisfied (auth succeeded OR device
   * lacks biometrics).
   */
  children: React.ReactNode;
  /**
   * Optional override — show a "skip" button that calls this.
   *
   * Use sparingly. For low-stakes screens you might allow skip; for
   * billing screens you should not.
   */
  onSkip?: () => void;
}

export function BiometricGate({ prompt, children, onSkip }: BiometricGateProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const [state, setState] = useState<'checking' | 'gated' | 'allowed' | 'denied'>('checking');
  const [biometricKind, setBiometricKind] = useState<BiometricKind>('unknown');
  const promptedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cap = await getBiometricCapability();
      if (cancelled) return;
      setBiometricKind(cap.kind);

      // No hardware or no enrollment — bypass. Trying to authenticate
      // would either fail immediately or prompt the user to set up Face
      // ID, which is bad UX for this control flow.
      if (!cap.hardwarePresent || !cap.enrolled) {
        setState('allowed');
        return;
      }

      // Don't auto-prompt twice on screen re-mount — useEffect sometimes
      // fires twice in dev with React Strict Mode.
      if (promptedOnce.current) return;
      promptedOnce.current = true;

      setState('gated');
      const result = await authenticateBiometric(prompt);
      if (cancelled) return;

      if (result.success) {
        setState('allowed');
      } else {
        setState('denied');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = async () => {
    setState('gated');
    const result = await authenticateBiometric(prompt);
    setState(result.success ? 'allowed' : 'denied');
  };

  if (state === 'allowed') return <>{children}</>;

  if (state === 'checking' || state === 'gated') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background.primary }]}>
        <ActivityIndicator color={colors.accent.cyan} size="large" />
        <Text style={[typography.body, { color: colors.text.secondary, marginTop: spacing.md }]}>
          {state === 'gated' ? 'Confirm with biometric…' : 'Checking…'}
        </Text>
      </View>
    );
  }

  // state === 'denied'
  return (
    <View style={[styles.center, { backgroundColor: colors.background.primary, paddingHorizontal: 24 }]}>
      <Ionicons
        name={biometricKind === 'face' ? 'scan-outline' : 'finger-print-outline'}
        size={64}
        color={colors.text.tertiary}
      />
      <Text style={[typography.heading, { color: colors.text.primary, marginTop: spacing.lg, textAlign: 'center' }]}>
        Authentication required
      </Text>
      <Text style={[typography.body, { color: colors.text.secondary, marginTop: spacing.sm, textAlign: 'center', lineHeight: 22 }]}>
        {prompt}
      </Text>

      <TouchableOpacity
        onPress={retry}
        activeOpacity={0.85}
        style={[styles.btn, { backgroundColor: colors.accent.coral, borderRadius: borderRadius.lg, marginTop: spacing.xl }]}
      >
        <Text style={[typography.subhead, { color: '#fff', fontWeight: '700' }]}>Try again</Text>
      </TouchableOpacity>

      {onSkip && (
        <TouchableOpacity onPress={onSkip} style={{ marginTop: spacing.md }} activeOpacity={0.85}>
          <Text style={[typography.caption, { color: colors.text.tertiary, fontWeight: '600' }]}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  btn: { paddingHorizontal: 28, paddingVertical: 14 },
});
