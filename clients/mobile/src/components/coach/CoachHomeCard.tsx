/**
 * CoachHomeCard — the dedicated Home entry for the AI Coach challenge.
 *
 * No plan yet → a lime invite that opens "Build my plan". An active plan → a
 * cover-photo card showing the current day + progress that deep-links into the
 * challenge list. Self-contained (reads useCoachStore), drop into the Home feed.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemedPalette } from '@/theme/useThemedPalette';
import { withAlpha } from '@/theme/utils';
import { useCoachStore } from '@/features/coach/coachStore';
import { dayCover } from '@/features/coach/covers';
import { GOAL_LABELS } from '@/features/coach/types';

export function CoachHomeCard() {
    const D = useThemedPalette();
    const router = useRouter();
    const plan = useCoachStore((s) => s.plan);

    if (!plan) {
        return (
            <TouchableOpacity
                onPress={() => router.push('/(challenge)/build' as any)}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="Build an AI workout and meal plan with Coach Ria"
                style={[st.invite, { backgroundColor: D.card, borderColor: D.lime }]}
            >
                <View style={[st.icon, { backgroundColor: withAlpha(D.lime, 0.14) }]}>
                    <Ionicons name="flash" size={22} color={D.lime} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[st.title, { color: D.text }]}>Meet Coach Ria</Text>
                    <Text style={[st.sub, { color: D.muted }]}>Build an AI workout + meal challenge</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={D.lime} />
            </TouchableOpacity>
        );
    }

    const active = plan.days.find((d) => d.status === 'active') ?? plan.days[plan.days.length - 1]!;
    const done = plan.days.filter((d) => d.status === 'done').length;

    return (
        <TouchableOpacity
            onPress={() => router.push('/(challenge)' as any)}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={`Continue your plan, day ${active.day}, ${active.title}`}
            style={[st.active, { borderColor: D.lime }]}
        >
            <Image source={dayCover(active.cover)} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={150} />
            <LinearGradient colors={['rgba(10,12,18,0.5)', 'rgba(10,12,18,0.92)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.4 }} style={StyleSheet.absoluteFillObject} />
            <View style={st.inner}>
                <View style={{ flex: 1 }}>
                    <Text style={[st.over, { color: D.lime }]}>{GOAL_LABELS[plan.inputs.goal].toUpperCase()} · DAY {active.day}/{plan.durationDays}</Text>
                    <Text style={[st.title, { color: '#FFF' }]} numberOfLines={1}>{active.title}</Text>
                    <Text style={[st.sub, { color: '#CFD4DD' }]}>{done} done · tap to continue</Text>
                </View>
                <View style={[st.play, { backgroundColor: D.lime }]}>
                    <Ionicons name="play" size={16} color={D.ink} />
                </View>
            </View>
        </TouchableOpacity>
    );
}

const st = StyleSheet.create({
    invite: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 13 },
    icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    active: { borderRadius: 16, borderWidth: 1.5, overflow: 'hidden', minHeight: 92, justifyContent: 'center' },
    inner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
    over: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1 },
    title: { fontSize: 16, fontWeight: '600', marginTop: 2 },
    sub: { fontSize: 12, marginTop: 2 },
    play: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
