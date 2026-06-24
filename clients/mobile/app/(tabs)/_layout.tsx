/**
 * Tab Layout — Zeitra bottom navigation.
 *
 * Visible tabs (5):
 *   Home · Train · [Quick-Log — centre coral control] · Feed · More
 *
 * The centre control is an intentional Aurora Quick-Log button (not a bare
 * "+"): tapping it opens a chooser sheet offering Meal / Workout / Sleep, each
 * routing to its existing log destination. The Ria AI Coach FAB floats above
 * the tab bar on every screen and is unrelated to the Quick-Log control.
 *
 * Hidden tabs (reachable via in-screen navigation):
 *   schedule → redirects to /(shifts)
 *   community → redirects to /(community)
 *   circadian → accessed from Insights / home
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Tabs, useRouter, Redirect } from 'expo-router';
import { useTheme } from '@/theme';
import { useAuthStore } from '@/store/authStore';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, TouchableOpacity, Modal, StyleSheet, Platform } from 'react-native';
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
import { SafeBlurView } from '@/components/SafeBlurView';
import { GlassCard } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { colors as C } from '@/theme/colors';

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
                accessibilityLabel="Quick log"
                accessibilityHint="Opens a chooser to log a meal, workout, or sleep"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={cb.touch}
            >
                <Animated.View style={[cb.outer, discStyle]}>
                    <LinearGradient
                        colors={C.gradients.coral}
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

const cb = StyleSheet.create({
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
        shadowColor: C.accent.coral,
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
        color: C.accent.coral,
    },
});

// ─── Quick-Log chooser ──────────────────────────────────────────────────────
//
// A native <Modal> presented as a bottom action sheet (zeego is not a project
// dependency, so per the ui-native-modals rule we use a native Modal — which
// brings built-in accessibility / back-button handling — rather than a custom
// JS bottom-sheet library). Each row is a Pressable (not a Touchable) routing to
// the existing log destination. Row icon discs are icon-only colored gradients
// (no <Text> inside a coral-token gradient), so none is a labeled coral CTA.

type QuickLogOption = {
    id: 'meal' | 'workout' | 'sleep';
    label: string;
    sublabel: string;
    icon: keyof typeof Ionicons.glyphMap;
    accent: string;
    route: string;
};

// Meal → the nutrition tab's primary log-meal flow ((meals)/log-meal, the same
// destination nutrition.tsx's "Log a meal" CTA targets). Workout → the active
// workout modal. Sleep → the log-sleep modal.
const QUICK_LOG_OPTIONS: readonly QuickLogOption[] = [
    { id: 'meal', label: 'Log a meal', sublabel: 'Food, macros & calories', icon: 'restaurant', accent: C.accent.cyan, route: '/(meals)/log-meal' },
    { id: 'workout', label: 'Start a workout', sublabel: 'Track sets & exercises', icon: 'barbell', accent: C.accent.coral, route: '/(modals)/active-workout' },
    { id: 'sleep', label: 'Log sleep', sublabel: 'Bedtime & wake time', icon: 'moon', accent: C.accent.purple, route: '/(modals)/log-sleep' },
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
                accessibilityLabel="Close quick log"
                onPress={onClose}
            >
                {/* Stop propagation so taps on the sheet body don't dismiss it. */}
                <Pressable
                    style={[qs.sheetWrap, { paddingBottom: insets.bottom + 16 }]}
                    onPress={() => {}}
                >
                    <GlassCard style={qs.card} intensity={50}>
                        <View style={qs.grabber} />
                        <Text style={[typography.heading, qs.title, { color: colors.text.primary }]}>
                            Quick log
                        </Text>

                        {QUICK_LOG_OPTIONS.map((opt) => (
                            <Pressable
                                key={opt.id}
                                accessibilityRole="button"
                                accessibilityLabel={opt.label}
                                onPress={() => onSelect(opt.route)}
                                style={({ pressed }) => [
                                    qs.row,
                                    { borderColor: withAlpha(colors.text.primary, 0.08) },
                                    pressed ? { backgroundColor: withAlpha(colors.text.primary, 0.06) } : null,
                                ]}
                            >
                                <LinearGradient
                                    colors={[withAlpha(opt.accent, 0.95), withAlpha(opt.accent, 0.6)]}
                                    style={qs.rowIcon}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                >
                                    <Ionicons name={opt.icon} size={20} color="#fff" />
                                </LinearGradient>
                                <View style={qs.rowText}>
                                    <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>
                                        {opt.label}
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.secondary }]}>
                                        {opt.sublabel}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
                            </Pressable>
                        ))}
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
        paddingHorizontal: 14,
    },
    card: {
        padding: 18,
    },
    grabber: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.25)',
        marginBottom: 14,
    },
    title: {
        fontSize: 18,
        marginBottom: 12,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 10,
        minHeight: 64,
    },
    rowIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowText: {
        flex: 1,
        gap: 2,
    },
});

// ─── Ria AI Coach FAB (global — appears on every tab) ────────────────────────

function RiaFAB({ onPress }: { onPress: () => void }) {
    return (
        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Generate with AI" style={fab.container} onPress={onPress} activeOpacity={0.85}>
            <LinearGradient
                colors={C.gradients.purple}
                style={fab.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                <Ionicons name="sparkles" size={24} color="#fff" />
                <View style={fab.badge} />
            </LinearGradient>
        </TouchableOpacity>
    );
}

const fab = StyleSheet.create({
    container: {
        position: 'absolute',
        // Sits just above the tab bar
        bottom: TAB_BAR_H + 14,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        shadowColor: C.accent.purple,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
        zIndex: 100,
    },
    gradient: {
        flex: 1,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: C.accent.cyan,
        borderWidth: 1.5,
        borderColor: '#fff',
    },
});

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabLayout() {
    const { colors } = useTheme();
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
                            tint="dark"
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
