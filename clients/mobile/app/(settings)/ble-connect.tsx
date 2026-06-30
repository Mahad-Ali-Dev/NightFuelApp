/**
 * Connect a Bluetooth wearable — direct BLE scan / pair / live read.
 *
 * Reached from Settings › Connected Devices › the "Bluetooth wearable" row. Reads
 * the STANDARD BLE profiles (Heart Rate 0x180D, Battery 0x180F) directly from a
 * watch / band / chest-strap via {@link useBle} → {@link bleManager}. Honest
 * states only: an Expo-Go build has no BLE module, so it shows the native-build
 * notice instead of faking a connection. Live HR also streams into the health
 * pipeline (generic_ble source) so it lands in the digital twin.
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { GlassCard, CtaButton, EmptyState } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { useBle } from '@/lib/ble/useBle';

/** Signal-strength glyph from RSSI (dBm): closer to 0 is stronger. */
function signalIcon(rssi: number | null): keyof typeof Ionicons.glyphMap {
  if (rssi == null) return 'cellular-outline';
  if (rssi >= -60) return 'cellular';
  if (rssi >= -80) return 'cellular-outline';
  return 'cellular-outline';
}

export default function BleConnectScreen() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, supported, scanning, results, startScan, stopScan, connect, disconnect } = useBle();

  const connected = state.status === 'connected';
  const connecting = state.status === 'connecting';

  const onConnect = useCallback((id: string, name: string) => { void connect(id, name); }, [connect]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <PressableScale
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </PressableScale>
        <Text style={[typography.h3, { color: colors.text.primary }]}>Bluetooth wearable</Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing['3xl'] }}
        showsVerticalScrollIndicator={false}
      >
        {/* Honest unsupported state (Expo Go / no native module) */}
        {!supported ? (
          <View style={{ paddingTop: spacing['3xl'] }}>
            <EmptyState
              icon="bluetooth-outline"
              title="Needs a native build"
              subtitle="Bluetooth wearables connect in the installed app, not in Expo Go. Build and install Zeitra, then pair your watch or band here."
            />
          </View>
        ) : connected ? (
          /* ── Connected: live readout ─────────────────────────────────── */
          <>
            <GlassCard radius={br.xl} style={styles.liveCard}>
              <View style={styles.liveHead}>
                <View style={[styles.dot, { backgroundColor: colors.accent.cyan }]} />
                <Text style={[typography.bodySm, { color: colors.text.secondary }]} numberOfLines={1}>
                  {state.device?.name ?? 'Wearable'} · Connected
                </Text>
              </View>
              <View style={styles.hrRow}>
                <Ionicons name="heart" size={28} color={colors.accent.coral} />
                <Text style={[styles.hrValue, { color: colors.text.primary }]}>
                  {state.heartRate ?? '--'}
                </Text>
                <Text style={[typography.bodySm, { color: colors.text.tertiary }]}>bpm</Text>
              </View>
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="battery-half-outline" size={16} color={colors.text.tertiary} />
                  <Text style={[typography.caption, { color: colors.text.secondary }]}>
                    {state.battery != null ? `${state.battery}%` : '—'}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="pulse-outline" size={16} color={colors.text.tertiary} />
                  <Text style={[typography.caption, { color: colors.text.secondary }]}>
                    {state.heartRate != null ? 'Live' : 'Waiting for data…'}
                  </Text>
                </View>
              </View>
            </GlassCard>

            {state.error ? (
              <Text style={[typography.caption, styles.note, { color: colors.warning }]}>{state.error}</Text>
            ) : (
              <Text style={[typography.caption, styles.note, { color: colors.text.tertiary }]}>
                Heart rate is syncing into your health data.
              </Text>
            )}

            <PressableScale
              onPress={() => { void disconnect(); }}
              accessibilityRole="button"
              accessibilityLabel="Disconnect device"
              style={[styles.secondaryBtn, { borderColor: colors.border.default }]}
            >
              <Ionicons name="close-circle-outline" size={18} color={colors.text.secondary} />
              <Text style={[typography.body, { color: colors.text.secondary }]}>Disconnect</Text>
            </PressableScale>
          </>
        ) : (
          /* ── Not connected: scan + results ───────────────────────────── */
          <>
            <GlassCard radius={br.xl} style={styles.introCard}>
              <Ionicons name="bluetooth" size={22} color={colors.accent.cyan} />
              <Text style={[typography.body, { color: colors.text.primary, marginTop: spacing.xs }]}>
                Pair a watch, band, or heart-rate strap
              </Text>
              <Text style={[typography.bodySm, { color: colors.text.tertiary, marginTop: 2 }]}>
                Reads live heart rate + battery from any device that supports the standard Bluetooth profiles.
              </Text>
            </GlassCard>

            <CtaButton
              label={scanning ? 'Scanning…' : 'Scan for devices'}
              icon="search"
              loading={scanning}
              onPress={scanning ? stopScan : startScan}
              style={{ marginTop: spacing.md }}
            />

            {state.error ? (
              <Text style={[typography.caption, styles.note, { color: colors.warning }]}>{state.error}</Text>
            ) : null}

            {connecting ? (
              <View style={styles.connectingRow}>
                <ActivityIndicator color={colors.accent.cyan} />
                <Text style={[typography.bodySm, { color: colors.text.secondary }]}>
                  Connecting to {state.device?.name ?? 'device'}…
                </Text>
              </View>
            ) : null}

            {results.map((d) => (
              <GlassCard key={d.id} radius={br.lg} style={styles.deviceRow}>
                <Ionicons name={signalIcon(d.rssi)} size={18} color={colors.text.tertiary} />
                <View style={styles.deviceInfo}>
                  <Text style={[typography.body, { color: colors.text.primary }]} numberOfLines={1}>
                    {d.name}
                  </Text>
                  <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                    {d.rssi != null ? `Signal ${d.rssi} dBm` : 'In range'}
                  </Text>
                </View>
                <CtaButton label="Connect" size="sm" onPress={() => onConnect(d.id, d.name)} />
              </GlassCard>
            ))}

            {scanning && results.length === 0 ? (
              <Text style={[typography.caption, styles.note, { color: colors.text.tertiary }]}>
                Looking for nearby devices… make sure your wearable is on and not connected to another app.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  introCard: { padding: spacing.lg, marginTop: spacing.md },
  liveCard: { padding: spacing.lg, marginTop: spacing.md, alignItems: 'center' },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: br.full },
  hrRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: spacing.md },
  hrValue: { fontSize: 56, fontWeight: '800', lineHeight: 60 },
  metaRow: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  note: { textAlign: 'center', marginTop: spacing.md },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: br.lg, paddingVertical: 13, marginTop: spacing.lg },
  connectingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.lg, justifyContent: 'center' },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginTop: spacing.sm },
  deviceInfo: { flex: 1 },
});
