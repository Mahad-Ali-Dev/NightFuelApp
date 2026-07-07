/**
 * Camera Heart Rate — measure BPM with the camera + flash (no device needed).
 *
 * The "no-device" heart-rate path teased by (performance)/heart-rate.tsx. Flow:
 * cover the back camera + flash with a fingertip → the torch-lit frame's
 * brightness pulses with the blood-volume wave → we average that per frame
 * (src/components/ppg/PpgCameraView.tsx), band-pass + peak-detect it in pure TS
 * (src/lib/ppg/ppgSignal.ts), and show a live waveform + countdown + final BPM,
 * classified into the SHARED training zones (src/lib/hr/zones.ts). A completed
 * reading is saved to the health pipeline (kind 'heartRate', source 'camera_ppg')
 * and to local tagged history (src/lib/ppg/measurementStore.ts).
 *
 * HONESTY: camera PPG is a consumer-grade ESTIMATE (±3–8 BPM at rest, unreliable
 * during motion). A poor-quality read shows "couldn't get a reliable reading —
 * try again", NEVER a fabricated number; a prominent "wellness estimate, not a
 * medical device" disclaimer is always visible; and users after accuracy are
 * steered to a Bluetooth strap (which the app reads over standard BLE).
 *
 * Native-build only: `isPpgSupported()` is false in Expo Go / the jest gate, so
 * the screen renders an honest "needs the app build" state and never crashes. The
 * camera view is additionally wrapped in an ErrorBoundary as a final safety net.
 *
 * The sub-views are MODULE-SCOPE components (not nested closures): the countdown
 * re-renders the screen ~10×/s while measuring, and a nested component would
 * remount the camera on every tick.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Svg, { Polyline } from 'react-native-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { typography as typo } from '@/theme/typography';
import { GlassCard, CtaButton, CircularProgress, EmptyState } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { getMyProfile } from '@/api/profile';
import { ingestHealthSamples } from '@/api/health';
import { ageFromDob, DEFAULT_AGE, maxHrForAge, zoneForBpm, zoneColor } from '@/lib/hr/zones';
import {
  estimateBpm,
  bandpassFilter,
  estimateSampleRate,
  type BpmEstimate,
  type PpgSample,
} from '@/lib/ppg/ppgSignal';
import { isPpgSupported, CAPTURE_SECONDS, WARMUP_SECONDS } from '@/lib/ppg/ppgCamera';
import { addMeasurement, MEASUREMENT_TAGS, type MeasurementTag } from '@/lib/ppg/measurementStore';
import type { PpgCameraViewProps, PpgCameraError } from '@/components/ppg/PpgCameraView';

const CAPTURE_MS = CAPTURE_SECONDS * 1000;
const WARMUP_MS = WARMUP_SECONDS * 1000;

type Phase = 'intro' | 'measuring' | 'result';

/**
 * Lazily resolve the camera view so `react-native-vision-camera` is only required
 * on a build where it exists. In Expo Go / the jest gate `isPpgSupported()` is
 * false, so this is never called and the native module is never resolved.
 * `undefined` = not attempted; `null` = attempted and unavailable.
 */
let CameraViewComp: React.ComponentType<PpgCameraViewProps> | null | undefined;
function loadCameraView(): React.ComponentType<PpgCameraViewProps> | null {
  if (CameraViewComp !== undefined) return CameraViewComp;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    CameraViewComp = require('@/components/ppg/PpgCameraView').default;
  } catch {
    CameraViewComp = null;
  }
  return CameraViewComp ?? null;
}

export default function HeartRateMeasureScreen() {
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  useKeepAwake(); // don't let the screen dim mid-measurement

  const supported = useMemo(() => isPpgSupported(), []);

  // Profile → age → max HR (shares the ['my-profile'] cache with Home/Profile).
  const { data: profile } = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile, retry: 1 });
  const age = ageFromDob((profile as any)?.dateOfBirth) ?? DEFAULT_AGE;
  const maxHr = maxHrForAge(age);

  const [phase, setPhase] = useState<Phase>('intro');
  const [progress, setProgress] = useState(0); // 0–1 countdown fraction
  const [remaining, setRemaining] = useState(CAPTURE_SECONDS);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [result, setResult] = useState<BpmEstimate | null>(null);
  const [tag, setTag] = useState<MeasurementTag>('none');
  const [saved, setSaved] = useState(false);
  const [camError, setCamError] = useState<PpgCameraError | null>(null);

  const samplesRef = useRef<PpgSample[]>([]);
  const enterRef = useRef(0); // when 'measuring' began (for the camera watchdog)
  const captureStartRef = useRef(0); // when the FIRST frame arrived (the capture clock)

  const CameraView = supported ? loadCameraView() : null;

  const onSample = useCallback((v: number) => {
    // The capture clock starts on the first real frame — NOT when the phase
    // began — so a slow permission prompt / camera warm-up doesn't eat into (or
    // wrongly trip the watchdog against) the measurement window.
    if (captureStartRef.current === 0) captureStartRef.current = Date.now();
    samplesRef.current.push({ t: Date.now(), v });
  }, []);
  const onCamError = useCallback((e: PpgCameraError) => setCamError(e), []);

  const startMeasuring = useCallback(() => {
    samplesRef.current = [];
    setResult(null);
    setSaved(false);
    setCamError(null);
    setWaveform([]);
    setProgress(0);
    setRemaining(CAPTURE_SECONDS);
    setTag('none');
    enterRef.current = Date.now();
    captureStartRef.current = 0;
    setPhase('measuring');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const finalize = useCallback(() => {
    // Drop the warm-up window (AGC/white-balance settle) before estimating.
    const start = captureStartRef.current;
    const windowed = samplesRef.current.filter((s) => s.t - start >= WARMUP_MS);
    // The frame processor emits v = -1 for frames where a fingertip was NOT covering
    // the lens+flash (uniform-frame gate — see PpgCameraView). If the finger was off
    // for much of the window, refuse to estimate rather than fabricate a heart rate
    // from a waved hand / ambient light. Otherwise estimate only from covered frames.
    const covered = windowed.filter((s) => s.v >= 0);
    const coverage = windowed.length > 0 ? covered.length / windowed.length : 0;
    const est: BpmEstimate =
      coverage < 0.6
        ? { bpm: null, confidence: 0, quality: 'poor', beats: 0, sampleRateHz: 0 }
        : estimateBpm(covered);
    setResult(est);
    setPhase('result');
    Haptics.notificationAsync(
      est.quality === 'poor'
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
  }, []);

  // Countdown + live-waveform ticker + a "camera never delivered frames" watchdog.
  useEffect(() => {
    if (phase !== 'measuring') return;
    const id = setInterval(() => {
      const now = Date.now();
      const started = captureStartRef.current > 0;

      if (!started) {
        // Waiting for the first frame (permission prompt / camera opening). Hold
        // the countdown at full; abort honestly only if frames NEVER arrive.
        if (now - enterRef.current > 12000) {
          clearInterval(id);
          setCamError((e) => e ?? 'no-camera');
          setPhase('intro');
        }
        return;
      }

      const elapsed = now - captureStartRef.current;
      setProgress(Math.min(1, elapsed / CAPTURE_MS));
      setRemaining(Math.max(0, Math.ceil((CAPTURE_MS - elapsed) / 1000)));

      const recent = samplesRef.current.filter((s) => s.v >= 0).slice(-150);
      if (recent.length >= 8) {
        const fs = estimateSampleRate(recent);
        setWaveform(bandpassFilter(recent.map((s) => s.v), fs).slice(-120));
      }

      if (elapsed >= CAPTURE_MS) {
        clearInterval(id);
        finalize();
      }
    }, 100);
    return () => clearInterval(id);
  }, [phase, finalize]);

  const onSave = useCallback(async () => {
    if (!result || result.bpm == null || saved) return;
    setSaved(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Server ingest is fire-and-forget: it feeds the digital twin but must never
    // block or fail the local save (and it degrades gracefully if the backend
    // hasn't shipped the camera_ppg source yet — the local history still holds it).
    ingestHealthSamples([
      {
        kind: 'heartRate',
        source: 'camera_ppg',
        startTime: new Date().toISOString(),
        value: result.bpm,
        unit: 'bpm',
      },
    ]).catch(() => {});
    await addMeasurement({
      bpm: result.bpm,
      confidence: result.confidence,
      quality: result.quality,
      tag,
    });
  }, [result, tag, saved]);

  const activeZone = result?.bpm != null ? zoneForBpm(result.bpm, maxHr) : null;
  const heroColor = activeZone ? zoneColor(colors, activeZone.key) : colors.accent.coral;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
      <StatusBar style="light" />
      <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          activeOpacity={0.85}
          onPress={() => router.back()}
          style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text.primary }]}>Camera Heart Rate</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {!supported ? (
          <UnsupportedState />
        ) : phase === 'intro' ? (
          <IntroState camError={camError} onStart={startMeasuring} />
        ) : phase === 'measuring' ? (
          <MeasuringState
            CameraView={CameraView}
            onSample={onSample}
            onCamError={onCamError}
            waveform={waveform}
            progress={progress}
            remaining={remaining}
            heroColor={heroColor}
            onCancel={() => setPhase('intro')}
          />
        ) : (
          <ResultState
            result={result}
            activeZoneLabel={activeZone?.label ?? null}
            heroColor={heroColor}
            tag={tag}
            onTag={setTag}
            saved={saved}
            onSave={onSave}
            onAgain={startMeasuring}
            onDone={() => router.back()}
          />
        )}

        <Disclaimer />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-views (module scope → stable identity; the camera never remounts on ticks)
// ─────────────────────────────────────────────────────────────────────────────

function Disclaimer() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  return (
    <Animated.View entering={FadeInDown.duration(420).delay(120)} style={{ marginTop: spacing['2xl'] }}>
      <View style={[styles.discRow, { borderColor: colors.border.default }]}>
        <Ionicons name="information-circle-outline" size={16} color={colors.text.tertiary} />
        <Text style={[typography.caption, { color: colors.text.tertiary, flex: 1 }]}>
          Camera heart rate is a wellness estimate — not a medical device, and not for diagnosis. For the
          most accurate readings, connect a Bluetooth chest strap or band.
        </Text>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Connect a Bluetooth device for more accurate heart rate"
        activeOpacity={0.85}
        onPress={() => router.push('/(settings)/ble-connect' as any)}
        style={[styles.bleRow, { borderColor: withAlpha(colors.accent.blue, 0.4), backgroundColor: withAlpha(colors.accent.blue, 0.08) }]}
      >
        <Ionicons name="bluetooth" size={16} color={colors.accent.blue} />
        <Text style={[typography.bodySm, { color: colors.accent.blue, flex: 1, fontWeight: '600' }]}>
          Want more accuracy? Connect a Bluetooth strap
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.accent.blue} />
      </TouchableOpacity>
    </Animated.View>
  );
}

function UnsupportedState() {
  const { spacing } = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(420)} style={{ marginTop: spacing.xl }}>
      <EmptyState
        icon="camera-outline"
        title="Camera measurement needs the app build"
        subtitle="This feature uses your camera and flash to read your pulse and isn't available in Expo Go. It works in the installed Zeitra app. In the meantime, you can connect a Bluetooth device."
      />
    </Animated.View>
  );
}

function IntroState({ camError, onStart }: { camError: PpgCameraError | null; onStart: () => void }) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const steps = [
    'Gently cover the BACK camera and the flash with your fingertip.',
    'Rest your hand on a table and hold completely still.',
    `Keep it there for about ${CAPTURE_SECONDS} seconds while we read your pulse.`,
  ];
  return (
    <Animated.View entering={FadeInDown.duration(420)}>
      <View style={{ alignItems: 'center', marginTop: spacing['2xl'], marginBottom: spacing.xl }}>
        <View style={[styles.introIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.12), borderColor: withAlpha(colors.accent.coral, 0.35) }]}>
          <Ionicons name="finger-print" size={44} color={colors.accent.coral} />
        </View>
      </View>
      <GlassCard radius={borderRadius.xl}>
        <View style={{ padding: spacing.lg }}>
          <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700', marginBottom: spacing.md }]}>
            How to measure
          </Text>
          {steps.map((line, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepDot, { backgroundColor: withAlpha(colors.accent.coral, 0.18) }]}>
                <Text style={[styles.stepNum, { color: colors.accent.coral }]}>{i + 1}</Text>
              </View>
              <Text style={[typography.body, { color: colors.text.secondary, flex: 1 }]}>{line}</Text>
            </View>
          ))}
        </View>
      </GlassCard>

      {camError ? (
        <View style={[styles.warnRow, { borderColor: withAlpha(colors.accent.amber, 0.5), backgroundColor: withAlpha(colors.accent.amber, 0.1) }]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.accent.amber} />
          <Text style={[typography.caption, { color: colors.text.secondary, flex: 1 }]}>
            {camError === 'permission-denied'
              ? 'Camera access is off. Enable the camera for Zeitra in Settings, then try again.'
              : "Couldn't start the camera. Make sure no other app is using it and try again."}
          </Text>
        </View>
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        <CtaButton label="Start measurement" icon="heart" size="lg" onPress={onStart} />
      </View>
    </Animated.View>
  );
}

function CamFallback() {
  const { colors } = useTheme();
  return (
    <View style={[styles.camFallback, { backgroundColor: colors.background.secondary }]}>
      <Ionicons name="camera-outline" size={28} color={colors.text.tertiary} />
    </View>
  );
}

function MeasuringState({
  CameraView,
  onSample,
  onCamError,
  waveform,
  progress,
  remaining,
  heroColor,
  onCancel,
}: {
  CameraView: React.ComponentType<PpgCameraViewProps> | null;
  onSample: (v: number) => void;
  onCamError: (e: PpgCameraError) => void;
  waveform: number[];
  progress: number;
  remaining: number;
  heroColor: string;
  onCancel: () => void;
}) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(420)} style={{ alignItems: 'center', marginTop: spacing['2xl'] }}>
      <CircularProgress size={236} strokeWidth={6} progress={progress} color={heroColor} trackColor={colors.border.default}>
        <View style={[styles.camWindow, { borderColor: withAlpha(heroColor, 0.5) }]}>
          {CameraView ? (
            <ErrorBoundary fallback={<CamFallback />}>
              <CameraView collecting onSample={onSample} onError={onCamError} style={StyleSheet.absoluteFillObject as any} />
            </ErrorBoundary>
          ) : (
            <CamFallback />
          )}
          <View style={styles.camOverlay}>
            <Text style={styles.countText}>{remaining}</Text>
          </View>
        </View>
      </CircularProgress>

      <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.lg }]}>
        Hold still — reading your pulse…
      </Text>

      <View style={{ width: '100%', marginTop: spacing.xl }}>
        <GlassCard radius={borderRadius.xl}>
          <View style={{ padding: spacing.lg }}>
            <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.sm }]}>LIVE SIGNAL</Text>
            {waveform.length >= 4 ? (
              <Waveform data={waveform} color={heroColor} track={colors.border.default} />
            ) : (
              <View style={styles.waveEmpty}>
                <Ionicons name="pulse-outline" size={24} color={colors.text.tertiary} />
                <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.xs }]}>
                  Looking for your pulse… make sure your finger covers the camera and flash.
                </Text>
              </View>
            )}
          </View>
        </GlassCard>
      </View>

      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel measurement" onPress={onCancel} style={{ marginTop: spacing.lg, padding: spacing.sm }}>
        <Text style={[typography.body, { color: colors.text.tertiary, fontWeight: '600' }]}>Cancel</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function ResultState({
  result,
  activeZoneLabel,
  heroColor,
  tag,
  onTag,
  saved,
  onSave,
  onAgain,
  onDone,
}: {
  result: BpmEstimate | null;
  activeZoneLabel: string | null;
  heroColor: string;
  tag: MeasurementTag;
  onTag: (t: MeasurementTag) => void;
  saved: boolean;
  onSave: () => void;
  onAgain: () => void;
  onDone: () => void;
}) {
  const { colors, typography, spacing, borderRadius, shadows } = useTheme();

  // Poor / no reading → honest retry, never a fabricated number.
  if (!result || result.bpm == null || result.quality === 'poor') {
    return (
      <Animated.View entering={FadeInDown.duration(420)} style={{ marginTop: spacing['2xl'] }}>
        <GlassCard radius={borderRadius.xl}>
          <View style={{ padding: spacing.lg, alignItems: 'center' }}>
            <Ionicons name="pulse-outline" size={40} color={colors.accent.amber} />
            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700', marginTop: spacing.md, textAlign: 'center' }]}>
              Couldn't get a reliable reading
            </Text>
            <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.xs }]}>
              Keep completely still, cover both the camera and the flash with your fingertip, and try again
              in good lighting.
            </Text>
          </View>
        </GlassCard>
        <View style={{ marginTop: spacing.xl }}>
          <CtaButton label="Try again" icon="refresh" size="lg" onPress={onAgain} />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(420)} style={{ marginTop: spacing['2xl'] }}>
      <View style={[styles.resultHero, { backgroundColor: colors.background.secondary, borderColor: withAlpha(heroColor, 0.4) }, shadows.glow(heroColor)]}>
        <View style={styles.bpmRow}>
          <Ionicons name="heart" size={30} color={heroColor} />
          <Text style={[styles.bpm, { color: colors.text.primary }]}>{result.bpm}</Text>
          <Text style={[styles.bpmUnit, { color: colors.text.secondary }]}>bpm</Text>
        </View>
        <View style={styles.pillRow}>
          {activeZoneLabel ? (
            <View style={[styles.pill, { backgroundColor: withAlpha(heroColor, 0.14) }]}>
              <Ionicons name="pulse" size={13} color={heroColor} />
              <Text style={[styles.pillTxt, { color: heroColor }]}>{activeZoneLabel} zone</Text>
            </View>
          ) : null}
          <View style={[styles.pill, { backgroundColor: withAlpha(result.quality === 'good' ? colors.success : colors.accent.amber, 0.14) }]}>
            <Ionicons
              name={result.quality === 'good' ? 'checkmark-circle' : 'information-circle'}
              size={13}
              color={result.quality === 'good' ? colors.success : colors.accent.amber}
            />
            <Text style={[styles.pillTxt, { color: result.quality === 'good' ? colors.success : colors.accent.amber }]}>
              {result.quality === 'good' ? 'Good signal' : 'Fair signal'}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: spacing['2xl'], marginBottom: spacing.sm }]}>
        TAG THIS READING
      </Text>
      <View style={styles.tagRow}>
        {MEASUREMENT_TAGS.map((t) => {
          const on = tag === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Tag as ${t.label}`}
              activeOpacity={0.85}
              onPress={() => onTag(on ? 'none' : t.key)}
              disabled={saved}
              style={[
                styles.tagChip,
                {
                  borderColor: on ? withAlpha(colors.accent.coral, 0.6) : colors.border.default,
                  backgroundColor: on ? withAlpha(colors.accent.coral, 0.14) : colors.background.secondary,
                  opacity: saved ? 0.6 : 1,
                },
              ]}
            >
              <Text style={[typography.bodySm, { color: on ? colors.accent.coral : colors.text.secondary, fontWeight: on ? '700' : '600' }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ marginTop: spacing.xl }}>
        {saved ? (
          <View style={[styles.savedRow, { borderColor: withAlpha(colors.success, 0.4), backgroundColor: withAlpha(colors.success, 0.1) }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={[typography.body, { color: colors.success, fontWeight: '700' }]}>Saved to your history</Text>
          </View>
        ) : (
          <CtaButton label="Save reading" icon="save-outline" size="lg" onPress={onSave} />
        )}
        <View style={styles.resultActions}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Measure again" onPress={onAgain} style={styles.secondaryBtn}>
            <Ionicons name="refresh" size={16} color={colors.text.secondary} />
            <Text style={[typography.body, { color: colors.text.secondary, fontWeight: '600' }]}>Measure again</Text>
          </TouchableOpacity>
          {saved ? (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Done" onPress={onDone} style={styles.secondaryBtn}>
              <Text style={[typography.body, { color: colors.accent.coral, fontWeight: '700' }]}>Done</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

/** Live SVG waveform of the band-passed signal, normalised to its own min/max. */
function Waveform({ data, color, track }: { data: number[]; color: string; track: string }) {
  const W = 300;
  const H = 80;
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
    <View style={{ width: '100%' }} accessibilityRole="image" accessibilityLabel="Live heart-rate waveform">
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Polyline points={`${pad},${H / 2} ${W - pad},${H / 2}`} stroke={track} strokeWidth={1} fill="none" />
        <Polyline points={points} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  // Intro
  introIcon: { width: 92, height: 92, borderRadius: 46, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontFamily: typo.captionMedium.fontFamily, fontSize: 13, fontWeight: '700' },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 16 },

  // Measuring
  camWindow: { width: 188, height: 188, borderRadius: 94, borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  camOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#FFF', fontFamily: typo.statLarge.fontFamily, fontSize: 52, textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  camFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  waveEmpty: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16 },

  // Result
  resultHero: { borderRadius: 22, borderWidth: 1, padding: 22, alignItems: 'center' },
  bpmRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bpm: { fontFamily: typo.statLarge.fontFamily, fontSize: 64, lineHeight: 70 },
  bpmUnit: { fontFamily: typo.statTiny.fontFamily, fontSize: 16, marginBottom: 10 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999 },
  pillTxt: { fontFamily: typo.captionMedium.fontFamily, fontSize: 12 },
  tagRow: { flexDirection: 'row', gap: 8 },
  tagChip: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, borderRadius: 14, borderWidth: 1 },
  resultActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 8 },

  // Disclaimer + steer
  discRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  bleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 12 },
});
