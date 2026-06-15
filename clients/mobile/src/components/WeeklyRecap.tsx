import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';
import { useQuery } from '@tanstack/react-query';
import { getWeeklyStats } from '@/api/progress';
import { withAlpha } from '@/theme/utils';
import { Ionicons } from '@expo/vector-icons';

function StatCard({ label, value, icon, color }: {
  label: string; value: string;
  icon: keyof typeof Ionicons.glyphMap; color: string;
}) {
  const { colors, typography } = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.background.secondary }]}>
      <View style={[styles.iconWrap, { backgroundColor: withAlpha(color, 0.15) }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20, marginTop: 8 }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

export function WeeklyRecap() {
  const { colors, typography } = useTheme();

  const { data, isLoading } = useQuery({
    queryKey: ['weekly-stats'],
    queryFn: getWeeklyStats,
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <View style={[styles.placeholder, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
        <Ionicons name="stats-chart" size={36} color={colors.text.tertiary} />
        <Text style={[typography.body, { color: colors.text.secondary, marginTop: 8, textAlign: 'center' }]}>
          Log activity to see your weekly recap.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      <StatCard label="Days Logged" value={String(data.daysLogged ?? 0)} icon="calendar" color={colors.accent.coral} />
      <StatCard label="Streak" value={`${data.streakDays ?? 0}d`} icon="flame" color={colors.accent.amber} />
      <StatCard label="Avg Calories" value={`${Math.round(data.avgCalories || 0)}`} icon="restaurant" color={colors.accent.emerald} />
      <StatCard label="Avg Score" value={`${Math.round(data.avgScore || 0)}%`} icon="star" color={colors.accent.cyan} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    flex: 1, minWidth: '45%', padding: 16, borderRadius: 20, alignItems: 'flex-start',
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  placeholder: {
    padding: 40, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
});
