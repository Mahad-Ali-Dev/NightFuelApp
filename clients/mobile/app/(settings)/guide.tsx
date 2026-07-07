/**
 * How to use Zeitra — the in-app onboarding/help GUIDE.
 *
 * A single scrollable screen that teaches new users how the app actually works,
 * reached from Settings > "How to use Zeitra". Content is organised into
 * COLLAPSIBLE sections (an accordion of dark-glass cards): each section is a
 * tinted icon chip + a title + a one-line summary in its header, and expands to
 * a short numbered list of plain-language how-to steps. One section is open at a
 * time (tapping a closed header collapses the others) so the screen stays
 * scannable; expand/collapse animates via LayoutAnimation.
 *
 * The copy describes ONLY features that ship in the app today (dashboard rings +
 * bento tiles, Meals + AI food scan / barcode / recipes, Train's body-map muscle
 * browse + Body-Focus programs + demos, themed Challenges, Ria the AI coach,
 * Cycle tracking incl. the privacy lock, Heart-rate & devices via HealthKit /
 * Health-Connect / BLE + the phone step counter, Community, Reminders, and the
 * Privacy & Data controls). Where an exact number/label could drift it's kept
 * generic on purpose.
 *
 * Patterns mirror app/(settings)/privacy-data.tsx (back-button header, overline
 * section headers, staggered FadeInDown entrances, GlassCard surfaces, the
 * scheme-following StatusBar) and app/(settings)/index.tsx (tinted icon chips,
 * the Support "Help Center" URL for the footer contact link). VISUAL/CONTENT
 * only — this screen has no data hooks and mutates no state.
 *
 * 60/30/10: the deep OLED bg + dark-glass cards carry the screen; each section's
 * accent is functional (it colour-codes the feature — lime for the brand/getting
 * started, purple for the AI/Ria surface, coral for cycle, etc.), and lime keeps
 * the single primary moment on the "Contact support" footer button.
 */
import React, { useCallback, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
    LayoutAnimation, Platform, UIManager,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { withAlpha } from '@/theme/utils';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { GlassCard } from '@/components/ui';

// The Support "Help Center" URL — reused verbatim from the Settings Support
// section so the footer "Contact support" link points at the same destination
// and the app has a single source of truth for it.
const SUPPORT_URL = 'https://zeitra.app/support';

// Enable LayoutAnimation on Android (opt-in on the old arch). Guarded so it runs
// once at module load and is a no-op where already enabled / unavailable.
if (
    Platform.OS === 'android' &&
    UIManager.setLayoutAnimationEnabledExperimental
) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Guide content ───────────────────────────────────────────────────────────
// Each section = an Ionicons name (+ a semantic accent key resolved to the live
// theme palette at render), a title, a one-line summary shown collapsed, and 2–4
// short how-to steps. `accent` maps to a token on `colors.accent` so the whole
// guide re-tints on a theme switch. Copy is deliberately generic where an exact
// label/number could change.
type AccentKey =
    | 'coral' // brand lime (the primary accent alias in every theme)
    | 'cyan'
    | 'purple'
    | 'blue'
    | 'amber'
    | 'emerald'
    | 'pink'
    | 'red';

interface GuideSection {
    id: string;
    icon: string;
    accent: AccentKey;
    title: string;
    summary: string;
    steps: string[];
}

const GUIDE_SECTIONS: GuideSection[] = [
    {
        id: 'getting-started',
        icon: 'rocket-outline',
        accent: 'coral',
        title: 'Getting started',
        summary: 'Set up your profile and land on your dashboard',
        steps: [
            'When you first open Zeitra, the onboarding walks you through your goals, metrics and schedule — answer each step and it tailors the app to you.',
            'Grant the permissions it asks for (notifications, motion/steps, and optionally health data) so reminders and tracking work.',
            'When onboarding finishes you land on your dashboard — your daily home base. You can revisit any of this later in Settings > Preferences.',
        ],
    },
    {
        id: 'dashboard',
        icon: 'grid-outline',
        accent: 'cyan',
        title: 'Your dashboard',
        summary: 'Read your rings and the sleep / water / steps / calories tiles',
        steps: [
            'The rings at the top show your progress toward the day\'s goals at a glance — they fill as you log and move.',
            'Below the rings, the bento tiles summarise sleep, water, steps and calories. Each tile is a quick snapshot of that metric for today.',
            'Tap a tile to open its detail screen, where you can log or review that metric in full.',
            'Pull down to refresh if a number looks out of date.',
        ],
    },
    {
        id: 'meals',
        icon: 'restaurant-outline',
        accent: 'emerald',
        title: 'Meals & AI food scan',
        summary: 'Snap a photo, scan a barcode, and keep a food diary',
        steps: [
            'Open the Meals tab to see your day\'s food diary, macros and suggested recipes.',
            'To add food fast, use the AI food scan: point your camera at a meal to estimate what\'s on the plate, or scan a product barcode to pull its nutrition.',
            'You can also search the food database (thousands of foods) and build a plate by adjusting quantities before you log it.',
            'Browse recipes for meal ideas — open one to see its ingredients and add it to your diary.',
        ],
    },
    {
        id: 'train',
        icon: 'barbell-outline',
        accent: 'blue',
        title: 'Train & workouts',
        summary: 'Browse by muscle, start a routine, follow exercise demos',
        steps: [
            'Open the Train tab. Use "Target a muscle group" to browse exercises by body part via the body map.',
            'Or pick a Body-Focus program / style (strength, cardio, mobility and more) to get a ready-made session.',
            'Tap Start on a workout to begin a routine, then work through it set by set.',
            'Open any exercise to watch its demo so you can check your form before you lift.',
        ],
    },
    {
        id: 'challenges',
        icon: 'trophy-outline',
        accent: 'amber',
        title: 'Challenges',
        summary: 'Pick a themed challenge and unlock it day by day',
        steps: [
            'Choose a themed challenge and how many days you want it to run.',
            'Zeitra builds a day-by-day plan of workouts and meals for the challenge.',
            'Each day unlocks in turn — complete today\'s plan to keep your streak going and move to the next day.',
            'Your challenge progress also appears as a card on your dashboard so it\'s easy to pick up where you left off.',
        ],
    },
    {
        id: 'ria',
        icon: 'sparkles-outline',
        accent: 'purple',
        title: 'Ria — your AI coach',
        summary: 'Chat, get a meal or workout plan, and log it with one tap',
        steps: [
            'Open Ria to chat with your AI coach in plain language — ask about training, nutrition, sleep or your day.',
            'Ask Ria for a meal or a workout plan and she\'ll build one for you right in the conversation.',
            'When Ria suggests a meal or workout, tap "Add" on the plan card to log it straight into your diary or training.',
            'Ria uses what you\'ve set up in the app, so her suggestions stay tailored to your goals.',
        ],
    },
    {
        id: 'cycle',
        icon: 'flower-outline',
        accent: 'coral',
        title: 'Cycle tracking',
        summary: 'Log your period and symptoms, see phases, stay private',
        steps: [
            'Log the start of your period and any symptoms you\'re feeling — Zeitra uses these to estimate your cycle phases and what\'s coming next.',
            'Each phase comes with tailored food and training suggestions to match how you\'re likely to feel.',
            'Switch on pregnancy mode, or set birth-control / pill reminders, if those fit where you are.',
            'Turn on the privacy lock in the cycle screen to keep this area behind a lock, separate from the rest of the app.',
        ],
    },
    {
        id: 'heart-devices',
        icon: 'heart-outline',
        accent: 'red',
        title: 'Heart rate & devices',
        summary: 'Connect a band or strap, or use the phone step counter',
        steps: [
            'Go to Settings > Connected Devices to link a Bluetooth heart-rate band or strap.',
            'Make sure your phone\'s Bluetooth is turned on, then put your device in pairing mode and connect it.',
            'You can also connect Apple Health or Google Fit / Health Connect to sync activity automatically.',
            'No wearable? Your phone\'s built-in step counter tracks steps on its own once you allow motion access.',
        ],
    },
    {
        id: 'community',
        icon: 'people-outline',
        accent: 'pink',
        title: 'Community',
        summary: 'Follow others, share posts, join group challenges',
        steps: [
            'Open the Community tab to see a feed of posts from people you follow and the wider community.',
            'Share your own progress with a post, and like or comment to cheer others on.',
            'Follow people to keep their updates in your feed, and join community challenges and leaderboards to stay motivated.',
        ],
    },
    {
        id: 'reminders',
        icon: 'notifications-outline',
        accent: 'blue',
        title: 'Reminders & notifications',
        summary: 'Get nudges for meals, water, workouts and more',
        steps: [
            'Zeitra can nudge you at the right times — to drink water, log a meal, move, or wind down for sleep.',
            'Open Settings > Notification Settings to choose which reminders you want and when.',
            'You can turn any category on or off at any time, so you only get the nudges that help.',
        ],
    },
    {
        id: 'privacy',
        icon: 'shield-checkmark-outline',
        accent: 'emerald',
        title: 'Privacy & your data',
        summary: 'Lock the app, export your data, or delete your account',
        steps: [
            'Your data is yours. Use the cycle privacy lock to keep sensitive tracking behind a lock.',
            'In Settings > Privacy & Data you can export a full copy of your data as a file to keep or share.',
            'The same screen lets you permanently delete your account and all of its data — this is irreversible, so it asks you to confirm first.',
        ],
    },
];

export default function GuideScreen() {
    const { colors, typography, scheme } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Accordion state — the id of the currently-open section, or null when all
    // are collapsed. Single-open keeps the long guide scannable; the first
    // section starts open so the screen never reads as an empty list of headers.
    const [openId, setOpenId] = useState<string | null>(GUIDE_SECTIONS[0]?.id ?? null);

    // Toggle a section: animate the layout change, then open the tapped section
    // (or collapse it if it was already open). Tapping a new header implicitly
    // closes the previous one since only one id is held.
    const toggle = useCallback((id: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOpenId((cur) => (cur === id ? null : id));
    }, []);

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
            {/* Follow the active scheme so the status bar can't strand on the light theme. */}
            <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />

            {/* Header (mirrors privacy-data.tsx) */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity
                    activeOpacity={0.85}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={() => router.back()}
                    style={{ padding: 4 }}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18, fontWeight: '800' }]}>
                    How to use Zeitra
                </Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + spacing['4xl'] }}
            >
                {/* Intro band — sets a calm, welcoming tone before the sections. */}
                <Animated.View entering={FadeInDown.duration(360).springify().damping(18)}>
                    <View
                        style={[
                            styles.introBanner,
                            {
                                backgroundColor: withAlpha(colors.accent.coral, 0.1),
                                borderColor: withAlpha(colors.accent.coral, 0.25),
                            },
                        ]}
                        accessible
                        accessibilityRole="summary"
                        accessibilityLabel="Welcome to Zeitra. Tap any section below to learn how that part of the app works."
                    >
                        <View style={[styles.introIcon, { backgroundColor: withAlpha(colors.accent.coral, 0.16) }]}>
                            <Ionicons name="book-outline" size={20} color={colors.accent.coral} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>
                                Welcome to Zeitra
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 3, lineHeight: 18 }]}>
                                A quick tour of the app. Tap any section to see short, step-by-step tips for
                                that feature.
                            </Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Overline for the accordion list. */}
                <View style={styles.sectionHeader} accessibilityRole="header">
                    <Ionicons name="list-outline" size={14} color={colors.text.secondary} />
                    <Text style={[typography.overline, { color: colors.text.secondary, marginLeft: 6 }]}>
                        The basics
                    </Text>
                </View>

                {/* Collapsible sections — one open at a time. */}
                {GUIDE_SECTIONS.map((section, idx) => {
                    const open = openId === section.id;
                    const tint = colors.accent[section.accent];
                    return (
                        <Animated.View
                            key={section.id}
                            entering={FadeInDown.delay(60 + idx * 40).duration(320).springify().damping(18)}
                        >
                            <GlassCard radius={br.lg} style={styles.card}>
                                {/* Header row — always visible; the whole row toggles the body. */}
                                <TouchableOpacity
                                    activeOpacity={0.85}
                                    onPress={() => toggle(section.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={section.title}
                                    accessibilityHint={open ? 'Collapses this section' : 'Expands this section'}
                                    accessibilityState={{ expanded: open }}
                                    style={styles.cardHeadRow}
                                >
                                    <View style={[styles.cardIconBox, { backgroundColor: withAlpha(tint, 0.12) }]}>
                                        <Ionicons name={section.icon as any} size={20} color={tint} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[typography.subhead, styles.cardTitle, { color: colors.text.primary }]}>
                                            {section.title}
                                        </Text>
                                        {/* Summary hides once open — the steps replace it. */}
                                        {!open ? (
                                            <Text
                                                style={[typography.caption, { color: colors.text.tertiary, marginTop: 1 }]}
                                                numberOfLines={1}
                                            >
                                                {section.summary}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <Ionicons
                                        name={open ? 'chevron-up' : 'chevron-down'}
                                        size={18}
                                        color={colors.text.tertiary}
                                    />
                                </TouchableOpacity>

                                {/* Body — numbered how-to steps. Rendered only when open so
                                    the collapsed accordion stays compact. */}
                                {open ? (
                                    <View style={styles.stepsWrap}>
                                        {section.steps.map((step, sIdx) => (
                                            <View key={sIdx} style={styles.stepRow}>
                                                <View style={[styles.stepNum, { backgroundColor: withAlpha(tint, 0.14), borderColor: withAlpha(tint, 0.3) }]}>
                                                    <Text style={[typography.caption, styles.stepNumText, { color: tint }]}>
                                                        {sIdx + 1}
                                                    </Text>
                                                </View>
                                                <Text style={[typography.bodySm, styles.stepText, { color: colors.text.secondary }]}>
                                                    {step}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                ) : null}
                            </GlassCard>
                        </Animated.View>
                    );
                })}

                {/* Footer — "Need help?" contact link. Opens the same Help Center URL
                    the Settings Support section uses. */}
                <Animated.View
                    entering={FadeInDown.delay(60 + GUIDE_SECTIONS.length * 40).duration(320).springify().damping(18)}
                    style={styles.footer}
                >
                    <Text style={[typography.caption, { color: colors.text.tertiary, textAlign: 'center', marginBottom: spacing.md }]}>
                        Still stuck? We&apos;re happy to help.
                    </Text>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        accessibilityRole="link"
                        accessibilityLabel="Contact support"
                        onPress={() => Linking.openURL(SUPPORT_URL)}
                        style={[styles.supportBtn, { borderColor: colors.border.default, backgroundColor: withAlpha(colors.text.primary, 0.04) }]}
                    >
                        <Ionicons name="help-buoy-outline" size={17} color={colors.accent.coral} />
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700', marginLeft: 8 }]}>
                            Contact support
                        </Text>
                    </TouchableOpacity>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
    },
    // Intro band — calm brand-lime notice that opens the guide.
    introBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        marginHorizontal: spacing.xl,
        marginTop: spacing.lg,
        padding: spacing.lg,
        borderRadius: br.lg,
        borderWidth: 1,
    },
    introIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Grouped-list overline (leading glyph + overline label).
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
        paddingTop: spacing['2xl'],
        paddingBottom: spacing.sm,
    },
    card: {
        marginHorizontal: spacing.xl,
        marginBottom: spacing.md,
    },
    cardHeadRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
    },
    cardIconBox: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        fontWeight: '700',
    },
    // Steps body (revealed when a section is open).
    stepsWrap: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.lg,
        gap: spacing.md,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
    },
    stepNum: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
    },
    stepNumText: {
        fontWeight: '800',
        fontSize: 11,
    },
    stepText: {
        flex: 1,
        lineHeight: 20,
    },
    footer: {
        marginTop: spacing.xl,
        paddingHorizontal: spacing.xl,
    },
    supportBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
        borderWidth: 1,
        borderRadius: br.lg,
        paddingVertical: 13,
    },
});
