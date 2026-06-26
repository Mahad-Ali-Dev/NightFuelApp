import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, Linking } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getById, getAnalytics } from '@/api/exercises';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { withAlpha } from '@/theme/utils';
import { spacing } from '@/theme/spacing';
import { Skeleton, EmptyState } from '@/components/ui';
import { GlassCard } from '@/components/ui/GlassCard';
import { CtaButton } from '@/components/ui/CtaButton';
import { LineChart } from 'react-native-gifted-charts';
import { resolveDemo, resolveDemoFrames, tipsFor } from '@/constants/exerciseDemos';
import { getCuratedDemo, getCuratedDemoFrames, getCuratedDemoVerified } from '@/constants/curatedDemos';
import { ExerciseDemo } from '@/components/exercise/ExerciseDemo';
import { getVoiceAdapter } from '@/lib/voice';
import { PressableScale } from '@/components/PressableScale';
const { width } = Dimensions.get('window');
// Bundled neutral placeholder shown when an exercise has no image (no network hit).
const FALLBACK_IMAGE = require('../../assets/images/exercise-detail-fallback.png');
// Keyed lower-case so the lookup is case-insensitive (the DB default is the
// lower-case "intermediate"; the catalog seeder writes "Beginner"/"Intermediate"/
// "Advanced"). "advanced" is the catalog's hardest tier; "expert" kept for legacy.
const DIFF_COLORS: Record<string, string> = { beginner: '#2ECC71', intermediate: '#F59E0B', advanced: '#EF4444', expert: '#EF4444' };
// Map raw ExerciseDB body-part keys to human, capitalized labels so no raw
// "upper legs" / "lower arms" leaks into the UI. Falls back to a Title-Case of
// the raw token for anything unmapped.
const BODY_PART_LABELS: Record<string, string> = {
    back: 'Back', chest: 'Chest', shoulders: 'Shoulders', neck: 'Neck',
    'upper legs': 'Legs', 'lower legs': 'Calves', 'lower arms': 'Forearms', 'upper arms': 'Arms',
    waist: 'Core / Abs', cardio: 'Cardio', 'pelvic floor': 'Pelvic Floor',
};
// Human label for a muscle/body-part token (case-insensitive), capitalized.
const muscleLabel = (raw?: string | null): string => {
    const t = (raw ?? '').trim();
    if (!t) return '';
    return BODY_PART_LABELS[t.toLowerCase()] ?? t.charAt(0).toUpperCase() + t.slice(1);
};
type DetailTab = 'howto' | 'muscles' | 'tips' | 'progress';
const TABS: { key: DetailTab; label: string }[] = [{ key: 'howto', label: 'How To' },{ key: 'muscles', label: 'Muscles' },{ key: 'tips', label: 'Pro Tips' },{ key: 'progress', label: 'Progress' }];
// The set of demo-source inputs we hand to <ExerciseDemo/> for the active
// exercise. Each slot is independently null so the precedence walk below can
// fall through cleanly when no source resolves.
type DemoInputs = {
    demoFrames: readonly string[] | null;
    demoUrl: string | null;
    demoGifUrl: string | null;
};
export default function ExerciseDetailScreen() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [activeTab, setActiveTab] = useState<DetailTab>('howto');
    const exerciseQuery = useQuery({ queryKey: ['exercise-detail', id], queryFn: () => getById(id!), enabled: !!id });
    const exercise = exerciseQuery.data;
    const analyticsQuery = useQuery({ queryKey: ['exercise-analytics', exercise?.name], queryFn: () => getAnalytics(exercise?.name || ''), enabled: !!exercise?.name && activeTab === 'progress' });
    // Parse instruction text into discrete steps. Deterministic: if the source has
    // real line breaks, split on those; otherwise fall back to sentence boundaries.
    // A leading "1. " / "2) " numbering is stripped so we never double-number.
    const instructions = useMemo<string[]>(() => {
        const raw = typeof exercise?.instructions === 'string' ? exercise.instructions.trim() : '';
        if (!raw) return [];
        const parts = /\n/.test(raw) ? raw.split(/\n+/) : raw.split(/(?<=[.!?])\s+/);
        return parts
            .map((s: string) => s.replace(/^\s*\d+[.)]\s*/, '').trim())
            .filter((s: string) => s.length > 0);
    }, [exercise?.instructions]);
    // A single chunk reads better as a flowing paragraph than a lone "1." bullet.
    const isSingleParagraph = instructions.length === 1;
    // ── Read-aloud (TTS) for the How-To steps ─────────────────────────────────
    // Uses the gate-safe voice seam: real expo-speech in an EAS build, an honest
    // no-op in Expo Go / jest. `ttsAvailable` is false there, so the "Hear it from
    // Ria" voice row isn't rendered at all (no dead button) — matching the screen's
    // existing "only show what actually works" honesty.
    const voice = useRef(getVoiceAdapter()).current;
    const ttsAvailable = voice.isTTSAvailable();
    const [speaking, setSpeaking] = useState(false);
    const toggleSpeak = useCallback(() => {
        if (speaking) { voice.stopSpeaking(); setSpeaking(false); return; }
        if (instructions.length === 0) return;
        const title = typeof exercise?.name === 'string' && exercise.name.trim() ? exercise.name.trim() : 'This exercise';
        const script = `${title}. ` + instructions.map((step, i) => `Step ${i + 1}. ${step}`).join(' ');
        setSpeaking(true);
        voice.speak(script, { onDone: () => setSpeaking(false) });
    }, [speaking, instructions, exercise?.name, voice]);
    // Stop narration when the screen unmounts or the user leaves the How-To tab,
    // so audio never outlives the view that started it.
    useEffect(() => () => { voice.stopSpeaking(); }, [voice]);
    useEffect(() => { if (activeTab !== 'howto' && speaking) { voice.stopSpeaking(); setSpeaking(false); } }, [activeTab, speaking, voice]);
    // Demo-source precedence, preserving the existing resolveDemoFrames/resolveDemo
    // result as the default. The curated map (sibling module) is only consulted
    // when BOTH existing resolvers return null — strictly additive coverage for
    // the >=100 exercise names CURATED_DEMOS adds on top of the original 35.
    // Returned as a single record (typed at {@link DemoInputs} above) so the
    // four <ExerciseDemo/> input slots stay co-derived from the same walk.
    const { demoFrames, demoUrl, demoGifUrl } = useMemo<DemoInputs>(() => {
        const existingFrames = resolveDemoFrames(exercise);
        const existingUrl = resolveDemo(exercise);
        // Skip the curated lookup entirely when either default resolver already
        // produced a result — we never override an existing demo.
        if (existingFrames || existingUrl) {
            return { demoFrames: existingFrames, demoUrl: existingUrl, demoGifUrl: null };
        }
        const name = exercise?.name ?? '';
        const curated = getCuratedDemo(name);
        if (!curated) {
            return { demoFrames: null, demoUrl: null, demoGifUrl: null };
        }
        // Translate the curated entry's kind into the matching <ExerciseDemo/>
        // input slot. fedb_frames feeds the animated loop, youtube feeds the
        // "Full tutorial" link, gif feeds the gifUrl slot which expo-image
        // animates as a playing demo.
        if (curated.kind === 'fedb_frames') {
            // Defensive: only feed the animated-loop slot a non-empty list of
            // real HTTPS frame URLs. A malformed entry that split to nothing
            // falls through to { null, null, null } so <ExerciseDemo/> shows the
            // still + honest "coming soon" rather than an empty/never-resolving
            // player. (Every real fedb_frames entry yields a 2-frame pair, so
            // this is belt-and-braces, not an expected path.)
            const curatedFrames = getCuratedDemoFrames(name);
            const validFrames = curatedFrames?.filter(
                (u): u is string => typeof u === 'string' && u.trim().length > 0,
            );
            if (validFrames && validFrames.length > 0) {
                return { demoFrames: validFrames, demoUrl: null, demoGifUrl: null };
            }
            return { demoFrames: null, demoUrl: null, demoGifUrl: null };
        }
        if (curated.kind === 'youtube') {
            // A curated YouTube entry has no in-app frames — it surfaces ONLY as
            // the "Full tutorial"/"Watch demo" deep-link (tutorialUrl). The
            // player still renders the exercise's own imageUrl (or the bundled
            // fallback) underneath, never an empty box.
            return { demoFrames: null, demoUrl: curated.url, demoGifUrl: null };
        }
        // curated.kind === 'gif' — feeds the gifUrl slot, which expo-image
        // animates as a playing demo (the "Demo" pill). A static still is only
        // the degenerate single-frame fallback, not the normal case.
        const gifUrl = typeof curated.url === 'string' && curated.url.trim().length > 0 ? curated.url : null;
        return { demoFrames: null, demoUrl: null, demoGifUrl: gifUrl };
    }, [exercise]);
    // Curated `verified` flag for the current exercise name. Null when no
    // curated entry exists; false renders the "Unreviewed" chip below.
    const curatedVerified = useMemo(() => getCuratedDemoVerified(exercise?.name ?? ''), [exercise?.name]);
    // Body-part-specific coaching cues (distinct per muscle group); generic fallback.
    const { tips, isGeneral: tipsAreGeneral } = useMemo(() => tipsFor(exercise?.bodyPart), [exercise?.bodyPart]);
    // Secondary muscles — guarded: the API may not surface this field yet.
    const secondaryMuscles: string[] = Array.isArray(exercise?.secondaryMuscles)
        ? exercise.secondaryMuscles.filter((m: unknown): m is string => typeof m === 'string' && m.trim().length > 0)
        : [];
    // Primary muscle chips: collapse bodyPart + muscleGroup case-insensitively so
    // "Chest" vs "chest" (or region+region pairs) never render as duplicate chips.
    const primaryMuscles = useMemo<string[]>(() => {
        const out: string[] = [];
        const seen = new Set<string>();
        for (const raw of [exercise?.bodyPart, exercise?.muscleGroup]) {
            const t = typeof raw === 'string' ? raw.trim() : '';
            if (!t) continue;
            const key = t.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(t);
        }
        return out;
    }, [exercise?.bodyPart, exercise?.muscleGroup]);
    // Set of primary muscle keys so secondary chips can drop any repeat (case-insensitive).
    const primaryKeys = useMemo(() => new Set(primaryMuscles.map((m) => m.toLowerCase())), [primaryMuscles]);
    // Secondary muscles minus any that repeat a primary, de-duped (case-insensitive).
    const secondaryFiltered = useMemo<string[]>(
        () => secondaryMuscles.filter((m, i, a) => !primaryKeys.has(m.trim().toLowerCase()) && a.findIndex((x) => x.trim().toLowerCase() === m.trim().toLowerCase()) === i),
        [secondaryMuscles, primaryKeys],
    );
    // Muscle-target chips shown under the title (the mockup's Quads/Glutes/Core row).
    // Primary muscles first (lime), then a couple of secondary muscles, capped so the
    // row never wraps into a wall of chips. Surfaces the SAME real data the Muscles
    // tab breaks down in full.
    const targetChips = useMemo<string[]>(() => {
        const out: string[] = [];
        const seen = new Set<string>();
        for (const m of [...primaryMuscles, ...secondaryFiltered]) {
            const label = muscleLabel(m);
            const key = label.toLowerCase();
            if (!label || seen.has(key)) continue;
            seen.add(key);
            out.push(label);
            if (out.length >= 4) break;
        }
        return out;
    }, [primaryMuscles, secondaryFiltered]);
    // Display label: prefer bodyPart, mapped to a human label (no raw "upper legs").
    const targetLabel = exercise?.bodyPart
        ? muscleLabel(exercise.bodyPart)
        : (exercise?.muscleGroup ? muscleLabel(exercise.muscleGroup) : 'N/A');
    const chartData = useMemo(() => { if (!analyticsQuery.data || !Array.isArray(analyticsQuery.data)) return []; return analyticsQuery.data.map((e: any) => ({ value: e.maxWeight || 0, label: new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })).slice(-10); }, [analyticsQuery.data]);
    const diffColor = DIFF_COLORS[(exercise?.difficulty ?? '').trim().toLowerCase()] ?? colors.accent.lime;
    if (exerciseQuery.isLoading) return (
        <View style={[s.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <Skeleton width="100%" height={320} radius={0} />
            <View style={{ padding: spacing.xl, marginTop: -40 }}>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                    <Skeleton width={88} height={22} radius={8} />
                    <Skeleton width={104} height={22} radius={8} />
                </View>
                <Skeleton width="72%" height={36} radius={10} />
                <Skeleton width={160} height={16} radius={6} style={{ marginTop: spacing.md }} />
                <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
                    {[0, 1, 2].map((i) => <Skeleton key={i} width={(width - 56) / 3} height={92} radius={16} />)}
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing['3xl'] }}>
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} width={52} height={14} radius={6} />)}
                </View>
                <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
                    {[0, 1, 2].map((i) => <Skeleton key={i} width="100%" height={18} radius={6} />)}
                </View>
            </View>
        </View>
    );
    if (!exercise) return (
        <View style={[s.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[s.headerRow, { paddingTop: insets.top + 8 }]}>
                <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" style={[s.overlayBtn, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#FFF" /></PressableScale>
            </View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
                <EmptyState
                    icon="barbell-outline"
                    title="Exercise not found"
                    subtitle="We couldn't load this exercise. It may have been removed or there was a connection hiccup."
                    actionLabel="Back to Library"
                    onAction={() => router.back()}
                />
            </View>
        </View>
    );
    // Header stat tiles — value DOMINATES its label (big condensed numeral/word
    // over a tiny overline). 60/30/10 restraint: Target reads informational
    // (blue), Equipment cyan, Level inherits the semantic difficulty hue. Lime is
    // held back for the one primary CTA + the active-tab indicator + the voice row.
    const statTiles = [
        { icon: 'body', label: 'Target', value: targetLabel, color: colors.accent.blue },
        { icon: 'barbell', label: 'Equipment', value: exercise.equipment || 'None', color: colors.accent.cyan },
        { icon: 'bar-chart', label: 'Level', value: exercise.difficulty || 'N/A', color: diffColor },
    ];
    return (
        <View style={[s.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[s.headerRow, { paddingTop: insets.top + 8 }]}>
                <PressableScale hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back" style={[s.overlayBtn, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#FFF" /></PressableScale>
                {demoUrl ? (
                    <PressableScale
                        style={[s.overlayBtn, { backgroundColor: 'rgba(0,0,0,0.6)', width: 'auto', paddingHorizontal: 14, flexDirection: 'row', gap: 6 }]}
                        accessibilityRole="link"
                        accessibilityLabel="Watch demo video"
                        onPress={() => Linking.openURL(demoUrl)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Ionicons name="logo-youtube" size={18} color={colors.accent.red} /><Text style={[typography.captionMedium, { color: '#FFF', fontSize: 12 }]}>Watch demo</Text>
                    </PressableScale>
                ) : null}
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 132 }} showsVerticalScrollIndicator={false}>
                <ExerciseDemo
                    frames={demoFrames}
                    gifUrl={demoGifUrl ?? null}
                    videoUrl={exercise.videoUrl ?? null}
                    imageUrl={exercise.imageUrl ?? null}
                    fallback={FALLBACK_IMAGE}
                    tutorialUrl={demoUrl}
                />
                <View style={{ paddingHorizontal: spacing.xl, marginTop: -44 }}>
                    {/* Title block — overline (muscle/level) + big condensed display name. */}
                    <Animated.View entering={FadeInDown.duration(420).springify().damping(20).mass(0.7)}>
                        {curatedVerified === false ? (
                            <View
                                accessibilityLabel="Demo not yet human-reviewed"
                                style={[s.reviewBadge, { borderColor: colors.border.light }]}
                            >
                                <Ionicons name="time-outline" size={11} color={colors.text.tertiary} />
                                <Text style={[typography.overline, { color: colors.text.tertiary, fontSize: 10 }]}>Unreviewed</Text>
                            </View>
                        ) : null}
                        {/* Overline echoes the mockup's "Exercise N of M" eyebrow with the REAL
                            target muscle group + difficulty (no fabricated counter). */}
                        <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.xs }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                            {[muscleLabel(exercise.muscleGroup) || targetLabel, (exercise.difficulty || '').trim()].filter(Boolean).join(' · ') || 'Exercise'}
                        </Text>
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 34, lineHeight: 38 }]} maxFontSizeMultiplier={1.3}>{exercise.name}</Text>
                        {exercise.equipment && <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: spacing.xs }]} maxFontSizeMultiplier={1.4}>Equipment · {exercise.equipment}</Text>}
                    </Animated.View>
                    {/* Muscle-target chips (the mockup's Quads / Glutes / Core row) — lime,
                        sourced from the real primary + secondary muscles. */}
                    {targetChips.length > 0 ? (
                        <Animated.View entering={FadeInDown.delay(45).duration(420)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg }}>
                            {targetChips.map((label) => (
                                <View key={label} style={[s.targetChip, { backgroundColor: withAlpha(colors.accent.lime, 0.12), borderColor: withAlpha(colors.accent.lime, 0.45) }]}>
                                    <Text style={[typography.captionMedium, { color: colors.accent.lime, fontSize: 12 }]} maxFontSizeMultiplier={1.3}>{label}</Text>
                                </View>
                            ))}
                        </Animated.View>
                    ) : null}
                    {/* "Hear it from Ria" voice row — the prominent lime speaker control. Wired
                        to the EXISTING TTS seam (toggleSpeak/voice). Gated on real instructions
                        + an available TTS engine so it never renders a dead button. */}
                    {instructions.length > 0 && ttsAvailable ? (
                        <Animated.View entering={FadeInDown.delay(90).duration(420)} style={{ marginTop: spacing.lg }}>
                            <PressableScale
                                onPress={toggleSpeak}
                                accessibilityRole="button"
                                accessibilityLabel={speaking ? 'Stop the spoken walkthrough' : 'Hear it from Ria — play the spoken walkthrough'}
                                accessibilityState={{ selected: speaking }}
                            >
                                <GlassCard radius={borderRadius.lg} glow={speaking ? colors.accent.lime : undefined}>
                                    <View style={s.voiceRow}>
                                        <View style={[s.voiceDisc, { backgroundColor: colors.accent.lime }]}>
                                            <Ionicons name={speaking ? 'stop' : 'volume-high'} size={22} color={colors.text.inverse} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[typography.bodyMedium, { color: colors.text.primary }]} maxFontSizeMultiplier={1.4}>Hear it from Ria</Text>
                                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 1 }]} maxFontSizeMultiplier={1.4}>{speaking ? 'Playing the spoken walkthrough…' : 'Play the spoken walkthrough'}</Text>
                                        </View>
                                        <Ionicons name={speaking ? 'pause-circle' : 'play'} size={speaking ? 26 : 22} color={colors.accent.lime} />
                                    </View>
                                </GlassCard>
                            </PressableScale>
                        </Animated.View>
                    ) : null}
                    {/* Stat tiles — value over label, premium glass, 8pt rhythm. */}
                    <Animated.View entering={FadeInDown.delay(120).duration(420).springify().damping(20).mass(0.7)} style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
                        {statTiles.map((c)=>(
                            <GlassCard key={c.label} radius={borderRadius.lg} style={{ flex: 1 }}>
                                <View style={{ paddingVertical: spacing.lg, paddingHorizontal: spacing.sm, alignItems: 'center' }}>
                                    <View style={{ width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:withAlpha(c.color,0.14) }}><Ionicons name={c.icon as any} size={18} color={c.color} /></View>
                                    <Text style={[typography.statSmall, { color: colors.text.primary, marginTop: spacing.sm, fontSize: 21, lineHeight: 23, textAlign: 'center' }]} numberOfLines={2} maxFontSizeMultiplier={1.2}>{c.value}</Text>
                                    <Text style={[typography.overline, { color: colors.text.tertiary, fontSize: 9, marginTop: spacing.xxs }]} maxFontSizeMultiplier={1.2}>{c.label}</Text>
                                </View>
                            </GlassCard>
                        ))}
                    </Animated.View>
                    {/* Tabs — the active indicator is one of the few LIME (10%) accents. */}
                    <Animated.View entering={FadeInDown.delay(180).duration(420)} style={[s.tabRow, { borderBottomColor: colors.border.default, marginTop: spacing['3xl'] }]}>
                        {TABS.map((tab) => { const sel = activeTab===tab.key; return (<PressableScale key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: sel }} accessibilityLabel={tab.label} onPress={() => setActiveTab(tab.key)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={[s.tab, sel && { borderBottomColor: colors.accent.lime }]}><Text style={[typography.overline, { color: sel ? colors.text.primary : colors.text.secondary, fontSize: 11.5 }]} maxFontSizeMultiplier={1.3}>{tab.label}</Text></PressableScale>); })}
                    </Animated.View>
                    <Animated.View entering={FadeInDown.delay(240).duration(420)} style={{ marginTop: spacing.xl }}>
                        {activeTab==='howto' && (
                            <View style={{ gap: spacing.lg }}>
                                {instructions.length === 0 ? (
                                    <View style={{ gap: spacing.lg }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                                            <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.accent.amber, 0.14) }}><Ionicons name="bulb-outline" size={18} color={colors.accent.amber} /></View>
                                            <Text style={[typography.h3, { color: colors.text.primary }]}>Instructions coming soon</Text>
                                        </View>
                                        <Text style={[typography.bodySm, { color: colors.text.tertiary }]}>Step-by-step instructions aren't available yet. In the meantime, keep these coaching cues in mind:</Text>
                                        {tips.map((tip, i) => (
                                            <View key={i} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
                                                <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 9, backgroundColor: colors.accent.amber }} />
                                                <Text style={[typography.body, { color: colors.text.secondary, flex: 1 }]} maxFontSizeMultiplier={1.5}>{tip}</Text>
                                            </View>
                                        ))}
                                    </View>
                                ) : (
                                    <>
                                        <Text style={[typography.h3, { color: colors.text.primary }]}>How to do it</Text>
                                        {isSingleParagraph ? (
                                            <Text style={[typography.body, { color: colors.text.secondary, lineHeight: 24 }]} maxFontSizeMultiplier={1.5}>{instructions[0]}</Text>
                                        ) : (
                                            instructions.map((step: string, idx: number) => (
                                                <View key={idx} style={s.step}>
                                                    <View style={[s.stepNum, { backgroundColor: withAlpha(colors.accent.lime, 0.14), borderColor: withAlpha(colors.accent.lime, 0.4) }]}>
                                                        <Text style={[typography.captionMedium, { color: colors.accent.lime, fontSize: 12 }]}>{idx + 1}</Text>
                                                    </View>
                                                    <Text style={[typography.bodySm, { color: '#DFE3EA', flex: 1, lineHeight: 21, paddingTop: 2 }]} maxFontSizeMultiplier={1.5}>{step}</Text>
                                                </View>
                                            ))
                                        )}
                                    </>
                                )}
                            </View>
                        )}
                        {activeTab==='muscles' && (
                            <GlassCard style={{ padding: spacing.xl }}>
                                <Text style={[typography.overline,{color:colors.text.tertiary,marginBottom:spacing.md}]}>Primary Muscles</Text>
                                <View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm}}>{primaryMuscles.map((m:string,i:number)=>(<View key={i} style={[s.chip,{backgroundColor:withAlpha(colors.accent.lime,0.14),borderColor:withAlpha(colors.accent.lime,0.5)}]}><Text style={[typography.captionMedium,{color:colors.accent.lime}]}>{muscleLabel(m)}</Text></View>))}</View>
                                {secondaryFiltered.length>0 && <><Text style={[typography.overline,{color:colors.text.tertiary,marginTop:spacing.xl,marginBottom:spacing.md}]}>Secondary Muscles</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm}}>{secondaryFiltered.map((m:string,i:number)=>(<View key={i} style={[s.chip,{backgroundColor:withAlpha(colors.accent.cyan,0.14),borderColor:withAlpha(colors.accent.cyan,0.5)}]}><Text style={[typography.captionMedium,{color:colors.accent.cyan}]}>{muscleLabel(m)}</Text></View>))}</View></>}
                            </GlassCard>
                        )}
                        {activeTab==='tips' && (
                            <GlassCard style={{ padding: spacing.xl }}>
                                <View style={{flexDirection:'row',alignItems:'center',marginBottom:spacing.lg}}><View style={{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',backgroundColor:withAlpha(colors.accent.amber,0.14)}}><Ionicons name="bulb" size={20} color={colors.accent.amber} /></View><Text style={[typography.h3,{color:colors.text.primary,marginLeft:spacing.md}]}>{tipsAreGeneral?'Training Tips':"Coach's Tips"}</Text></View>
                                {tips.map((tip,i)=>(<View key={i} style={{flexDirection:'row',gap:spacing.md,marginBottom:spacing.md}}><View style={{width:6,height:6,borderRadius:3,marginTop:8,backgroundColor:colors.accent.amber}} /><Text style={[typography.body,{color:colors.text.secondary,flex:1}]} maxFontSizeMultiplier={1.5}>{tip}</Text></View>))}
                            </GlassCard>
                        )}
                        {activeTab==='progress' && (analyticsQuery.isLoading?<GlassCard style={{ padding: spacing.xl }}><Skeleton width={180} height={18} radius={6} style={{marginBottom:spacing.xl}} /><Skeleton width="100%" height={180} radius={borderRadius.md} /></GlassCard>:analyticsQuery.isError?<EmptyState icon="cloud-offline-outline" title="Couldn't load progress" subtitle="We hit a snag fetching your weight progression. Check your connection and try again." actionLabel="Retry" onAction={()=>analyticsQuery.refetch()} />:chartData.length>0?<GlassCard style={{ padding: spacing.xl }}><Text style={[typography.overline,{color:colors.text.tertiary,marginBottom:spacing.lg}]}>Weight Progression · KG</Text><LineChart data={chartData} width={width-100} height={180} color={colors.accent.cyan} thickness={3} startFillColor={colors.accent.cyan} startOpacity={0.4} endOpacity={0.1} initialSpacing={20} noOfSections={4} yAxisColor={colors.border.default} xAxisColor={colors.border.default} yAxisTextStyle={{color:colors.text.secondary,fontSize:10}} xAxisLabelTextStyle={{color:colors.text.secondary,fontSize:10}} /></GlassCard>:<EmptyState icon="stats-chart-outline" title="No progress yet" subtitle="Log a set of this exercise and your weight progression will start charting here." actionLabel="Log This Exercise" onAction={()=>router.push({pathname:'/training/workout',params:{exercise:exercise.name}})} />)}
                    </Animated.View>
                </View>
            </ScrollView>
            <View style={[s.footer,{paddingBottom:Math.max(insets.bottom,20)}]}>
                <LinearGradient colors={['transparent', colors.background.primary]} pointerEvents="none" style={s.footerFade} />
                <CtaButton
                    size="lg"
                    icon="add-circle"
                    label="LOG THIS EXERCISE"
                    accessibilityLabel="Log this exercise"
                    onPress={()=>router.push({pathname:'/training/workout',params:{exercise:exercise.name}})}
                />
            </View>
        </View>
    );
}
const s = StyleSheet.create({
    container:{flex:1}, headerRow:{position:'absolute',top:0,left:0,right:0,zIndex:10,flexDirection:'row',justifyContent:'space-between',paddingHorizontal:spacing.xl,paddingBottom:spacing.sm},
    overlayBtn:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},
    reviewBadge:{flexDirection:'row',alignItems:'center',gap:spacing.xs,alignSelf:'flex-start',marginBottom:spacing.sm,paddingHorizontal:spacing.sm,paddingVertical:3,borderRadius:999,borderWidth:1,backgroundColor:'transparent'},
    targetChip:{paddingHorizontal:spacing.md,paddingVertical:6,borderRadius:999,borderWidth:1},
    voiceRow:{flexDirection:'row',alignItems:'center',gap:spacing.md,paddingVertical:spacing.md,paddingHorizontal:spacing.lg},
    voiceDisc:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center'},
    tabRow:{flexDirection:'row',borderBottomWidth:1}, tab:{paddingVertical:spacing.md,marginRight:spacing.xl,borderBottomWidth:2,borderBottomColor:'transparent'},
    step:{flexDirection:'row',gap:spacing.md,alignItems:'flex-start',paddingVertical:spacing.md,borderBottomWidth:1,borderBottomColor:'#1A1D24'},
    stepNum:{width:26,height:26,borderRadius:13,alignItems:'center',justifyContent:'center',borderWidth:1},
    chip:{paddingHorizontal:spacing.md,paddingVertical:spacing.xs,borderRadius:999,borderWidth:1},
    footer:{position:'absolute',bottom:0,left:0,right:0,paddingHorizontal:spacing.xl},
    footerFade:{position:'absolute',left:0,right:0,bottom:0,height:120},
});
