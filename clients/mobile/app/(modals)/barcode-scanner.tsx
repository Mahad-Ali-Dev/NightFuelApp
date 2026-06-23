import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet,
    ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
    FadeInDown, FadeIn, FadeOut,
    useAnimatedStyle, useSharedValue,
    withRepeat, withTiming, withSequence, Easing, cancelAnimation,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { apiClient } from '@/api/client';
import { EmptyState } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { CtaButton } from '@/components/ui/CtaButton';

// Travel of the sweep line inside the 260pt scanner box. The line sits 24pt in
// from each edge so it never collides with the lime corners.
const SCAN_TRAVEL = 260 - 24 * 2;

// ---------------------------------------------------------------------------
// Barcode lookup via the Next.js API gateway → Open Food Facts
// ---------------------------------------------------------------------------

interface FoodResult {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

const lookupBarcode = async (code: string): Promise<FoodResult | null> => {
    const { data } = await apiClient.get<{ food: FoodResult }>('/food-search', {
        params: { barcode: code },
    });
    return data.food ?? null;
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function BarcodeScannerModal() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [lookingUp, setLookingUp] = useState(false);
    // Detected food held in state so the result slides up in-place (instead of an
    // immediate hand-off). The original navigate(...) now fires from the card CTA.
    const [result, setResult] = useState<FoodResult | null>(null);

    // Sweep the scan line down→up→down on a continuous, interruptible loop
    // (transform-only) so the frame reads as actively scanning.
    const sweep = useSharedValue(0);
    useEffect(() => {
        sweep.value = withRepeat(
            withSequence(
                withTiming(SCAN_TRAVEL, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
                withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
            ),
            -1,
            false,
        );
        return () => cancelAnimation(sweep);
    }, [sweep]);
    const scanLineStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: sweep.value }],
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
                            ? 'Camera access is turned off. Enable it in Settings to scan food barcodes and log meals instantly.'
                            : 'Allow camera access to scan food barcodes and log meals instantly.'
                    }
                    actionLabel={blocked ? 'Open Settings' : 'Grant Permission'}
                    onAction={blocked ? () => Linking.openSettings() : requestPermission}
                />
            </View>
        );
    }

    // Hand the detected food to log-meal, pre-filled — identical params/route to
    // the original on-detect navigation, just triggered from the result card CTA.
    const addToMeal = (food: FoodResult) => {
        router.navigate({
            pathname: '/(meals)/log-meal',
            params: {
                barcodeName:     food.name,
                barcodeCalories: String(Math.round(food.calories)),
                barcodeProtein:  String(food.protein),
                barcodeCarbs:    String(food.carbs),
                barcodeFat:      String(food.fat),
            },
        } as any);
    };

    const resetScan = () => {
        setResult(null);
        setScanned(false);
        setLookingUp(false);
    };

    const handleBarcodeScanned = async ({ data }: { type: string; data: string }) => {
        if (scanned || lookingUp) return;
        setScanned(true);
        setLookingUp(true);

        try {
            const food = await lookupBarcode(data);

            if (food) {
                // Surface the result as a slide-up card; CTA performs the navigation.
                setResult(food);
            } else {
                Alert.alert(
                    'Product Not Found',
                    `Barcode "${data}" wasn't found in the database. You can search for it manually.`,
                    [
                        { text: 'Search Manually', onPress: () => router.navigate('/(meals)/log-meal' as any) },
                        { text: 'Scan Again', onPress: () => { setScanned(false); setLookingUp(false); } },
                    ]
                );
            }
        } catch (err: any) {
            const isNotFound = err?.response?.status === 404;
            Alert.alert(
                isNotFound ? 'Product Not Found' : 'Lookup Failed',
                isNotFound
                    ? `Barcode "${data}" wasn't found in the database. You can search for it manually.`
                    : 'Could not reach the food database. Check your connection and try again.',
                [
                    { text: 'Search Manually', onPress: () => router.navigate('/(meals)/log-meal' as any) },
                    { text: 'Scan Again', onPress: () => { setScanned(false); setLookingUp(false); } },
                ]
            );
        } finally {
            setLookingUp(false);
        }
    };

    const macros = result
        ? [
            { label: 'Protein', value: Math.round(result.protein), unit: 'g', tint: colors.accent.cyan },
            { label: 'Carbs',   value: Math.round(result.carbs),   unit: 'g', tint: colors.accent.blue },
            { label: 'Fat',     value: Math.round(result.fat),     unit: 'g', tint: colors.accent.amber },
        ]
        : [];

    return (
        <View style={[styles.container, { backgroundColor: '#000' }]}>
            <StatusBar style="light" />
            <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                barcodeScannerSettings={{
                    barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'],
                }}
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
                            <Ionicons name="barcode-outline" size={13} color={colors.accent.coral} />
                            <Text style={[typography.overline, { color: colors.text.secondary, marginLeft: 6 }]}>
                                SCAN TO LOG
                            </Text>
                        </View>
                        <Text style={[typography.display, styles.title]}>Scan a barcode</Text>
                    </View>
                </View>

                {/* ---- Scanner frame: lime corners + sweeping scan line ---- */}
                <View style={styles.scannerArea} pointerEvents="none">
                    <View style={styles.scannerBox}>
                        <View style={[styles.corner, styles.cornerTopLeft,     { borderColor: colors.accent.coral }]} />
                        <View style={[styles.corner, styles.cornerTopRight,    { borderColor: colors.accent.coral }]} />
                        <View style={[styles.corner, styles.cornerBottomLeft,  { borderColor: colors.accent.coral }]} />
                        <View style={[styles.corner, styles.cornerBottomRight, { borderColor: colors.accent.coral }]} />

                        {lookingUp ? (
                            <View style={styles.frameCenter}>
                                <ActivityIndicator color={colors.accent.cyan} size="large" />
                            </View>
                        ) : !result ? (
                            <Animated.View
                                key="scanline"
                                entering={FadeIn.duration(400)}
                                style={[styles.scanLine, scanLineStyle, { backgroundColor: colors.accent.coral, shadowColor: colors.accent.coral }]}
                            />
                        ) : null}
                    </View>
                </View>

                {/* ---- Bottom: hint while scanning · result card on detect ---- */}
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
                            <View style={styles.resultHead}>
                                <View style={[styles.foundDot, { backgroundColor: colors.accent.cyan }]}>
                                    <Ionicons name="checkmark" size={14} color={colors.text.inverse} />
                                </View>
                                <Text style={[typography.overline, { color: colors.accent.cyan }]}>FOUND IN DATABASE</Text>
                            </View>

                            <Text style={[typography.h2, { color: colors.text.primary }]} numberOfLines={2}>
                                {result.name}
                            </Text>

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

                            {/* Thumb-zone primary CTA — brand gradient + lime glow, ink label */}
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
                                accessibilityLabel="Scan another barcode"
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={styles.scanAgainBtn}
                                onPress={resetScan}
                            >
                                <Ionicons name="scan-outline" size={16} color={colors.text.secondary} />
                                <Text style={[typography.bodyMedium, { color: colors.text.secondary, marginLeft: 6 }]}>
                                    Scan another
                                </Text>
                            </PressableScale>
                        </Animated.View>
                    ) : (
                        <Animated.View key="hint" entering={FadeInDown.duration(420)} style={styles.hintBlock}>
                            <View style={[styles.hintPill, { backgroundColor: withAlpha('#000000', 0.5), borderColor: withAlpha('#FFFFFF', 0.10) }]}>
                                {lookingUp ? (
                                    <>
                                        <ActivityIndicator color={colors.accent.cyan} size="small" />
                                        <Text style={[typography.bodyMedium, { color: '#fff', marginLeft: 10 }]}>
                                            Looking up food…
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <Ionicons name="scan-outline" size={18} color={colors.accent.coral} />
                                        <Text style={[typography.bodyMedium, { color: '#fff', marginLeft: 10 }]}>
                                            Center the barcode in the frame
                                        </Text>
                                    </>
                                )}
                            </View>

                            {/* Manual-entry fallback — secondary, lime kept to the icon tint only */}
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

    // Scanner frame
    scannerArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scannerBox: { width: 260, height: 260, position: 'relative' },
    corner: { position: 'absolute', width: 42, height: 42 },
    cornerTopLeft:     { top: 0,    left: 0,  borderTopWidth: 4,    borderLeftWidth: 4,  borderTopLeftRadius: 14 },
    cornerTopRight:    { top: 0,    right: 0, borderTopWidth: 4,    borderRightWidth: 4, borderTopRightRadius: 14 },
    cornerBottomLeft:  { bottom: 0, left: 0,  borderBottomWidth: 4, borderLeftWidth: 4,  borderBottomLeftRadius: 14 },
    cornerBottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
    scanLine: {
        position: 'absolute', top: 24, left: 10, right: 10, height: 2, borderRadius: 2, opacity: 0.9,
        shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 8, elevation: 6,
    },
    frameCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

    // Bottom
    bottomArea: { paddingHorizontal: 20 },

    hintBlock: { alignItems: 'center' },
    hintPill: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 18, paddingVertical: 12, borderRadius: 9999, borderWidth: 1,
    },
    manualBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        marginTop: 16, paddingVertical: 14, paddingHorizontal: 24,
        borderRadius: 14, borderWidth: 1, minHeight: 52, alignSelf: 'stretch',
    },

    // Result card
    resultCard: {
        borderRadius: 24, borderWidth: 1, padding: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 16,
    },
    resultHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    foundDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
    calRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 6, marginBottom: 16 },
    macroRow: { flexDirection: 'row', gap: 10 },
    macroCell: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
    macroValueRow: { flexDirection: 'row', alignItems: 'flex-end' },
    macroLabelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    macroDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
    // Spacing only — CtaButton owns the fill, gradient, radius, glow and sizing.
    addBtn: {
        marginTop: 18,
    },
    scanAgainBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        marginTop: 14, paddingVertical: 8, minHeight: 44,
    },
});
