/**
 * Challenge list — the gated day-by-day plan. Each day is a cover-photo card with
 * its title + status (done check / "Continue" / lock). Done + active days open the
 * day detail; locked days are inert until the prior day is completed. No plan yet
 * → an empty state that routes to Build my plan.
 */
import React, { useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemedPalette, type ThemedPalette } from '@/theme/useThemedPalette';
import { useCoachStore } from '@/features/coach/coachStore';
import { dayCover } from '@/features/coach/covers';
import { GOAL_LABELS } from '@/features/coach/types';
import { fireTestReminder, nudgeHaptic } from '@/features/coach/reminders';
import { TorchBlinker, type TorchHandle } from '@/components/coach/TorchBlinker';

export default function ChallengeListScreen() {
    const D = useThemedPalette();
    const st = useMemo(() => makeStyles(D), [D]);
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const plan = useCoachStore((s) => s.plan);
    const torchRef = useRef<TorchHandle>(null);

    // Preview a reminder: vibrate + blink the torch (foreground, best-effort) and
    // fire a real notification in ~2s, so all three channels are verifiable.
    const onTest = async () => {
        nudgeHaptic();
        torchRef.current?.blink();
        await fireTestReminder();
    };

    if (!plan) {
        return (
            <View style={[st.root, st.center, { paddingTop: insets.top }]}>
                <StatusBar style="light" />
                <Ionicons name="flash" size={42} color={D.lime} />
                <Text style={st.emptyTitle}>No plan yet</Text>
                <Text style={st.emptySub}>Let Ria build a gated workout + meal challenge around your goal.</Text>
                <TouchableOpacity onPress={() => router.push('/(challenge)/build' as any)} activeOpacity={0.9} style={st.cta}>
                    <Ionicons name="flash" size={18} color={D.ink} />
                    <Text style={st.ctaTxt}>Build my plan</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/(challenge)/gallery' as any)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Browse ready-made challenges" style={st.browse}>
                    <Ionicons name="grid-outline" size={16} color={D.text} />
                    <Text style={st.browseTxt}>Browse challenges</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const done = plan.days.filter((d) => d.status === 'done').length;
    const pct = Math.round((done / plan.durationDays) * 100);

    return (
        <View style={st.root}>
            <StatusBar style="light" />
            <TorchBlinker ref={torchRef} />
            <View style={[st.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Go back" style={st.back}>
                    <Ionicons name="chevron-back" size={22} color={D.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={st.hTitle}>{GOAL_LABELS[plan.inputs.goal]}</Text>
                    <Text style={st.hSub}>{plan.durationDays}-day challenge · {done}/{plan.durationDays} done</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/(challenge)/gallery' as any)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Browse ready-made challenges" style={st.back}>
                    <Ionicons name="grid-outline" size={20} color={D.text} />
                </TouchableOpacity>
                <TouchableOpacity onPress={onTest} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Test a reminder (notification, vibrate, flashlight)" style={st.back}>
                    <Ionicons name="notifications-outline" size={20} color={D.lime} />
                </TouchableOpacity>
            </View>
            <View style={st.barTrack}><View style={[st.barFill, { width: `${pct}%` }]} /></View>

            <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
                {plan.days.map((d) => {
                    const locked = d.status === 'locked';
                    const isDone = d.status === 'done';
                    return (
                        <TouchableOpacity
                            key={d.day}
                            disabled={locked}
                            activeOpacity={0.9}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: locked }}
                            accessibilityLabel={`Day ${d.day}, ${d.title}, ${d.status}`}
                            onPress={() => router.push({ pathname: '/(challenge)/day', params: { day: String(d.day) } } as any)}
                            style={[st.day, locked && st.dayLocked, d.status === 'active' && st.dayActive]}
                        >
                            <Image source={dayCover(d.cover)} style={StyleSheet.absoluteFillObject} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                            <LinearGradient colors={['rgba(10,12,18,0.30)', 'rgba(10,12,18,0.93)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.2 }} style={StyleSheet.absoluteFillObject} />
                            <View style={st.dayInner}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[st.dayOver, { color: isDone || d.status === 'active' ? D.lime : D.muted }]}>DAY {d.day}</Text>
                                    <Text style={st.dayTitle} numberOfLines={1}>{d.title}</Text>
                                </View>
                                {isDone ? (
                                    <Ionicons name="checkmark-circle" size={26} color={D.lime} />
                                ) : locked ? (
                                    <Ionicons name="lock-closed" size={20} color={D.muted} />
                                ) : (
                                    <View style={st.continuePill}><Text style={st.continueTxt}>Continue</Text></View>
                                )}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const makeStyles = (D: ThemedPalette) => StyleSheet.create({
    root: { flex: 1, backgroundColor: D.bg },
    center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
    emptyTitle: { color: D.text, fontSize: 20, fontWeight: '700', marginTop: 6 },
    emptySub: { color: D.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10 },
    back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    hTitle: { color: D.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
    hSub: { color: D.muted, fontSize: 12.5, marginTop: 1 },
    barTrack: { height: 6, borderRadius: 3, backgroundColor: D.tile, marginHorizontal: 18, marginBottom: 6 },
    barFill: { height: '100%', borderRadius: 3, backgroundColor: D.lime },
    day: { height: 86, borderRadius: 16, overflow: 'hidden', justifyContent: 'flex-end', marginTop: 12, borderWidth: 1, borderColor: D.border },
    dayActive: { borderColor: D.lime, borderWidth: 1.5 },
    dayLocked: { opacity: 0.5 },
    dayInner: { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 10 },
    dayOver: { fontSize: 10.5, letterSpacing: 1, fontWeight: '700' },
    dayTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', letterSpacing: -0.2, marginTop: 2 },
    continuePill: { backgroundColor: D.lime, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
    continueTxt: { color: D.ink, fontSize: 12, fontWeight: '600' },
    cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: D.lime, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 22, marginTop: 14 },
    ctaTxt: { color: D.ink, fontSize: 15, fontWeight: '600' },
    browse: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: D.border, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 20, marginTop: 10 },
    browseTxt: { color: D.text, fontSize: 14, fontWeight: '600' },
});
