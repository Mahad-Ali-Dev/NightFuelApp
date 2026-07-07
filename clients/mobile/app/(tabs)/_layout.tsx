/**
 * Tab Layout — Zeitra bottom navigation.
 *
 * Visible tabs (5):
 *   Home · Train · [Quick-Log — centre coral control] · Feed · More
 *
 * The centre control is an intentional Aurora Quick-Log button (not a bare
 * "+"): tapping it opens a "Quick add" chooser sheet — a 3×2 grid of object-image
 * tiles (Meal / Workout / Water / Sleep / Weight / Cycle) plus a "Scan a meal"
 * CTA and a "tell Ria" hand-off — each routing to its existing log destination.
 * The Ria AI Coach FAB floats above the tab bar on every screen and is unrelated
 * to the Quick-Log control.
 *
 * Hidden tabs (reachable via in-screen navigation):
 *   schedule → redirects to /(shifts)
 *   community → redirects to /(community)
 *   circadian → accessed from Insights / home
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Tabs, useRouter, Redirect } from 'expo-router';
import { useTheme } from '@/theme';
import { useCoachSync } from '@/features/coach/useCoachSync';
import { useAuthStore } from '@/store/authStore';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, TouchableOpacity, Modal, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    interpolate,
    runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { SafeBlurView } from '@/components/SafeBlurView';
import { GlassCard, CtaButton } from '@/components/ui';
import { withAlpha, isLightHex } from '@/theme/utils';

// Bundled Quick-add tile art (transparent Zeitra object renders). Bundled via
// require() so the chooser never depends on an external host (no 404 / rate-limit).
// '@/*' resolves to ./src, so assets are required by relative path from app/(tabs).
const QA_MEAL_IMG = require('../../assets/images/qa-meal.png');
const QA_WORKOUT_IMG = require('../../assets/images/qa-workout.png');
const QA_WATER_IMG = require('../../assets/images/meal-hydration.png');
const QA_SLEEP_IMG = require('../../assets/images/qa-sleep.png');
const QA_WEIGHT_IMG = require('../../assets/images/qa-stats.png');
const QA_CYCLE_IMG = require('../../assets/images/qa-cycle.png');

// ─── Heights ─────────────────────────────────────────────────────────────────

export const TAB_BAR_H = Platform.OS === 'ios' ? 88 : 72;

// ─── Tab icon wrapper (icon + active indicator dot) ───────────────────────────

function TabIcon({
    icon,
    iconFocused,
    focused,
    color,
}: {
    icon: string;
    iconFocused: string;
    focused: boolean;
    color: string;
}) {
    return (
        <View style={ti.wrap}>
            <Ionicons name={(focused ? iconFocused : icon) as any} size={22} color={color} />
            {focused && <View style={[ti.dot, { backgroundColor: color }]} />}
        </View>
    );
}

const ti = StyleSheet.create({
    wrap: { alignItems: 'center', gap: 3 },
    dot: { width: 4, height: 4, borderRadius: 2 },
});

// ─── Centre Quick-Log raised control ───────────────────────────────────────────
//
// An intentional Aurora control (not a lone "+"): a coral→pink brand-gradient
// disc that, on press, opens the Quick-Log chooser. Press feedback is a UI-thread
// scale driven by a Reanimated shared value via GestureDetector + Gesture.Tap()
// (no JS round-trip), animating ONLY transform (GPU-accelerated; no layout).
//
// The gradient is icon-only (a "+" glyph, no <Text> child), so it is a decorative
// brand fill — not a labeled coral CTA — and stays clear of check-no-inline-cta.
// The "Log" caption sits OUTSIDE the gradient, beneath the disc.

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function CentreButton({ onPress }: { onPress?: () => void }) {
    const { colors } = useTheme();
    const cb = useMemo(() => makeCb(colors), [colors]);
    // Press STATE (0 = released, 1 = pressed) as ground truth; scale is derived.
    const pressed = useSharedValue(0);

    const tap = useMemo(
        () =>
            Gesture.Tap()
                .onBegin(() => {
                    pressed.set(withTiming(1, { duration: 90 }));
                })
                .onFinalize(() => {
                    pressed.set(withTiming(0, { duration: 130 }));
                })
                .onEnd(() => {
                    if (onPress) runOnJS(onPress)();
                }),
        [onPress, pressed],
    );

    const discStyle = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(pressed.get(), [0, 1], [1, 0.92]) }],
    }));

    return (
        <GestureDetector gesture={tap}>
            <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel="Quick add"
                accessibilityHint="Opens a chooser to log a meal, workout, water, sleep, weight, or cycle"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={cb.touch}
            >
                <Animated.View style={[cb.outer, discStyle]}>
                    <LinearGradient
                        colors={colors.gradients.coral}
                        style={cb.gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <Ionicons name="add" size={30} color="#fff" />
                    </LinearGradient>
                </Animated.View>
                <Text style={cb.caption} maxFontSizeMultiplier={1.3}>
                    Log
                </Text>
            </AnimatedPressable>
        </GestureDetector>
    );
}

const makeCb = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
    // The tab slot wrapper: centres the disc + caption and lifts the disc above
    // the bar (kept elevated as before via the disc's own shadow).
    touch: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-start',
        marginBottom: Platform.OS === 'ios' ? 14 : 10,
    },
    outer: {
        width: 58,
        height: 58,
        borderRadius: 29,
        // Elevated above the tab bar (matches the prior coral disc elevation).
        shadowColor: colors.accent.coral,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
        elevation: 10,
    },
    gradient: {
        flex: 1,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
    },
    caption: {
        marginTop: 3,
        fontSize: 10,
        fontWeight: '700',
        color: colors.accent.coral,
    },
});

// ─── Quick-Log chooser ──────────────────────────────────────────────────────
//
// A native <Modal> presented as a bottom action sheet (zeego is not a project
// dependency, so per the ui-native-modals rule we use a native Modal — which
// brings built-in accessibility / back-button handling — rather than a custom
// JS bottom-sheet library). The body is a 3×2 grid of object-image tiles; each
// tile is a Pressable (not a Touchable) routing to the existing log destination
// via the shared close-then-navigate `onSelect`. A lime "Scan a meal" CtaButton
// and an "or just tell Ria…" line sit beneath the grid.

type QuickLogAccentKey = 'cyan' | 'coral' | 'blue' | 'purple' | 'emerald' | 'pink';

type QuickLogOptionBase = {
    id: 'meal' | 'workout' | 'water' | 'sleep' | 'weight' | 'cycle';
    label: string;
    image: number;
    accentKey: QuickLogAccentKey;
    route: string;
};

type QuickLogOption = Omit<QuickLogOptionBase, 'accentKey'> & { accent: string };

// Each tile maps onto an EXISTING log destination (no new routes invented):
//   Meal    → the nutrition tab's primary log-meal flow ((meals)/log-meal, the
//             same destination nutrition.tsx's "Log a meal" CTA targets).
//   Workout → the active-workout modal.
//   Water   → the performance Hydration screen (same route the Performance hub's
//             Hydration quick-link uses).
//   Sleep   → the log-sleep modal.
//   Weight  → the performance Body Metrics screen (the Performance hub's
//             Body Metrics quick-link route).
//   Cycle   → the performance Cycle screen.
// `accent` is used only for the per-tile pressed tint + soft border glow; each
// tile's accentKey resolves against the active theme inside the sheet.
const QUICK_LOG_OPTIONS: readonly QuickLogOptionBase[] = [
    { id: 'meal', label: 'Meal', image: QA_MEAL_IMG, accentKey: 'cyan', route: '/(meals)/log-meal' },
    { id: 'workout', label: 'Workout', image: QA_WORKOUT_IMG, accentKey: 'coral', route: '/training/onboarding' },
    { id: 'water', label: 'Water', image: QA_WATER_IMG, accentKey: 'blue', route: '/(performance)/hydration' },
    { id: 'sleep', label: 'Sleep', image: QA_SLEEP_IMG, accentKey: 'purple', route: '/(modals)/log-sleep' },
    { id: 'weight', label: 'Weight', image: QA_WEIGHT_IMG, accentKey: 'emerald', route: '/(performance)/body-metrics' },
    { id: 'cycle', label: 'Cycle', image: QA_CYCLE_IMG, accentKey: 'pink', route: '/(performance)/cycle' },
] as const;

function QuickLogSheet({
    visible,
    onClose,
    onSelect,
}: {
    visible: boolean;
    onClose: () => void;
    onSelect: (route: string) => void;
}) {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    // Resolve each tile's accent against the active theme so the per-tile tint /
    // border glow re-tints when the user switches themes.
    const options: readonly QuickLogOption[] = useMemo(
        () => QUICK_LOG_OPTIONS.map((o) => ({ ...o, accent: colors.accent[o.accentKey] })),
        [colors],
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            {/* Backdrop — tap anywhere outside the sheet to dismiss. */}
            <Pressable
                style={qs.backdrop}
                accessibilityRole="button"
                accessibilityLabel="Close quick add"
                onPress={onClose}
            >
                {/* Stop propagation so taps on the sheet body don't dismiss it. */}
                <Pressable
                    style={[qs.sheetWrap, { paddingBottom: insets.bottom + 22 }]}
                    onPress={() => {}}
                >
                    <GlassCard style={qs.card} intensity={50} radius={28}>
                        <View style={[qs.grabber, { backgroundColor: withAlpha(colors.text.primary, 0.18) }]} />

                        {/* Header — "Quick add" title + circular close X. */}
                        <View style={qs.headerRow}>
                            <Text style={[typography.h2, qs.title, { color: colors.text.primary }]}>
                                Quick add
                            </Text>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Close quick add"
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                onPress={onClose}
                                style={({ pressed }) => [
                                    qs.closeBtn,
                                    {
                                        backgroundColor: colors.background.secondary,
                                        borderColor: withAlpha(colors.text.primary, 0.1),
                                    },
                                    pressed ? { opacity: 0.7 } : null,
                                ]}
                            >
                                <Ionicons name="close" size={18} color={colors.text.secondary} />
                            </Pressable>
                        </View>

                        {/* 3×2 grid of object-image tiles — each routes to its existing
                            log destination via the shared close-then-navigate onSelect. */}
                        <View style={qs.grid}>
                            {options.map((opt) => (
                                <Pressable
                                    key={opt.id}
                                    accessibilityRole="button"
                                    accessibilityLabel={opt.label}
                                    onPress={() => onSelect(opt.route)}
                                    style={({ pressed }) => [
                                        qs.tile,
                                        {
                                            backgroundColor: colors.background.secondary,
                                            borderColor: withAlpha(opt.accent, 0.28),
                                        },
                                        pressed
                                            ? { backgroundColor: withAlpha(opt.accent, 0.14), borderColor: withAlpha(opt.accent, 0.5) }
                                            : null,
                                    ]}
                                >
                                    <Image
                                        source={opt.image}
                                        style={qs.tileImg}
                                        contentFit="contain"
                                        cachePolicy="memory-disk"
                                        transition={150}
                                    />
                                    <Text
                                        style={[typography.bodyMedium, { color: colors.text.primary }]}
                                        maxFontSizeMultiplier={1.3}
                                    >
                                        {opt.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        {/* Meals quick links — the recipe library + the food encyclopedia
                            (so the + isn't only "log a meal"). Reuses onSelect (close → nav). */}
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                            <Pressable
                                accessibilityRole="button" accessibilityLabel="Open the Meals page"
                                onPress={() => onSelect('/(tabs)/nutrition')}
                                style={({ pressed }) => [qs.mealLink, { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.text.primary, 0.1) }, pressed ? { opacity: 0.7 } : null]}
                            >
                                <Ionicons name="fast-food-outline" size={16} color={colors.accent.lime} />
                                <Text style={[typography.caption, { color: colors.text.primary, fontWeight: '600' }]}>Meals</Text>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button" accessibilityLabel="Browse recipes"
                                onPress={() => onSelect('/(meals)/recipes')}
                                style={({ pressed }) => [qs.mealLink, { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.text.primary, 0.1) }, pressed ? { opacity: 0.7 } : null]}
                            >
                                <Ionicons name="restaurant-outline" size={16} color={colors.accent.coral} />
                                <Text style={[typography.caption, { color: colors.text.primary, fontWeight: '600' }]}>Recipes</Text>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button" accessibilityLabel="Search foods"
                                onPress={() => onSelect('/(meals)/encyclopedia')}
                                style={({ pressed }) => [qs.mealLink, { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.text.primary, 0.1) }, pressed ? { opacity: 0.7 } : null]}
                            >
                                <Ionicons name="nutrition-outline" size={16} color={colors.accent.cyan} />
                                <Text style={[typography.caption, { color: colors.text.primary, fontWeight: '600' }]}>Food search</Text>
                            </Pressable>
                        </View>

                        {/* Primary actions — scan a meal two ways: AI plate photo
                            (point at your plate → the vision model returns macros)
                            or an Open Food Facts barcode. */}
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <CtaButton
                                label="Snap a plate"
                                icon="camera"
                                size="lg"
                                accessibilityLabel="Snap a photo of your plate to analyze it with AI"
                                onPress={() => onSelect('/(modals)/food-photo')}
                                style={[qs.scanCta, { flex: 1 }]}
                            />
                            <CtaButton
                                label="Barcode"
                                icon="barcode-outline"
                                size="lg"
                                flat
                                accessibilityLabel="Scan a barcode"
                                onPress={() => onSelect('/(modals)/barcode-scanner')}
                                style={[qs.scanCta, { flex: 1 }]}
                            />
                        </View>

                        {/* Secondary nudge — hand off to the Ria AI coach. */}
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Tell Ria what you had"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => onSelect('/(modals)/ai-coach')}
                            style={({ pressed }) => [qs.riaLine, pressed ? { opacity: 0.6 } : null]}
                        >
                            <Text style={[typography.caption, { color: colors.text.secondary, textAlign: 'center' }]}>
                                or just tell Ria — “I had a chicken bowl” 💬
                            </Text>
                        </Pressable>
                    </GlassCard>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const qs = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    sheetWrap: {
        paddingHorizontal: 12,
    },
    card: {
        paddingHorizontal: 18,
        paddingTop: 14,
        paddingBottom: 22,
    },
    grabber: {
        alignSelf: 'center',
        width: 42,
        height: 5,
        borderRadius: 3,
        marginBottom: 16,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 18,
    },
    title: {
        fontWeight: '700',
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 12,
    },
    tile: {
        width: '31.5%',
        borderRadius: 18,
        borderWidth: 1,
        paddingVertical: 13,
        paddingHorizontal: 6,
        alignItems: 'center',
        gap: 7,
    },
    tileImg: {
        width: 56,
        height: 56,
    },
    scanCta: {
        marginTop: 18,
        borderRadius: 15,
    },
    mealLink: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
    },
    riaLine: {
        marginTop: 13,
        alignSelf: 'center',
    },
});

// ─── Ria AI Coach FAB (global — appears on every tab) ────────────────────────
// A lime EDGE TAB matching the design mockup's `.ria` element (chat glyph + "Ria",
// ink-on-lime), NOT a purple sparkles circle. It's DRAGGABLE: drag it anywhere
// vertically and it snaps to whichever side (left/right) is nearest on release;
// the chosen side + height persist across launches. A plain tap opens Coach Ria.
const RIA_FAB_KEY = 'zeitra.riaFab.v1';
const RIA_W = 46; // tab width (mockup 44)
const RIA_H = 58; // approx tab height — used only to clamp the vertical range

function RiaFAB({ onPress }: { onPress: () => void }) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();

    // Vertical travel range — clear of the status bar and the floating tab bar.
    const minY = insets.top + 56;
    const maxY = Math.max(minY, SCREEN_H - TAB_BAR_H - insets.bottom - RIA_H - 24);

    const side = useSharedValue(1);     // 1 = right edge, 0 = left edge
    const ty = useSharedValue(SCREEN_H * 0.4);
    const tx = useSharedValue(0);       // live x while dragging
    const dragging = useSharedValue(0);
    const ready = useSharedValue(0);    // hide until the saved position loads (no flash)
    const startX = useSharedValue(0);
    const startY = useSharedValue(0);

    // Load the persisted side + height once (clamped to the current range).
    useEffect(() => {
        let alive = true;
        AsyncStorage.getItem(RIA_FAB_KEY)
            .then((raw) => {
                if (!alive) return;
                let s = 1;
                let y = SCREEN_H * 0.4;
                if (raw) {
                    try {
                        const p = JSON.parse(raw);
                        s = p.side === 'left' ? 0 : 1;
                        if (typeof p.y === 'number') y = p.y;
                    } catch { /* ignore corrupt value */ }
                }
                side.value = s;
                ty.value = Math.min(Math.max(y, minY), maxY);
                ready.value = 1;
            })
            .catch(() => { ready.value = 1; });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const persist = useCallback((s: number, y: number) => {
        AsyncStorage.setItem(RIA_FAB_KEY, JSON.stringify({ side: s ? 'right' : 'left', y })).catch(() => {});
    }, []);

    const pan = Gesture.Pan()
        .minDistance(10)
        .onStart(() => {
            dragging.value = 1;
            startX.value = side.value ? SCREEN_W - RIA_W : 0;
            startY.value = ty.value;
            tx.value = startX.value;
        })
        .onUpdate((e) => {
            tx.value = startX.value + e.translationX;
            ty.value = Math.min(Math.max(startY.value + e.translationY, minY), maxY);
        })
        .onEnd(() => {
            const toRight = tx.value + RIA_W / 2 > SCREEN_W / 2 ? 1 : 0;
            side.value = toRight;
            dragging.value = 0;
            runOnJS(persist)(toRight, ty.value);
        });

    const tap = Gesture.Tap().maxDistance(12).onEnd(() => { runOnJS(onPress)(); });
    const gesture = Gesture.Exclusive(pan, tap);

    const aStyle = useAnimatedStyle(() => {
        const restX = side.value ? SCREEN_W - RIA_W : 0;
        const x = dragging.value ? tx.value : withTiming(restX, { duration: 180 });
        const roundLeft = side.value === 1; // tab on the right → round its LEFT (inner) corners
        return {
            opacity: ready.value ? 1 : 0,
            transform: [{ translateX: x }, { translateY: ty.value }],
            borderTopLeftRadius: roundLeft ? 16 : 0,
            borderBottomLeftRadius: roundLeft ? 16 : 0,
            borderTopRightRadius: roundLeft ? 0 : 16,
            borderBottomRightRadius: roundLeft ? 0 : 16,
        };
    });

    return (
        <GestureDetector gesture={gesture}>
            <Animated.View
                accessibilityRole="button"
                accessibilityLabel="Open Coach Ria (drag to move)"
                style={[fabStyles.tab, { backgroundColor: colors.accent.coral }, aStyle]}
            >
                <Ionicons name="chatbubble-ellipses" size={19} color="#13200A" />
                <Text style={fabStyles.label}>Ria</Text>
            </Animated.View>
        </GestureDetector>
    );
}

const fabStyles = StyleSheet.create({
    tab: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: RIA_W,
        paddingVertical: 11,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        zIndex: 100,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 8,
    },
    label: { color: '#13200A', fontSize: 10, fontWeight: '500' },
});

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabLayout() {
    const { colors } = useTheme();
    // Restore + back up the AI Coach plan to the server (reinstall / multi-device).
    useCoachSync();
    const router = useRouter();
    // Per-field scoped selectors (same fix as app/index.tsx). This layout runs
    // an auth gate that can Redirect to /login, so an unscoped useAuthStore()
    // destructure — which re-renders on every auth-store change — would re-run
    // that gate on unrelated store churn. Subscribe to only the two fields the
    // gate reads so a profile/loading mutation can't trigger a spurious bounce.
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const isLoading = useAuthStore((s) => s.isLoading);

    // Quick-Log chooser visibility. The centre control opens this sheet; each row
    // routes to its existing log destination.
    const [quickLogOpen, setQuickLogOpen] = useState(false);

    // Close the sheet, then navigate to the chosen log destination. We close
    // first so the sheet's dismiss animation doesn't race the route push.
    const handleQuickLogSelect = useCallback(
        (route: string) => {
            setQuickLogOpen(false);
            router.push(route as any);
        },
        [router],
    );

    // Auth gate: a deep link or mid-session token expiry can otherwise mount the
    // tabs in a logged-out state. Bounce to login once we know auth has resolved.
    if (!isLoading && !isAuthenticated) {
        return <Redirect href="/(auth)/login" />;
    }

    const active = colors.accent.coral;
    const inactive = colors.text.tertiary;

    return (
        // Outer View so the Ria FAB can be positioned relative to the whole tab area
        <View style={{ flex: 1 }}>
            <Tabs
                screenOptions={{
                    headerShown: false,
                    tabBarStyle: {
                        // Make it absolute and transparent to let BlurView show through
                        position: 'absolute',
                        backgroundColor: 'transparent',
                        borderTopWidth: 1,
                        borderTopColor: withAlpha(colors.text.primary, 0.1),
                        height: TAB_BAR_H,
                        paddingBottom: Platform.OS === 'ios' ? 26 : 10,
                        paddingTop: 10,
                        elevation: 0,
                        shadowOpacity: 0,
                    },
                    tabBarBackground: () => (
                        <SafeBlurView
                            intensity={40}
                            tint={isLightHex(colors.background.primary) ? 'light' : 'dark'}
                            style={StyleSheet.absoluteFill}
                        />
                    ),
                    tabBarActiveTintColor: active,
                    tabBarInactiveTintColor: inactive,
                    tabBarShowLabel: true,
                    tabBarLabelStyle: {
                        fontSize: 10,
                        fontWeight: '600',
                        marginTop: 0,
                    },
                }}
            >
                {/* ── Home ──────────────────────────────────────────── */}
                <Tabs.Screen
                    name="index"
                    options={{
                        title: 'Home',
                        tabBarIcon: ({ focused, color }) => (
                            <TabIcon icon="home-outline" iconFocused="home" focused={focused} color={color} />
                        ),
                    }}
                />

                {/* ── Train ─────────────────────────────────────────── */}
                <Tabs.Screen
                    name="training"
                    options={{
                        title: 'Train',
                        tabBarIcon: ({ focused, color }) => (
                            <TabIcon icon="barbell-outline" iconFocused="barbell" focused={focused} color={color} />
                        ),
                    }}
                />

                {/* ── Quick-Log (centre raised control) ─────────────────
                    The nutrition screen stays REGISTERED here so its route
                    remains reachable (the chooser's "Log a meal" action and the
                    Home Quick Action both navigate into it). Pressing the centre
                    control opens the Quick-Log chooser instead of switching tab. */}
                <Tabs.Screen
                    name="nutrition"
                    options={{
                        title: '',
                        tabBarLabel: () => null,
                        tabBarButton: () => <CentreButton onPress={() => setQuickLogOpen(true)} />,
                    }}
                />

                {/* ── Feed (Community) ──────────────────────── */}
                <Tabs.Screen
                    name="community"
                    options={{
                        title: 'Feed',
                        tabBarIcon: ({ focused, color }) => (
                            <TabIcon icon="people-outline" iconFocused="people" focused={focused} color={color} />
                        ),
                    }}
                />

                {/* ── More (Settings, Profile, etc.) ────────────────── */}
                <Tabs.Screen
                    name="more"
                    options={{
                        title: 'More',
                        tabBarIcon: ({ focused, color }) => (
                            <TabIcon icon="menu-outline" iconFocused="menu" focused={focused} color={color} />
                        ),
                    }}
                />

                {/* ── Hidden — reachable via in-screen buttons ───────── */}
                <Tabs.Screen name="analytics" options={{ href: null }} />
                <Tabs.Screen name="profile" options={{ href: null }} />
                <Tabs.Screen name="schedule" options={{ href: null }} />
                <Tabs.Screen name="circadian" options={{ href: null }} />
                <Tabs.Screen name="profile/edit" options={{ href: null }} />
                <Tabs.Screen name="profile/preferences" options={{ href: null }} />
            </Tabs>

            {/* ── Ria AI Coach FAB — visible on every tab ─────────── */}
            <RiaFAB onPress={() => router.push('/(modals)/ai-coach' as any)} />

            {/* ── Quick-Log chooser — opened by the centre control ─── */}
            <QuickLogSheet
                visible={quickLogOpen}
                onClose={() => setQuickLogOpen(false)}
                onSelect={handleQuickLogSelect}
            />
        </View>
    );
}
