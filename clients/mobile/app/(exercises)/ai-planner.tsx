/**
 * AI Workout Planner — powered by Coach Ria.
 * Let Ria generate a personalised workout routine based on goal,
 * level, days per week, and focus areas.
 */
import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateRoutineWithAI, type GenerateRoutinePayload } from '@/api/exercises';
import { parseAiQuotaError, type AiQuotaError } from '@/api/ai';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GeneratingSteps, CtaButton } from '@/components/ui';
import { GlassCard } from '@/components/ui/GlassCard';
import { PressableScale } from '@/components/ui/PressableScale';
import { getErrorMessage } from '@/utils/validation';

// Ria's avatar — the bundled Zeitra app mark, shown in the intro card so the
// generator opens with a "Coach Ria is building this for you" beat (mockup:
// workout-generator-preview.html). Bundled asset, no network hit.
const RIA_AVATAR = require('../../assets/images/logo_app.png');

// Staged status lines shown while Coach Ria builds the routine (10–30s).
const WORKOUT_GEN_STEPS = [
    'Reading your training profile…',
    'Selecting exercises for your goal…',
    'Balancing sets, reps & volume…',
    'Sequencing your weekly split…',
    'Finalizing your plan…',
];

// ── Option data ───────────────────────────────────────────────────────────────

type Goal = GenerateRoutinePayload['goal'];
type Level = GenerateRoutinePayload['level'];

// Per-goal icon TINT only — scoped to the small goal-icon chip so each goal stays
// glanceable. Everything structural (selected fills, borders, radios, chips, the
// summary block and the CTA) is driven by the lime brand accent, NOT these.
const GOALS: { key: Goal; label: string; icon: string; tint: keyof ReturnType<typeof useTheme>['colors']['accent']; desc: string }[] = [
    { key: 'strength',    label: 'Strength',   icon: 'barbell-outline', tint: 'coral',   desc: 'Max force, progressive overload' },
    { key: 'hypertrophy', label: 'Muscle',     icon: 'body-outline',    tint: 'purple',  desc: 'Hypertrophy & muscle growth' },
    { key: 'endurance',   label: 'Endurance',  icon: 'heart-outline',   tint: 'cyan',    desc: 'Cardio capacity & stamina' },
    { key: 'fat_loss',    label: 'Fat Loss',   icon: 'flame-outline',   tint: 'orange',  desc: 'High intensity calorie burn' },
    { key: 'general',     label: 'General',    icon: 'fitness-outline', tint: 'emerald', desc: 'Balanced all-around fitness' },
];

const LEVELS: { key: Level; label: string; desc: string }[] = [
    { key: 'beginner',     label: 'Beginner',     desc: '< 6 months training' },
    { key: 'intermediate', label: 'Intermediate',  desc: '6 months – 2 years' },
    { key: 'advanced',     label: 'Advanced',      desc: '2+ years consistent training' },
];

const DAYS_OPTIONS = [2, 3, 4, 5, 6];

const FOCUS_AREAS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Glutes', 'Full Body'];

const EQUIPMENT_OPTIONS = [
    { key: 'Full Gym',       icon: 'business-outline' },
    { key: 'Home (Dumbbells)', icon: 'home-outline' },
    { key: 'Calisthenics',   icon: 'body-outline' },
    { key: 'Kettlebell',     icon: 'ellipse-outline' },
];

// Human-readable "resets" line for the daily-limit upgrade block. Renders a
// short local clock time ("Resets at 6:00 AM") when `resetsAt` is a parseable
// ISO timestamp, else a sensible fallback so the block never shows a raw date
// or "Invalid Date".
function formatResetsAt(resetsAt: string): string {
    if (!resetsAt) return 'Resets at midnight UTC';
    const when = new Date(resetsAt);
    if (Number.isNaN(when.getTime())) return 'Resets at midnight UTC';
    const time = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `Resets at ${time}`;
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AIWorkoutPlannerScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const qc = useQueryClient();

    const [goal, setGoal]           = useState<Goal>('general');
    const [level, setLevel]         = useState<Level>('intermediate');
    const [days, setDays]           = useState(3);
    const [focusAreas, setFocus]    = useState<string[]>([]);
    const [equipment, setEquipment] = useState('Full Gym');
    // Mutually-exclusive failure ground truth: a non-quota failure sets
    // `genError` (the existing retryable inline notice); a 429 daily-limit 429
    // sets `quota` (the distinct upgrade state). Exactly one is ever non-null —
    // the display is derived from whichever it is, never both.
    const [genError, setGenError]   = useState<string | null>(null);
    const [quota, setQuota]         = useState<AiQuotaError | null>(null);

    const selectedGoal = GOALS.find(g => g.key === goal)!;
    // The brand lime drives every structural/selected/active state on this
    // screen (single primary accent). The per-goal icon TINT is the only place
    // a non-lime hue is allowed, and it stays inside the small icon chip.
    const LIME = colors.accent.coral;
    const LIME_DARK = colors.accent.coralDark;
    const INK = colors.text.inverse;

    const generateMutation = useMutation({
        mutationFn: () => generateRoutineWithAI({ goal, level, daysPerWeek: days, focusAreas, equipment }),
        onSuccess: (routine) => {
            setGenError(null);
            setQuota(null);
            qc.invalidateQueries({ queryKey: ['routines'] });
            qc.invalidateQueries({ queryKey: ['workout-routines'] });
            Alert.alert(
                'Plan Created!',
                `"${(routine as any).name ?? (routine as any).title}" is ready. Tap it in My Routines to start.`,
                [{ text: 'View Routines', onPress: () => router.replace('/(exercises)/routines' as any) }],
            );
        },
        onError: (err: unknown) => {
            // A 429 daily-AI-limit 429 flips into the distinct upgrade state;
            // anything else keeps the existing retryable inline error path.
            const q = parseAiQuotaError(err);
            if (q) {
                setQuota(q);
                setGenError(null);
            } else {
                setQuota(null);
                setGenError(getErrorMessage(err));
            }
        },
    });

    const isPending = generateMutation.isPending;

    // Clear any prior error/quota and kick off generation (used by CTA + Try Again).
    const runGenerate = () => {
        setQuota(null);
        setGenError(null);
        generateMutation.mutate();
    };

    const toggleFocus = (area: string) => {
        setFocus(prev =>
            prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area],
        );
    };

    // Compact stat block facts for the summary — surfaced as condensed numerals.
    const levelLabel = LEVELS.find(l => l.key === level)!.label;
    const summaryStats: { value: string; label: string }[] = [
        { value: String(days), label: 'Days / Wk' },
        { value: levelLabel, label: 'Level' },
        { value: focusAreas.length > 0 ? String(focusAreas.length) : 'All', label: 'Focus' },
    ];

    return (
        <View style={[s.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {/* Header — lime/glass brand identity (no purple). */}
            <LinearGradient
                colors={[withAlpha(LIME, 0.16), 'transparent']}
                style={[s.headerGrad, { paddingTop: insets.top + 16 }]}
            >
                <View style={s.headerRow}>
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 4 }}>
                        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 16 }}>
                        <Text style={[typography.h2, { color: colors.text.primary }]}>
                            AI Workout Planner
                        </Text>
                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                            Coach Ria builds your perfect routine
                        </Text>
                    </View>
                    {/* Ria avatar — lime brand, ink glyph. */}
                    <LinearGradient colors={colors.gradients.coral} style={[s.riaAvatar, shadows.glow(LIME)]}>
                        <Ionicons name="sparkles" size={20} color={INK} />
                    </LinearGradient>
                </View>
            </LinearGradient>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
                // Lock the form while Ria generates so inputs can't change mid-flight.
                scrollEnabled={!isPending}
            >
                {/* While pending, scrim + disable the whole form (only the footer
                    CTA + staged progress stay live). */}
                <View pointerEvents={isPending ? 'none' : 'auto'} style={isPending ? { opacity: 0.45 } : undefined}>
                    {/* Ria intro card — logo avatar + a warm "let's build your week"
                        opener (mockup: workout-generator-preview.html). Glass surface
                        via the sanctioned GlassCard primitive; the lime ring on the
                        avatar keeps it on-brand. */}
                    <Animated.View entering={FadeInDown.delay(30).springify().damping(18).mass(0.7)} style={{ paddingHorizontal: 20, paddingTop: 16 }}>
                        <GlassCard radius={18}>
                            <View style={s.introRow}>
                                <View style={[s.introAvatar, { borderColor: withAlpha(LIME, 0.5) }]}>
                                    <Image source={RIA_AVATAR} style={s.introAvatarImg} resizeMode="cover" />
                                </View>
                                <Text style={[typography.bodySm, { color: colors.text.secondary, flex: 1, lineHeight: 19 }]} maxFontSizeMultiplier={1.4}>
                                    Let's build your week — I'll fit it to your goal, gear & shift recovery. 💪
                                </Text>
                            </View>
                        </GlassCard>
                    </Animated.View>

                    {/* Goal */}
                    <Animated.View entering={FadeInDown.delay(60).springify().damping(18).mass(0.7)}>
                        <SectionTitle label="WHAT'S YOUR GOAL?" colors={colors} typography={typography} />
                    </Animated.View>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                    >
                        {GOALS.map((g, i) => {
                            const active = goal === g.key;
                            const tint = colors.accent[g.tint];
                            return (
                                <Animated.View key={g.key} entering={FadeInDown.delay(100 + i * 45).springify().damping(18).mass(0.7)}>
                                    <PressableScale
                                        accessibilityRole="radio"
                                        accessibilityState={{ selected: active }}
                                        accessibilityLabel={g.label}
                                        style={[
                                            s.goalCard,
                                            {
                                                backgroundColor: active ? withAlpha(LIME, 0.16) : colors.background.secondary,
                                                borderColor: active ? LIME : colors.border.default,
                                            },
                                        ]}
                                        onPress={() => setGoal(g.key)}
                                    >
                                        {/* Icon keeps a small per-goal tint chip; everything else is lime. */}
                                        <View style={[s.goalIcon, { backgroundColor: withAlpha(tint, 0.15) }]}>
                                            <Ionicons name={g.icon as any} size={22} color={tint} />
                                        </View>
                                        <Text style={[typography.subhead, { color: active ? LIME : colors.text.primary, fontWeight: '800', marginTop: 10 }]}>
                                            {g.label}
                                        </Text>
                                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 4, fontSize: 11, lineHeight: 15, textAlign: 'center' }]}>
                                            {g.desc}
                                        </Text>
                                        {active && (
                                            <View style={[s.checkBadge, { backgroundColor: LIME }]}>
                                                <Ionicons name="checkmark" size={10} color={INK} />
                                            </View>
                                        )}
                                    </PressableScale>
                                </Animated.View>
                            );
                        })}
                    </ScrollView>

                    {/* Level */}
                    <Animated.View entering={FadeInDown.delay(150).springify().damping(18).mass(0.7)}>
                        <SectionTitle label="YOUR EXPERIENCE" colors={colors} typography={typography} />
                        <View style={{ paddingHorizontal: 20, gap: 10 }}>
                            {LEVELS.map(l => {
                                const active = level === l.key;
                                return (
                                    <PressableScale
                                        key={l.key}
                                        pressedScale={0.97}
                                        accessibilityRole="radio"
                                        accessibilityState={{ selected: active }}
                                        accessibilityLabel={l.label}
                                        style={[
                                            s.levelRow,
                                            {
                                                backgroundColor: active ? withAlpha(LIME, 0.15) : colors.background.secondary,
                                                borderColor: active ? LIME : colors.border.default,
                                            },
                                        ]}
                                        onPress={() => setLevel(l.key)}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={[typography.subhead, { color: active ? LIME : colors.text.primary, fontWeight: '700' }]}>
                                                {l.label}
                                            </Text>
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]}>
                                                {l.desc}
                                            </Text>
                                        </View>
                                        <View style={[s.radioOuter, { borderColor: active ? LIME : colors.border.default }]}>
                                            {active && <View style={[s.radioInner, { backgroundColor: LIME }]} />}
                                        </View>
                                    </PressableScale>
                                );
                            })}
                        </View>
                    </Animated.View>

                    {/* Days per week — the count is the focal HERO numeral. */}
                    <Animated.View entering={FadeInDown.delay(195).springify().damping(18).mass(0.7)}>
                        <SectionTitle label="DAYS PER WEEK" colors={colors} typography={typography} />
                        <View style={s.daysRow}>
                            {DAYS_OPTIONS.map(d => {
                                const active = days === d;
                                return (
                                    <PressableScale
                                        key={d}
                                        pressedScale={0.94}
                                        accessibilityRole="radio"
                                        accessibilityState={{ selected: active }}
                                        accessibilityLabel={`${d} days per week`}
                                        style={[
                                            s.dayBtn,
                                            {
                                                backgroundColor: active ? LIME : colors.background.secondary,
                                                borderColor: active ? LIME : colors.border.default,
                                            },
                                        ]}
                                        onPress={() => setDays(d)}
                                    >
                                        <Text style={[typography.statMedium, { color: active ? INK : colors.text.primary, fontSize: 26, lineHeight: 30 }]}>
                                            {d}
                                        </Text>
                                        <Text style={[typography.overline, { color: active ? withAlpha(INK, 0.7) : colors.text.tertiary, fontSize: 9, letterSpacing: 1, marginTop: 1 }]}>
                                            DAYS
                                        </Text>
                                    </PressableScale>
                                );
                            })}
                        </View>
                    </Animated.View>

                    {/* Focus Areas */}
                    <Animated.View entering={FadeInDown.delay(240).springify().damping(18).mass(0.7)}>
                        <SectionTitle label="MUSCLE FOCUS (OPTIONAL)" colors={colors} typography={typography} />
                        <View style={s.chipsRow}>
                            {FOCUS_AREAS.map(area => {
                                const active = focusAreas.includes(area);
                                return (
                                    <PressableScale
                                        key={area}
                                        pressedScale={0.95}
                                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked: active }}
                                        accessibilityLabel={area}
                                        style={[
                                            s.chip,
                                            {
                                                backgroundColor: active ? withAlpha(LIME, 0.18) : colors.background.secondary,
                                                borderColor: active ? LIME : colors.border.default,
                                            },
                                        ]}
                                        onPress={() => toggleFocus(area)}
                                    >
                                        <Text style={[typography.caption, { color: active ? LIME : colors.text.secondary, fontWeight: '600', fontSize: 13 }]}>
                                            {area}
                                        </Text>
                                    </PressableScale>
                                );
                            })}
                        </View>
                    </Animated.View>

                    {/* Equipment — a tile GRID (mockup: equipment tile grid). Each
                        tile centres its glyph over the label inside a lime-ringed
                        glass cell when active. Same EQUIPMENT_OPTIONS data + the
                        single-select setEquipment handler, untouched. */}
                    <Animated.View entering={FadeInDown.delay(285).springify().damping(18).mass(0.7)}>
                        <SectionTitle label="AVAILABLE EQUIPMENT" colors={colors} typography={typography} />
                        <View style={s.equipGrid}>
                            {EQUIPMENT_OPTIONS.map(eq => {
                                const active = equipment === eq.key;
                                return (
                                    <PressableScale
                                        key={eq.key}
                                        pressedScale={0.95}
                                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                        accessibilityRole="radio"
                                        accessibilityState={{ selected: active }}
                                        accessibilityLabel={eq.key}
                                        style={[
                                            s.equipTile,
                                            {
                                                backgroundColor: active ? withAlpha(LIME, 0.16) : colors.background.secondary,
                                                borderColor: active ? LIME : colors.border.default,
                                            },
                                            active && shadows.glow(LIME),
                                        ]}
                                        onPress={() => setEquipment(eq.key)}
                                    >
                                        <View style={[s.equipIcon, { backgroundColor: withAlpha(active ? LIME : colors.text.primary, active ? 0.18 : 0.06) }]}>
                                            <Ionicons name={eq.icon as any} size={22} color={active ? LIME : colors.text.tertiary} />
                                        </View>
                                        <Text style={[typography.caption, { color: active ? LIME : colors.text.secondary, fontWeight: '700', fontSize: 12, marginTop: 8, textAlign: 'center' }]} numberOfLines={1}>
                                            {eq.key}
                                        </Text>
                                    </PressableScale>
                                );
                            })}
                        </View>
                    </Animated.View>

                    {/* Summary — premium stat block (condensed numerals + overline labels). */}
                    <Animated.View
                        entering={FadeInDown.delay(330).springify().damping(18).mass(0.7)}
                        style={[s.summaryCard, { backgroundColor: withAlpha(LIME, 0.08), borderColor: withAlpha(LIME, 0.25), marginHorizontal: 20, marginTop: 24 }]}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                            <Ionicons name="sparkles" size={16} color={LIME} />
                            <Text style={[typography.overline, { color: LIME, marginLeft: 8, fontSize: 11 }]}>
                                RIA'S PLAN SUMMARY
                            </Text>
                        </View>
                        <View style={s.statRow}>
                            {summaryStats.map((stat, i) => (
                                <React.Fragment key={stat.label}>
                                    {i > 0 && <View style={[s.statDivider, { backgroundColor: colors.border.default }]} />}
                                    <View style={s.statCell}>
                                        <Text
                                            style={[typography.statMedium, { color: colors.text.primary, fontSize: 24, lineHeight: 28 }]}
                                            numberOfLines={1}
                                            adjustsFontSizeToFit
                                        >
                                            {stat.value}
                                        </Text>
                                        <Text style={[typography.overline, { color: colors.text.secondary, fontSize: 10, letterSpacing: 0.8, marginTop: 2 }]}>
                                            {stat.label}
                                        </Text>
                                    </View>
                                </React.Fragment>
                            ))}
                        </View>
                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 14, lineHeight: 18 }]}>
                            {`${selectedGoal.label} focus${focusAreas.length > 0 ? ` · ${focusAreas.join(', ')}` : ''} · ${equipment}`}
                        </Text>
                        <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 6, lineHeight: 18 }]}>
                            Ria will build a full exercise list with sets, reps, and progression logic tailored to your plan.
                        </Text>
                    </Animated.View>
                </View>
            </ScrollView>

            {/* Generate CTA */}
            <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                {/* Daily-AI-limit 429 → distinct upgrade state (NOT the retryable
                    error). Mutually exclusive with `genError`; the Upgrade action
                    is the shared CtaButton routing to the premium modal. */}
                {!!quota && !isPending && (
                    <View
                        style={[s.errorCard, { backgroundColor: withAlpha(colors.accent.coral, 0.08), borderColor: withAlpha(colors.accent.coral, 0.35) }]}
                        accessibilityRole="alert"
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                            <Ionicons name="flash-outline" size={20} color={colors.accent.coral} style={{ marginTop: 1 }} />
                            <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>
                                    Daily AI limit reached
                                </Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2, lineHeight: 18 }]}>
                                    {`You've used all ${quota.limit} of your ${quota.plan === 'pro' ? 'Pro' : 'free'} daily AI plans. ${formatResetsAt(quota.resetsAt)}.`}
                                </Text>
                            </View>
                        </View>
                        <CtaButton
                            label="Upgrade"
                            icon="sparkles"
                            size="sm"
                            onPress={() => router.push('/(modals)/premium')}
                            accessibilityLabel="Upgrade to remove the daily AI limit"
                            style={{ alignSelf: 'flex-start', marginTop: 12 }}
                        />
                    </View>
                )}
                {/* Persistent, retryable inline error — survives until a retry succeeds. */}
                {!!genError && !isPending && (
                    <View
                        style={[s.errorCard, { backgroundColor: withAlpha(LIME, 0.08), borderColor: withAlpha(LIME, 0.35) }]}
                        accessibilityRole="alert"
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                            <Ionicons name="alert-circle" size={20} color={LIME} style={{ marginTop: 1 }} />
                            <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>
                                    Generation Failed
                                </Text>
                                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2, lineHeight: 18 }]}>
                                    {genError}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            style={[s.tryAgainBtn, { borderColor: LIME }]}
                            onPress={runGenerate}
                            accessibilityRole="button"
                            accessibilityLabel="Try again"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="refresh" size={16} color={LIME} />
                            <Text style={[typography.caption, { color: LIME, fontWeight: '700', marginLeft: 6 }]}>
                                Try Again
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
                {/* Staged progress copy while generating — ink-free, on the dark
                    footer so the brand CtaButton can own the lime fill + spinner. */}
                {isPending && (
                    <View
                        style={[s.genStepsCard, { backgroundColor: colors.background.secondary, borderColor: withAlpha(LIME, 0.25) }]}
                        accessibilityRole="progressbar"
                        accessibilityLabel="Generating your plan"
                    >
                        <GeneratingSteps
                            active={isPending}
                            steps={WORKOUT_GEN_STEPS}
                            color={LIME}
                            textColor={colors.text.primary}
                            layout="column"
                        />
                    </View>
                )}
                {/* Primary action — the brand CtaButton (ink-on-lime gradient,
                    glow, pressed-scale 0.97, a11y + loading spinner for free). */}
                <CtaButton
                    label="GENERATE MY PLAN"
                    icon="sparkles"
                    size="lg"
                    loading={isPending}
                    onPress={runGenerate}
                    accessibilityLabel="Generate my plan"
                    style={s.generateBtn}
                />
            </View>
        </View>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ label, colors, typography }: any) {
    return (
        <Text style={[typography.overline, {
            color: colors.text.secondary,
            paddingHorizontal: 20,
            paddingTop: 24,
            paddingBottom: 12,
        }]}>
            {label}
        </Text>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container: { flex: 1 },
    headerGrad: { paddingHorizontal: 20, paddingBottom: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    riaAvatar: {
        width: 44, height: 44, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
    },
    goalCard: {
        width: 120, padding: 16, borderRadius: 18, borderWidth: 1, borderCurve: 'continuous',
        alignItems: 'center', position: 'relative',
    },
    goalIcon: {
        width: 44, height: 44, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
    },
    checkBadge: {
        position: 'absolute', top: 8, right: 8,
        width: 18, height: 18, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center',
    },
    levelRow: {
        flexDirection: 'row', alignItems: 'center',
        padding: 16, borderRadius: 16, borderWidth: 1, borderCurve: 'continuous',
        minHeight: 64,
    },
    radioOuter: {
        width: 22, height: 22, borderRadius: 11, borderWidth: 2,
        alignItems: 'center', justifyContent: 'center',
    },
    radioInner: { width: 12, height: 12, borderRadius: 6 },
    daysRow: {
        flexDirection: 'row', paddingHorizontal: 20, gap: 10,
    },
    dayBtn: {
        flex: 1, aspectRatio: 1, borderRadius: 16, borderWidth: 1, borderCurve: 'continuous',
        alignItems: 'center', justifyContent: 'center',
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 10 },
    chip: {
        minHeight: 44, justifyContent: 'center',
        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, borderWidth: 1,
    },
    // Ria intro card — avatar disc + opener copy (mockup: generator preview).
    introRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    introAvatar: {
        width: 40, height: 40, borderRadius: 20, borderWidth: 1.5,
        overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    },
    introAvatarImg: { width: '100%', height: '100%' },
    // Equipment tile GRID — two-up tiles, glyph chip over a centred label.
    equipGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 10 },
    equipTile: {
        width: '47.5%', flexGrow: 1, minHeight: 92,
        alignItems: 'center', justifyContent: 'center',
        paddingVertical: 14, paddingHorizontal: 10,
        borderRadius: 16, borderWidth: 1, borderCurve: 'continuous',
    },
    equipIcon: {
        width: 44, height: 44, borderRadius: 14, borderCurve: 'continuous',
        alignItems: 'center', justifyContent: 'center',
    },
    summaryCard: { borderRadius: 18, borderWidth: 1, borderCurve: 'continuous', padding: 18 },
    statRow: { flexDirection: 'row', alignItems: 'center' },
    statCell: { flex: 1, alignItems: 'center' },
    statDivider: { width: 1, alignSelf: 'stretch', marginVertical: 2 },
    errorCard: { borderRadius: 16, borderWidth: 1, borderCurve: 'continuous', padding: 16, marginBottom: 12 },
    genStepsCard: {
        borderRadius: 16, borderWidth: 1, borderCurve: 'continuous',
        paddingVertical: 18, paddingHorizontal: 16, marginBottom: 12,
    },
    tryAgainBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        alignSelf: 'flex-start', marginTop: 12, minHeight: 40,
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
    },
    footer: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 20,
    },
    generateBtn: {
        height: 60, borderRadius: 30,
    },
});
