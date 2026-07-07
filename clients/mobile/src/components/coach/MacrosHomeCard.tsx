/**
 * MacrosHomeCard — today's macro tracker for the Home feed. Calories big, then
 * protein/carbs/fat bars vs target. Self-fetches the SAME ['today-progress']
 * query Home + Meals use, so logging a meal (which invalidates that key) updates
 * it live. Uses the theme's semantic macro hues (constant across themes).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { getToday } from '@/api/progress';

export function MacrosHomeCard() {
    const { colors, typography } = useTheme();
    const { data } = useQuery({ queryKey: ['today-progress'], queryFn: getToday, retry: 1 });

    const kcalA = Math.round(data?.caloriesActual ?? 0);
    const kcalT = data?.caloriesTarget ?? null;
    const macros = [
        { key: 'protein', label: 'Protein', a: data?.proteinActual ?? 0, t: data?.proteinTarget ?? null, color: colors.macro.protein },
        { key: 'carbs', label: 'Carbs', a: data?.carbsActual ?? 0, t: data?.carbsTarget ?? null, color: colors.macro.carbs },
        { key: 'fat', label: 'Fat', a: data?.fatActual ?? 0, t: data?.fatTarget ?? null, color: colors.macro.fat },
    ];

    return (
        <View style={[st.card, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
            <View style={st.head}>
                <Text style={[typography.caption, { color: colors.text.secondary, letterSpacing: 1, textTransform: 'uppercase', fontSize: 11 }]}>Today's macros</Text>
                <Text style={[st.kcal, { color: colors.text.primary }]}>
                    {kcalA}
                    <Text style={{ color: colors.text.secondary, fontSize: 13 }}>{kcalT ? ` / ${kcalT}` : ''} kcal</Text>
                </Text>
            </View>
            <View style={st.row}>
                {macros.map((m) => {
                    const pct = m.t ? Math.min(100, Math.round((m.a / m.t) * 100)) : 0;
                    return (
                        <View key={m.key} style={{ flex: 1 }}>
                            <View style={st.barTop}>
                                <Text style={[st.mLabel, { color: colors.text.secondary }]}>{m.label}</Text>
                                <Text style={[st.mVal, { color: colors.text.primary }]}>{Math.round(m.a)}{m.t ? `/${m.t}` : ''}g</Text>
                            </View>
                            <View style={[st.track, { backgroundColor: colors.background.tertiary }]}>
                                <View style={[st.fill, { width: `${pct}%`, backgroundColor: m.color }]} />
                            </View>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

const st = StyleSheet.create({
    card: { borderRadius: 16, borderWidth: 1, padding: 14 },
    head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
    kcal: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
    row: { flexDirection: 'row', gap: 12 },
    barTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 },
    mLabel: { fontSize: 11.5 },
    mVal: { fontSize: 11.5, fontWeight: '600' },
    track: { height: 6, borderRadius: 3, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 3 },
});
