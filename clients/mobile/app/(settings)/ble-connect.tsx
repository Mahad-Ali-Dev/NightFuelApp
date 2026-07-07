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
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
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
  const {
    state, supported, scanning, adapterState, results,
    startScan, stopScan, connect, disconnect, enableAdapter,
  } = useBle();

  const connected = state.status === 'connected';
  const connecting = state.status === 'connecting';
  // The adapter is OFF (or the app isn't authorized to use it) — scanning can't
  // work until the user turns Bluetooth on, so we lead with an enable banner.
  const adapterOff = adapterState === 'off';
  const adapterUnauthorized = adapterState === 'unauthorized';

  const onConnect = useCallback((id: string, name: string) => { void connect(id, name); }, [connect]);

  // Turn Bluetooth on. Android shows the system enable prompt (ble-plx
  // manager.enable()); iOS can't enable programmatically, so we direct the user
  // to Control Center / Settings via an Alert. Runs a scan straight after a
  // successful Android enable so the flow feels like one tap.
  const onEnableBluetooth = useCallback(async () => {
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Turn on Bluetooth',
        'Open Control Center (swipe down from the top-right) or Settings › Bluetooth and switch Bluetooth on, then come back to scan.',
        [{ text: 'OK' }],
      );
      return;
    }
    const ok = await enableAdapter();
    if (ok) startScan();
  }, [enableAdapter, startScan]);

  // Tapping "Scan" while the adapter is off routes to the enable flow instead of
  // silently failing; otherwise it starts (or stops) the scan.
  const onScanPress = useCallback(() => {
    if (adapterOff || adapterUnauthorized) { void onEnableBluetooth(); return; }
    if (scanning) { stopScan(); return; }
    startScan();
  }, [adapterOff, adapterUnauthorized, scanning, onEnableBluetooth, startScan, stopScan]);

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
            {/* Bluetooth-off / unauthorized banner — leads the screen with a
                clear "turn it on" prompt + enable button when the adapter can't
                scan. On Android the button fires the system enable prompt; on
                iOS it opens an Alert pointing to Control Center / Settings. */}
            {(adapterOff || adapterUnauthorized) ? (
              <View
                style={[
                  styles.btOffCard,
                  { backgroundColor: withAlpha(colors.warning, 0.1), borderColor: withAlpha(colors.warning, 0.3) },
                ]}
                accessible
                accessibilityRole="alert"
                accessibilityLabel={
                  adapterOff
                    ? 'Bluetooth is off. Turn it on to connect a device.'
                    : 'Bluetooth permission is off. Enable it in Settings to connect.'
                }
              >
                <View style={styles.btOffHead}>
                  <Ionicons name="bluetooth" size={20} color={colors.warning} />
                  <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>
                    {adapterOff ? 'Bluetooth is off' : 'Bluetooth permission needed'}
                  </Text>
                </View>
                <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: spacing.xs }]}>
                  {adapterOff
                    ? 'Turn on Bluetooth to find and connect your watch, band, or heart-rate strap.'
                    : 'Allow Bluetooth in Settings so Zeitra can find nearby devices.'}
                </Text>
                <CtaButton
                  label={adapterOff ? 'Turn on Bluetooth' : 'Open settings'}
                  icon="bluetooth"
                  size="sm"
                  onPress={onEnableBluetooth}
                  style={{ marginTop: spacing.md }}
                  accessibilityLabel={adapterOff ? 'Turn on Bluetooth' : 'Open Bluetooth settings'}
                />
              </View>
            ) : null}

            <GlassCard radius={br.xl} style={styles.introCard}>
              <Ionicons name="bluetooth" size={22} color={colors.accent.cyan} />
              <Text style={[typography.body, { color: colors.text.primary, marginTop: spacing.xs }]}>
                Pair a watch, band, or heart-rate strap
              </Text>
              <Text style={[typography.bodySm, { color: colors.text.tertiary, marginTop: 2 }]}>
                Reads live heart rate + battery from any device that supports the standard Bluetooth profiles.
              </Text>
            </GlassCard>

            {/* Scan button. When the adapter is off it routes to the enable flow
                (never a silent no-op); the first tap also surfaces the runtime
                permission prompt with a friendly rationale (see bleManager). */}
            <CtaButton
              label={
                adapterOff || adapterUnauthorized
                  ? 'Turn on Bluetooth to scan'
                  : scanning ? 'Scanning…' : 'Scan for devices'
              }
              icon="search"
              loading={scanning}
              onPress={onScanPress}
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
  // Bluetooth-off / unauthorized banner (warning-tint card + enable button)
  btOffCard: { padding: spacing.lg, marginTop: spacing.md, borderRadius: br.xl, borderWidth: 1 },
  btOffHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
