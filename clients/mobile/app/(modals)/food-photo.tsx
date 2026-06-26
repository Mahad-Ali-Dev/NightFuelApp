import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet,
    ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
    FadeInDown, FadeIn, FadeOut,
    useAnimatedStyle, useSharedValue,
    withRepeat, withTiming, Easing, cancelAnimation,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { recognizeFoodPhoto, VisionFoodResult } from '@/api/meals';
import { EmptyState, GlassCard } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { CtaButton } from '@/components/ui/CtaButton';

// ---------------------------------------------------------------------------
// POINT-AT-A-PLATE photo food recognition.
//
// The vision sibling of barcode-scanner.tsx. Instead of decoding a barcode and
// looking the product up in Open Food Facts, this screen takes a single photo
// of a plate and POSTs it (base64) to the /food-vision gateway, which asks a
// multimodal LLM to ESTIMATE the dish + its per-serving nutrition. The result
// card REUSES the same shape barcode-scanner renders — name, the calorie hero,
// the 3 macro cells, and the Micronutrients GlassCard panel — plus an honest
// "AI estimate · {confidence}%" badge and the model's portion note, because the
// numbers are a photo estimate, NOT a label reading.
//
// The /food-vision response `food` mirrors /food-search's FoodNutrition (same
// keys + units), so VisionFoodResult is the FoodResult the barcode screen uses.
// addToMeal threads the SAME deep-link params (name + 4 macros + a present-only
// `barcodeMicros` JSON bag) into log-meal, so a photo-recognized food persists
// through the identical addToMeal → log-meal → /v1/meals/log path as a scan.
// ---------------------------------------------------------------------------

// ── Micronutrient panel metadata ─────────────────────────────────────────────
// Identical vocabulary to barcode-scanner's BARCODE_MICROS: the /food-vision
// gateway emits the SAME key set as /food-search (parseProduct → FoodNutrition),
// so the present-micro detection + labels + units are shared 1:1. Minerals, then
// vitamins, then cholesterol — a stable reading order.
type MicroKey =
    | 'sodium' | 'potassium' | 'calcium' | 'iron' | 'magnesium' | 'phosphorus' | 'zinc'
    | 'vitaminC' | 'vitaminA' | 'vitaminD' | 'vitaminB6' | 'vitaminB12' | 'folate'
    | 'cholesterol';

interface MicroMeta { key: MicroKey; label: string; unit: 'mg' | 'µg' }

const VISION_MICROS: readonly MicroMeta[] = [
    { key: 'sodium',      label: 'Sodium',      unit: 'mg' },
    { key: 'potassium',   label: 'Potassium',   unit: 'mg' },
    { key: 'calcium',     label: 'Calcium',     unit: 'mg' },
    { key: 'iron',        label: 'Iron',        unit: 'mg' },
    { key: 'magnesium',   label: 'Magnesium',   unit: 'mg' },
    { key: 'phosphorus',  label: 'Phosphorus',  unit: 'mg' },
    { key: 'zinc',        label: 'Zinc',        unit: 'mg' },
    { key: 'vitaminC',    label: 'Vitamin C',   unit: 'mg' },
    { key: 'vitaminA',    label: 'Vitamin A',   unit: 'µg' },
    { key: 'vitaminD',    label: 'Vitamin D',   unit: 'µg' },
    { key: 'vitaminB6',   label: 'Vitamin B6',  unit: 'mg' },
    { key: 'vitaminB12',  label: 'Vitamin B12', unit: 'µg' },
    { key: 'folate',      label: 'Folate',      unit: 'µg' },
    { key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
] as const;

interface PresentMicro extends MicroMeta { value: number }

// A micro is "present" only when it is a real, finite number — null / undefined
// (the model couldn't estimate it) and NaN are skipped so the panel never shows
// an empty or "NaN mg" row. Returns [] when the estimate carries no micros → no
// panel renders. Mirrors barcode-scanner's getPresentBarcodeMicros exactly.
const getPresentMicros = (food: VisionFoodResult | null): PresentMicro[] => {
    if (!food) return [];
    const out: PresentMicro[] = [];
    for (const meta of VISION_MICROS) {
        const value = (food as unknown as Record<string, unknown>)[meta.key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            out.push({ ...meta, value });
        }
    }
    return out;
};

const formatMicroValue = (value: number): string =>
    String(value < 10 ? Math.round(value * 10) / 10 : Math.round(value));

// Render the 0..1 confidence as a whole percent for the honesty badge.
const formatConfidencePct = (c: number): number =>
    Math.max(0, Math.min(100, Math.round(c * 100)));

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function FoodPhotoModal() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const cameraRef = useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const [analyzing, setAnalyzing] = useState(false);
    // Detected food held in state so the result slides up in-place; the CTA
    // performs the navigation (same pattern as barcode-scanner).
    const [result, setResult] = useState<VisionFoodResult | null>(null);
    const [confidence, setConfidence] = useState(0);
    const [portionNote, setPortionNote] = useState('');

    // A soft pulsing reticle while idle so the frame reads as "ready to capture"
    // (transform/opacity only — interruptible). Replaces the barcode sweep line.
    const pulse = useSharedValue(0);
    useEffect(() => {
        pulse.value = withRepeat(
            withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
            -1,
            true,
        );
        return () => cancelAnimation(pulse);
    }, [pulse]);
    const reticleStyle = useAnimatedStyle(() => ({
        opacity: 0.55 + pulse.value * 0.35,
        transform: [{ scale: 0.98 + pulse.value * 0.02 }],
    }));

    if (!permission) {
        return <View style={{ flex: 1, backgroundColor: colors.background.primary }} />;
    }

    if (!permission.granted) {
        // Once the OS dialog is permanently denied, requestPermission() resolves
        // without re-prompting — so send the user to Settings instead of a no-op.
        const blocked = !permission.canAskAgain;
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary, justifyContent: 'center' }]}>
                <EmptyState
                    icon="camera-outline"
                    title="Camera access needed"
                    subtitle={
                        blocked
                            ? 'Camera access is turned off. Enable it in Settings to scan a plate and estimate its nutrition.'
                            : 'Allow camera access to scan a plate and estimate its nutrition instantly.'
                    }
                    actionLabel={blocked ? 'Open Settings' : 'Grant Permission'}
                    onAction={blocked ? () => Linking.openSettings() : requestPermission}
                />
            </View>
        );
    }

    // Hand the recognized food to log-meal, pre-filled — the EXACT same params
    // the barcode scanner forwards (name + 4 headline macros as strings, plus the
    // present, finite micros + secondary macros as ONE compact JSON param,
    // `barcodeMicros`). log-meal's parseBarcodeMicros already accepts this shape,
    // so a photo estimate persists through the identical path as a scan with no
    // backend change. Per-serving micros are forwarded as-is (not qty-scaled).
    const addToMeal = (food: VisionFoodResult) => {
        const microPayload: Record<string, number> = {};
        for (const m of getPresentMicros(food)) {
            microPayload[m.key] = m.value;
        }
        for (const key of ['fiber', 'sugar', 'saturatedFat', 'transFat'] as const) {
            const v = food[key];
            if (typeof v === 'number' && Number.isFinite(v)) microPayload[key] = v;
        }
        const hasMicros = Object.keys(microPayload).length > 0;
        router.navigate({
            pathname: '/(meals)/log-meal',
            params: {
                barcodeName:     food.name,
                barcodeCalories: String(Math.round(food.calories)),
                barcodeProtein:  String(food.protein),
                barcodeCarbs:    String(food.carbs),
                barcodeFat:      String(food.fat),
                ...(hasMicros ? { barcodeMicros: JSON.stringify(microPayload) } : {}),
            },
        } as any);
    };

    const resetScan = () => {
        setResult(null);
        setConfidence(0);
        setPortionNote('');
        setAnalyzing(false);
    };

    // Map a /food-vision non-result (no_food / low_confidence / error) onto a
    // recoverable Alert that keeps the camera usable: retake or add manually.
    const offerRetryOrManual = (title: string, message: string) => {
        Alert.alert(title, message, [
            { text: 'Add manually', onPress: () => router.navigate('/(meals)/log-meal' as any) },
            { text: 'Try again', style: 'cancel', onPress: resetScan },
        ]);
    };

    const capture = async () => {
        if (analyzing || result) return;
        const cam = cameraRef.current;
        if (!cam) return;

        setAnalyzing(true);
        try {
            // Quality 0.5 keeps the base64 payload well under the gateway's ~5MB
            // cap while staying legible for the model. base64:true so we can POST
            // it straight to /food-vision without a file read.
            const photo = await cam.takePictureAsync({ base64: true, quality: 0.5 });
            const b64 = photo?.base64;
            if (!b64) {
                offerRetryOrManual('Capture failed', 'Could not capture the photo. Please try again.');
                setAnalyzing(false);
                return;
            }

            const { food, confidence: conf, portionNote: note, error } =
                await recognizeFoodPhoto(`data:image/jpeg;base64,${b64}`);

            if (food) {
                setResult(food);
                setConfidence(typeof conf === 'number' ? conf : 0);
                setPortionNote(note ?? '');
            } else if (error === 'no_food') {
                offerRetryOrManual(
                    'No food found',
                    "We couldn't spot a dish in that photo. Try getting closer, with the food centered and well lit.",
                );
            } else if (error === 'low_confidence') {
                offerRetryOrManual(
                    'Not quite sure',
                    "We couldn't confidently identify that plate. Try another angle, or add it manually.",
                );
            } else if (error === 'rate_limited') {
                offerRetryOrManual(
                    'Busy right now',
                    'The estimator is at capacity for the moment. Try again shortly, or add it manually.',
                );
            } else if (error === 'timeout') {
                offerRetryOrManual(
                    'Took too long',
                    'The estimate timed out. Check your connection and try again, or add it manually.',
                );
            } else {
                offerRetryOrManual(
                    'Estimate failed',
                    "We couldn't estimate that photo. Please try again, or add it manually.",
                );
            }
        } catch {
            offerRetryOrManual(
                'Estimate failed',
                'Could not reach the estimator. Check your connection and try again.',
            );
        } finally {
            setAnalyzing(false);
        }
    };

    const macros = result
        ? [
            { label: 'Protein', value: Math.round(result.protein), unit: 'g', tint: colors.accent.cyan },
            { label: 'Carbs',   value: Math.round(result.carbs),   unit: 'g', tint: colors.accent.blue },
            { label: 'Fat',     value: Math.round(result.fat),     unit: 'g', tint: colors.accent.amber },
        ]
        : [];

    const micros = getPresentMicros(result);
    const confidencePct = formatConfidencePct(confidence);

    return (
        <View style={[styles.container, { backgroundColor: '#000' }]}>
            <StatusBar style="light" />
            <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFillObject}
                facing="back"
            />

            {/* Overlay — vignette darkens the edges, keeps the frame center bright */}
            <View style={styles.overlay} pointerEvents="box-none">
                {/* ---- Top bar: drag-handle dismiss + value-forward title ---- */}
                <View style={[styles.topArea, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
                    <View style={styles.topRow}>
                        <View style={styles.topSpacer} />
                        <View style={styles.handle} />
                        <PressableScale
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                            style={[styles.closeBtn, { backgroundColor: withAlpha('#000000', 0.45), borderColor: withAlpha('#FFFFFF', 0.14) }]}
                            onPress={() => router.back()}
                        >
                            <Ionicons name="close" size={22} color="#fff" />
                        </PressableScale>
                    </View>

                    <View style={styles.titleBlock}>
                        <View style={[styles.eyebrowPill, { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.30) }]}>
                            <Ionicons name="sparkles-outline" size={13} color={colors.accent.coral} />
                            <Text style={[typography.overline, { color: colors.text.secondary, marginLeft: 6 }]}>
                                AI PLATE ESTIMATE
                            </Text>
                        </View>
                        <Text style={[typography.display, styles.title]}>Scan a plate</Text>
                    </View>
                </View>

                {/* ---- Capture frame: lime corners + pulsing reticle ---- */}
                <View style={styles.scannerArea} pointerEvents="none">
                    <View style={styles.scannerBox}>
                        <View style={[styles.corner, styles.cornerTopLeft,     { borderColor: colors.accent.coral }]} />
                        <View style={[styles.corner, styles.cornerTopRight,    { borderColor: colors.accent.coral }]} />
                        <View style={[styles.corner, styles.cornerBottomLeft,  { borderColor: colors.accent.coral }]} />
                        <View style={[styles.corner, styles.cornerBottomRight, { borderColor: colors.accent.coral }]} />

                        {analyzing ? (
                            <View style={styles.frameCenter}>
                                <ActivityIndicator color={colors.accent.cyan} size="large" />
                            </View>
                        ) : !result ? (
                            // The pulsing reticle owns its own opacity via reticleStyle, so
                            // it carries NO layout `entering` (which would warn about
                            // overwriting opacity). The pulse alone fades it in.
                            <Animated.View
                                key="reticle"
                                style={[styles.reticle, reticleStyle]}
                                pointerEvents="none"
                            >
                                <Ionicons name="restaurant-outline" size={40} color={withAlpha('#FFFFFF', 0.55)} />
                            </Animated.View>
                        ) : null}
                    </View>
                </View>

                {/* ---- Bottom: shutter while idle · result card on detect ---- */}
                <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]} pointerEvents="box-none">
                    {result ? (
                        <Animated.View
                            key="result"
                            entering={FadeInDown.springify().damping(18).mass(0.9)}
                            exiting={FadeOut.duration(160)}
                            style={[
                                styles.resultCard,
                                {
                                    backgroundColor: withAlpha(colors.background.secondary, 0.94),
                                    borderColor: colors.border.light,
                                },
                            ]}
                        >
                            {/* Honesty header — AI estimate, NOT a label reading, with the
                                model's confidence as a percent. */}
                            <View style={styles.resultHead}>
                                <View style={[styles.foundDot, { backgroundColor: colors.accent.purple }]}>
                                    <Ionicons name="sparkles" size={13} color={colors.text.inverse} />
                                </View>
                                <Text style={[typography.overline, { color: colors.accent.purple }]}>
                                    AI ESTIMATE · {confidencePct}%
                                </Text>
                            </View>

                            <Text style={[typography.h2, { color: colors.text.primary }]} numberOfLines={2}>
                                {result.name}
                            </Text>

                            {/* Portion note — the serving the model assumed, shown verbatim
                                so the estimate is honest about what it measured. */}
                            {portionNote ? (
                                <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 4 }]} numberOfLines={2}>
                                    {portionNote}
                                </Text>
                            ) : null}

                            {/* Hero stat — the calorie VALUE dominates its label */}
                            <View style={styles.calRow}>
                                <Text style={[typography.statLarge, { color: colors.text.primary }]}>
                                    {Math.round(result.calories)}
                                </Text>
                                <Text style={[typography.subtitle, { color: colors.text.secondary, marginLeft: 8, marginBottom: 8 }]}>
                                    kcal
                                </Text>
                            </View>

                            {/* Macros — value over label, each with a calm functional tint */}
                            <View style={styles.macroRow}>
                                {macros.map((m) => (
                                    <View
                                        key={m.label}
                                        style={[styles.macroCell, { backgroundColor: colors.background.tertiary, borderColor: colors.border.default }]}
                                    >
                                        <View style={styles.macroValueRow}>
                                            <Text style={[typography.statSmall, { color: colors.text.primary }]}>{m.value}</Text>
                                            <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 2, marginBottom: 3 }]}>{m.unit}</Text>
                                        </View>
                                        <View style={styles.macroLabelRow}>
                                            <View style={[styles.macroDot, { backgroundColor: m.tint }]} />
                                            <Text style={[typography.caption, { color: colors.text.secondary }]}>{m.label}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>

                            {/* Micronutrients — the SAME panel barcode-scanner renders, shown
                                ONLY when the estimate reports any present (finite) micros.
                                GlassCard owns the surface; tokens + Saira (typography.*) only. */}
                            {micros.length > 0 ? (
                                <Animated.View entering={FadeIn.duration(320)}>
                                    <GlassCard radius={16} style={styles.microCard} testID="micronutrients-card">
                                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: 'bold' }]}>
                                            Micronutrients
                                        </Text>
                                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2, marginBottom: 10 }]}>
                                            Per serving · estimated
                                        </Text>
                                        <View style={styles.microGrid}>
                                            {micros.map((m) => (
                                                <View
                                                    key={m.key}
                                                    style={[styles.microCell, { backgroundColor: colors.background.tertiary, borderColor: colors.border.default }]}
                                                >
                                                    <View style={styles.microValueRow}>
                                                        <Text style={[typography.statTiny, { color: colors.text.primary }]}>{formatMicroValue(m.value)}</Text>
                                                        <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 2 }]}>{m.unit}</Text>
                                                    </View>
                                                    <Text style={[typography.caption, { color: colors.text.secondary }]} numberOfLines={1}>{m.label}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </GlassCard>
                                </Animated.View>
                            ) : null}

                            {/* Thumb-zone primary CTA — CtaButton owns the lime fill/glow/ink. */}
                            <CtaButton
                                label="Add to Meal"
                                icon="add-circle"
                                size="lg"
                                accessibilityLabel={`Add ${result.name} to meal`}
                                style={styles.addBtn}
                                onPress={() => addToMeal(result)}
                            />

                            <PressableScale
                                accessibilityRole="button"
                                accessibilityLabel="Scan another plate"
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={styles.scanAgainBtn}
                                onPress={resetScan}
                            >
                                <Ionicons name="camera-outline" size={16} color={colors.text.secondary} />
                                <Text style={[typography.bodyMedium, { color: colors.text.secondary, marginLeft: 6 }]}>
                                    Scan another
                                </Text>
                            </PressableScale>
                        </Animated.View>
                    ) : (
                        <Animated.View key="capture" entering={FadeInDown.duration(420)} style={styles.captureBlock}>
                            <View style={[styles.hintPill, { backgroundColor: withAlpha('#000000', 0.5), borderColor: withAlpha('#FFFFFF', 0.10) }]}>
                                {analyzing ? (
                                    <>
                                        <ActivityIndicator color={colors.accent.cyan} size="small" />
                                        <Text style={[typography.bodyMedium, { color: '#fff', marginLeft: 10 }]}>
                                            Estimating your plate…
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <Ionicons name="sparkles-outline" size={18} color={colors.accent.coral} />
                                        <Text style={[typography.bodyMedium, { color: '#fff', marginLeft: 10 }]}>
                                            Center your plate, then tap to estimate
                                        </Text>
                                    </>
                                )}
                            </View>

                            {/* Shutter — a large round capture button. Disabled while a
                                request is in flight so the camera can't double-fire. */}
                            <PressableScale
                                accessibilityRole="button"
                                accessibilityLabel="Capture plate photo"
                                accessibilityState={{ disabled: analyzing }}
                                disabled={analyzing}
                                style={[styles.shutterOuter, { borderColor: withAlpha('#FFFFFF', 0.85) }]}
                                onPress={capture}
                            >
                                <View style={[styles.shutterInner, { backgroundColor: colors.accent.coral, opacity: analyzing ? 0.5 : 1 }]} />
                            </PressableScale>

                            {/* Manual-entry fallback — secondary. */}
                            <PressableScale
                                accessibilityRole="button"
                                accessibilityLabel="Enter food manually"
                                style={[styles.manualBtn, { backgroundColor: withAlpha('#FFFFFF', 0.08), borderColor: withAlpha('#FFFFFF', 0.16) }]}
                                onPress={() => router.navigate('/(meals)/log-meal' as any)}
                            >
                                <Ionicons name="create-outline" size={18} color={colors.text.primary} />
                                <Text style={[typography.subtitle, { color: colors.text.primary, marginLeft: 8 }]}>
                                    Enter manually
                                </Text>
                            </PressableScale>
                        </Animated.View>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },

    // Top
    topArea: { paddingHorizontal: 20, paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0.45)' },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    topSpacer: { width: 40, height: 40 },
    handle: { width: 44, height: 5, borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.35)' },
    closeBtn: {
        width: 40, height: 40, borderRadius: 20, borderWidth: 1,
        alignItems: 'center', justifyContent: 'center',
    },
    titleBlock: { marginTop: 16, alignItems: 'center' },
    eyebrowPill: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999, borderWidth: 1,
    },
    title: { color: '#fff', marginTop: 10, textAlign: 'center' },

    // Capture frame
    scannerArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scannerBox: { width: 280, height: 280, position: 'relative', alignItems: 'center', justifyContent: 'center' },
    corner: { position: 'absolute', width: 42, height: 42 },
    cornerTopLeft:     { top: 0,    left: 0,  borderTopWidth: 4,    borderLeftWidth: 4,  borderTopLeftRadius: 14 },
    cornerTopRight:    { top: 0,    right: 0, borderTopWidth: 4,    borderRightWidth: 4, borderTopRightRadius: 14 },
    cornerBottomLeft:  { bottom: 0, left: 0,  borderBottomWidth: 4, borderLeftWidth: 4,  borderBottomLeftRadius: 14 },
    cornerBottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
    reticle: { alignItems: 'center', justifyContent: 'center' },
    frameCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

    // Bottom
    bottomArea: { paddingHorizontal: 20 },

    captureBlock: { alignItems: 'center' },
    hintPill: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 18, paddingVertical: 12, borderRadius: 9999, borderWidth: 1,
    },
    shutterOuter: {
        width: 76, height: 76, borderRadius: 38, borderWidth: 4,
        alignItems: 'center', justifyContent: 'center', marginTop: 20,
    },
    shutterInner: { width: 58, height: 58, borderRadius: 29 },
    manualBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        marginTop: 18, paddingVertical: 14, paddingHorizontal: 24,
        borderRadius: 14, borderWidth: 1, minHeight: 52, alignSelf: 'stretch',
    },

    // Result card
    resultCard: {
        borderRadius: 24, borderWidth: 1, padding: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 16,
    },
    resultHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    foundDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
    calRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 12, marginBottom: 16 },
    macroRow: { flexDirection: 'row', gap: 10 },
    macroCell: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
    macroValueRow: { flexDirection: 'row', alignItems: 'flex-end' },
    macroLabelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    macroDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },

    microCard: { marginTop: 14, padding: 16 },
    microGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    microCell: { width: '31%', borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 10 },
    microValueRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 2 },
    addBtn: { marginTop: 18 },
    scanAgainBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        marginTop: 14, paddingVertical: 8, minHeight: 44,
    },
});
