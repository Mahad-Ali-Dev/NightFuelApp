/**
 * Challenge gallery — a shortcut into the Coach flow. Instead of dialing in every
 * input on Build my plan, the user browses 6 curated hero-image challenges (Fat
 * Loss Blitz, Night-Shift Reset, Cycle Sync, …) and taps one. That hands the SAME
 * `generate(inputs)` store action a ready-made CoachInputs (via challengeInputs)
 * and routes to the gated challenge list — identical pipeline to build.tsx, just
 * pre-filled. Hero photos reuse the bundled day covers as placeholders for now.
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemedPalette, type ThemedPalette } from '@/theme/useThemedPalette';
import { withAlpha } from '@/theme/utils';
import { useCoachStore, MONTHLY_PLAN_LIMIT, generationsThisMonth } from '@/features/coach/coachStore';
import { dayCover, challengeHero } from '@/features/coach/covers';
import { CHALLENGE_TEMPLATES, challengeInputs, type ChallengeTemplate } from '@/features/coach/challengeTemplates';
import { loadSplitContext } from '@/features/coach/challengeContext';

export default function ChallengeGalleryScreen() {
    const D = useThemedPalette();
    const st = useMemo(() => makeStyles(D), [D]);
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const generate = useCoachStore((s) => s.generate);
    const status = useCoachStore((s) => s.status);
    const generations = useCoachStore((s) => s.generations);

    const remaining = Math.max(0, MONTHLY_PLAN_LIMIT - generationsThisMonth(generations));
    const atLimit = remaining <= 0;
    const busy = status === 'generating';

    // Same hand-off as build.tsx: seed a plan from the template's inputs, then
    // replace to the gated list. Guarded by the monthly quota (generate → false).
    const onStart = async (t: ChallengeTemplate) => {
        if (atLimit || busy) return;
        // Resolve the challenge's live personalization (sleep window / cycle phase)
        // best-effort — undefined for plain challenges or on failure → plan.ts defaults.
        const personalization = await loadSplitContext(t);
        const ok = await generate(challengeInputs(t), personalization);
        if (ok) router.replace('/(challenge)' as any);
    };

    return (
        <View style={st.root}>
            <StatusBar style="light" />
            <View style={[st.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Go back" style={st.back}>
                    <Ionicons name="chevron-back" size={22} color={D.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={st.hTitle}>Challenges</Text>
                    <Text style={st.hSub}>Pick a ready-made plan — Ria fills the rest.</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
                {CHALLENGE_TEMPLATES.map((t) => (
                    <TouchableOpacity
                        key={t.id}
                        disabled={busy || atLimit}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: busy || atLimit }}
                        accessibilityLabel={`Start ${t.title}, ${t.subtitle}`}
                        onPress={() => onStart(t)}
                        style={[st.card, { borderColor: withAlpha(t.accent, 0.45) }, (busy || atLimit) && { opacity: 0.45 }]}
                    >
                        <Image source={challengeHero(t.id) ?? dayCover(t.heroCover)} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                        <LinearGradient colors={['rgba(10,12,18,0.25)', 'rgba(10,12,18,0.94)']} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFillObject} />
                        <View style={st.cardInner}>
                            <View style={[st.tag, { backgroundColor: withAlpha(t.accent, 0.18), borderColor: withAlpha(t.accent, 0.5) }]}>
                                <Text style={[st.tagTxt, { color: t.accent }]}>{t.tag}</Text>
                            </View>
                            <View style={{ flex: 1 }} />
                            <Text style={st.cardTitle} numberOfLines={1}>{t.title}</Text>
                            <Text style={st.cardSub} numberOfLines={1}>{t.subtitle}</Text>
                            <Text style={st.cardBlurb} numberOfLines={2}>{t.blurb}</Text>
                        </View>
                    </TouchableOpacity>
                ))}

                <Text style={st.quota}>
                    {atLimit
                        ? "You've used all 3 plans this month — keep going with your current plan."
                        : `${remaining} of ${MONTHLY_PLAN_LIMIT} new plans left this month`}
                </Text>
                <TouchableOpacity onPress={() => router.push('/(challenge)/build' as any)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Build a custom plan instead" style={st.customBtn}>
                    <Ionicons name="options-outline" size={16} color={D.text} />
                    <Text style={st.customTxt}>Build a custom plan instead</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const makeStyles = (D: ThemedPalette) => StyleSheet.create({
    root: { flex: 1, backgroundColor: D.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, gap: 4 },
    back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    hTitle: { color: D.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
    hSub: { color: D.muted, fontSize: 12.5, marginTop: 1 },
    card: { height: 190, borderRadius: 18, overflow: 'hidden', justifyContent: 'flex-end', marginTop: 14, borderWidth: 1 },
    cardInner: { flex: 1, padding: 15, alignItems: 'flex-start' },
    tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    tagTxt: { fontSize: 10.5, letterSpacing: 1, fontWeight: '700' },
    cardTitle: { color: '#FFF', fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
    cardSub: { color: 'rgba(255,255,255,0.72)', fontSize: 12.5, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
    cardBlurb: { color: 'rgba(255,255,255,0.86)', fontSize: 13, lineHeight: 18, marginTop: 6 },
    quota: { color: D.muted, fontSize: 12, textAlign: 'center', marginTop: 22, marginBottom: 12 },
    customBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: D.border, borderRadius: 14, paddingVertical: 13 },
    customTxt: { color: D.text, fontSize: 14, fontWeight: '600' },
});
