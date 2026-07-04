/**
 * Heart Rate — live BPM + training zones from a connected BLE wearable.
 *
 * Surfaces the heart rate the app ALREADY reads over standard BLE (Heart Rate
 * Service 0x180D → 0x2A37) via {@link useBle} → {@link bleManager}. It is a
 * READ of live sensor truth — no new measurement path, no fabrication:
 *   - Live BPM shown big when a device is connected (from bleManager state).
 *   - HR ZONES (Resting / Fat-burn / Cardio / Peak) computed from max HR
 *     (220 − age; age derived from the profile's dateOfBirth, fallback 30).
 *   - An in-SESSION history sparkline built from the live stream while this
 *     screen is open. There is NO server-side HR history endpoint today
 *     (src/api/health.ts only INGESTS samples), so we honestly show only what
 *     we can observe live and note that a longer history needs the read API.
 *   - No device connected → a calm empty state with a "Connect a device" button
 *     routing to the BLE connect screen, plus a note that camera-based (no
 *     device) measurement is coming soon.
 *
 * Wellness tone; a small "estimate, not a medical device" disclaimer. Theme-aware
 * via {@link useTheme}. Mirrors the layout language of (performance)/hydration.tsx
 * (header + hero + cards + honest empty states).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Svg, { Polyline } from 'react-native-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GlassCard, CtaButton, EmptyState } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';
import { useBle } from '@/lib/ble/useBle';
import { getMyProfile } from '@/api/profile';
import {
  ZONE_DEFS,
  DEFAULT_AGE,
  ageFromDob,
  maxHrForAge,
  bpmAtFraction,
  zoneForBpm,
  zoneColor,
  type Zone,
} from '@/lib/hr/zones';
import {
  listMeasurements,
  MEASUREMENT_TAGS,
  type HrMeasurement,
  type MeasurementTag,
} from '@/lib/ppg/measurementStore';

/** Keep the in-session sparkline bounded (≈ last 60 live readings). */
const MAX_HISTORY = 60;

export default function HeartRateScreen() {
  const { colors, typography, spacing, borderRadius, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state } = useBle();

  // Profile → age → max HR. Shares the ['my-profile'] cache with Home/Profile,
  // so this is usually a cache hit with no extra fetch. dateOfBirth isn't on the
  // typed shape but the GET /v1/users/me row carries it — read defensively.
  const { data: profile } = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile, retry: 1 });
  const age = ageFromDob((profile as any)?.dateOfBirth) ?? DEFAULT_AGE;
  const hasRealAge = ageFromDob((profile as any)?.dateOfBirth) != null;
  const maxHr = maxHrForAge(age);

  const connected = state.status === 'connected';
  const bpm = state.heartRate;

  // In-session history — accumulate each distinct live reading while the screen
  // is mounted. This is the ONLY honest HR history we have (no server read API),
  // so it's explicitly session-scoped and resets when you leave the screen.
  const [history, setHistory] = useState<number[]>([]);
  const lastPushRef = useRef<number | null>(null);
  useEffect(() => {
    if (bpm == null) return;
    if (lastPushRef.current === bpm) return; // skip identical back-to-back samples
    lastPushRef.current = bpm;
    setHistory((prev) => [...prev, bpm].slice(-MAX_HISTORY));
  }, [bpm]);

  // Zones (static bands); BPM bounds are derived per-user from maxHr below.
  const zones = ZONE_DEFS;
  const zoneBpm = (frac: number) => bpmAtFraction(frac, maxHr);

  // Which zone the current BPM falls in (drives the hero tint + active row).
  const activeZone = useMemo<Zone | null>(() => zoneForBpm(bpm, maxHr), [bpm, maxHr]);

  const heroColor = activeZone ? zoneColor(colors, activeZone.key) : colors.accent.coral;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
      <StatusBar style="light" />
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button" accessibilityLabel="Go back" activeOpacity={0.85}
          onPress={() => router.back()}
          style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text.primary }]}>Heart Rate</Text>
        <View style={{ width: 40 }} />
      </View>

      {!connected ? (
        /* ── No device: calm empty state ─────────────────────────────────── */
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(420)}>
            <EmptyState
              icon="heart-outline"
              title="Connect a device to see your heart rate"
              subtitle="Pair a watch, band, or chest strap over Bluetooth and Zeitra shows your live heart rate and training zones here."
            />
          </Animated.View>
          <View style={{ paddingHorizontal: spacing.xl }}>
            <CtaButton
              label="Connect a device"
              icon="bluetooth"
              onPress={() => router.push('/(settings)/ble-connect' as any)}
              accessibilityLabel="Connect a Bluetooth device"
            />
            {/* Camera PPG — the no-device path. Available even without a device. */}
            <CameraMeasureCard />
            <MeasurementHistory />
          </View>
        </ScrollView>
      ) : (
        /* ── Connected: live BPM + zones + in-session history ────────────── */
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          {/* Hero — big live BPM, tinted by the active zone. */}
          <Animated.View entering={FadeInDown.duration(420)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
            <View style={[styles.heroCard, { backgroundColor: colors.background.secondary, borderColor: withAlpha(heroColor, 0.4) }, shadows.glow(heroColor)]}>
              <View style={styles.heroTop}>
                <View style={[styles.dot, { backgroundColor: bpm != null ? heroColor : colors.text.tertiary }]} />
                <Text style={[typography.bodySm, { color: colors.text.secondary }]} numberOfLines={1}>
                  {state.device?.name ?? 'Wearable'} · {bpm != null ? 'Live' : 'Waiting for data…'}
                </Text>
              </View>
              <View style={styles.heroBpmRow}>
                <Ionicons name="heart" size={30} color={heroColor} />
                <Text style={[styles.heroBpm, { color: colors.text.primary }]}>{bpm ?? '--'}</Text>
                <Text style={[styles.heroUnit, { color: colors.text.secondary }]}>bpm</Text>
              </View>
              {activeZone ? (
                <View style={[styles.zonePill, { backgroundColor: withAlpha(heroColor, 0.14) }]}>
                  <Ionicons name="pulse" size={13} color={heroColor} />
                  <Text style={[styles.zonePillTxt, { color: heroColor }]}>{activeZone.label} zone</Text>
                </View>
              ) : null}
            </View>
          </Animated.View>

          {/* In-session history sparkline — the only honest HR history we have
              (no server read API). Session-scoped; resets on leave. */}
          <Animated.View entering={FadeInDown.duration(420).delay(60)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
            <GlassCard radius={borderRadius.xl}>
              <View style={styles.histCard}>
                <View style={styles.histHead}>
                  <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>This session</Text>
                  <Text style={[typography.caption, { color: colors.text.tertiary }]}>Live · since you opened this screen</Text>
                </View>
                {history.length >= 2 ? (
                  <Sparkline data={history} color={heroColor} track={colors.border.default} />
                ) : (
                  <View style={styles.histEmpty}>
                    <Ionicons name="pulse-outline" size={26} color={colors.text.tertiary} />
                    <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.sm, textAlign: 'center' }]}>
                      Collecting readings… your live trace builds here as your heart rate streams in.
                    </Text>
                  </View>
                )}
              </View>
            </GlassCard>
          </Animated.View>

          {/* Zones — computed from max HR (220 − age). */}
          <Animated.View entering={FadeInDown.duration(420).delay(120)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
            <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.md }]}>
              YOUR ZONES · MAX {maxHr} BPM
            </Text>
            <View style={{ gap: spacing.sm }}>
              {zones.map((z) => {
                const c = zoneColor(colors, z.key);
                const isActive = activeZone?.key === z.key;
                // Human BPM range for the band (open-ended top zone shows "+").
                const lo = zoneBpm(z.lo);
                const hi = z.hi >= 1.5 ? null : zoneBpm(z.hi);
                const range = hi != null ? `${lo}–${hi}` : `${lo}+`;
                return (
                  <View
                    key={z.key}
                    style={[
                      styles.zoneRow,
                      {
                        backgroundColor: isActive ? withAlpha(c, 0.14) : colors.background.secondary,
                        borderColor: isActive ? withAlpha(c, 0.5) : colors.border.default,
                      },
                    ]}
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={`${z.label} zone, ${range} bpm${isActive ? ', current' : ''}`}
                  >
                    <View style={[styles.zoneSwatch, { backgroundColor: c }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.body, { color: colors.text.primary, fontWeight: isActive ? '700' : '600' }]}>
                        {z.label}
                      </Text>
                      <Text style={[typography.caption, { color: colors.text.secondary }]}>{z.sub}</Text>
                    </View>
                    <Text style={[styles.zoneRange, { color: isActive ? c : colors.text.secondary }]}>{range}</Text>
                  </View>
                );
              })}
            </View>
            {/* How the max was derived — honest about the age fallback. */}
            <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: spacing.md }]}>
              {hasRealAge
                ? `Zones use max HR ≈ 220 − ${age} (your age).`
                : `Zones use max HR ≈ 220 − ${DEFAULT_AGE} (default). Add your birth date in your profile for personalised zones.`}
            </Text>
          </Animated.View>

          {/* Camera PPG entry + saved history — available with a device connected too. */}
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
            <CameraMeasureCard />
            <MeasurementHistory />
          </View>

          {/* Disclaimer — estimate, not a medical device. */}
          <Animated.View entering={FadeInDown.duration(420).delay(180)} style={{ paddingHorizontal: spacing.xl, marginTop: spacing['2xl'] }}>
            <View style={[styles.disclaimerRow, { borderColor: colors.border.default }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.text.tertiary} />
              <Text style={[typography.caption, { color: colors.text.tertiary, flex: 1 }]}>
                Heart-rate readings and zones are wellness estimates from your device — not a medical device, and not for diagnosis.
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

/**
 * Tiny SVG sparkline of the in-session BPM trace. Normalises the series to its
 * own min/max so the line fills the box; a flat series renders mid-height.
 */
function Sparkline({ data, color, track }: { data: number[]; color: string; track: string }) {
  const W = 300;
  const H = 72;
  const pad = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const n = data.length;
  const points = data
    .map((v, i) => {
      const x = pad + (i / (n - 1)) * (W - pad * 2);
      const y = pad + (1 - (v - min) / span) * (H - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <View style={styles.spark} accessibilityRole="image" accessibilityLabel={`Live heart-rate trace, ${min} to ${max} bpm this session`}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {/* Baseline */}
        <Polyline points={`${pad},${H - pad} ${W - pad},${H - pad}`} stroke={track} strokeWidth={1} fill="none" />
        <Polyline points={points} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/**
 * Entry card into the camera-PPG measurement flow — the "no device needed" path.
 * Shown in both the connected and disconnected states (a spot camera reading is
 * useful even when a BLE device is paired).
 */
function CameraMeasureCard() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.push('/(performance)/heart-rate-measure' as any)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Measure heart rate with the camera"
      style={[styles.cameraCard, { marginTop: spacing.md, backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.accent.coral, 0.4) }]}
    >
      <View style={[styles.cameraIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.14) }]}>
        <Ionicons name="camera" size={20} color={colors.accent.coral} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[typography.body, { color: colors.text.primary, fontWeight: '700' }]}>Measure with camera</Text>
        <Text style={[typography.caption, { color: colors.text.secondary }]}>No device needed — uses your camera + flash</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
    </TouchableOpacity>
  );
}

/** Human tag label for a saved measurement (falls back to the raw key). */
function tagLabel(tag: MeasurementTag): string {
  return MEASUREMENT_TAGS.find((t) => t.key === tag)?.label ?? tag;
}

/** Compact relative time ("just now" / "3m ago" / "2h ago" / "5d ago"). */
function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

/**
 * Saved camera-PPG measurement history (local; src/lib/ppg/measurementStore.ts).
 * Reloads on focus so a reading saved on the measure screen appears on return.
 * Renders nothing when empty (the CTA already invites a first measurement).
 */
function MeasurementHistory() {
  const { colors, typography, spacing } = useTheme();
  const [items, setItems] = useState<HrMeasurement[]>([]);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listMeasurements().then((m) => {
        if (alive) setItems(m);
      });
      return () => {
        alive = false;
      };
    }, []),
  );
  if (items.length === 0) return null;
  return (
    <View style={{ marginTop: spacing['2xl'] }}>
      <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.md }]}>CAMERA HISTORY</Text>
      <View style={{ gap: spacing.sm }}>
        {items.slice(0, 10).map((m) => (
          <View key={m.id} style={[styles.histRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
            <Ionicons name="camera-outline" size={16} color={colors.text.tertiary} />
            <View style={{ flex: 1 }}>
              <Text style={[typography.body, { color: colors.text.primary, fontWeight: '600' }]}>
                {m.bpm} bpm{m.tag !== 'none' ? ` · ${tagLabel(m.tag)}` : ''}
              </Text>
              <Text style={[typography.caption, { color: colors.text.tertiary }]}>{relativeTime(m.ts)}</Text>
            </View>
            {m.quality === 'fair' ? (
              <Ionicons name="information-circle-outline" size={14} color={colors.accent.amber} />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  // Hero live-BPM card
  heroCard: { borderRadius: 22, borderWidth: 1, padding: 22, alignItems: 'center' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  heroBpmRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 14 },
  heroBpm: { fontFamily: typo.statLarge.fontFamily, fontSize: 64, lineHeight: 70 },
  heroUnit: { fontFamily: typo.statTiny.fontFamily, fontSize: 16, marginBottom: 10 },
  zonePill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999 },
  zonePillTxt: { fontFamily: typo.captionMedium.fontFamily, fontSize: 12 },

  // In-session history
  histCard: { padding: 18 },
  histHead: { marginBottom: 12 },
  histEmpty: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 20 },
  spark: { width: '100%' },

  // Zones
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  zoneSwatch: { width: 10, height: 34, borderRadius: 5 },
  zoneRange: { fontFamily: typo.statSmall.fontFamily, fontSize: 16 },

  // Disclaimer
  disclaimerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 14, borderRadius: 12, borderWidth: 1 },

  // Camera-PPG entry card + saved history
  cameraCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  cameraIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
});
