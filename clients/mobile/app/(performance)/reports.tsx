import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, Dimensions, FlatList
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPerformanceReports, generateWeeklyAudit, PerformanceReport } from '@/api/progress';

const { width } = Dimensions.get('window');

export default function AIReportsScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [selectedId, setSelectedId] = useState<string | null>(null);

    const { data: reports = [], isLoading } = useQuery({
        queryKey: ['performance-reports'],
        queryFn: getPerformanceReports,
    });

    const generateMutation = useMutation({
        mutationFn: generateWeeklyAudit,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['performance-reports'] });
            Alert.alert('Success', 'New weekly audit generated!');
        },
        onError: () => Alert.alert('Error', 'Failed to generate audit. Try again later.'),
    });

    const activeReport = reports.find(r => r.id === selectedId) || reports[0];

    // If no report selected yet but we have data, set first one
    if (!selectedId && reports.length > 0 && reports[0]) {
        setSelectedId(reports[0].id);
    }

    if (isLoading) {
        return (
            <View style={[styles.centered, { backgroundColor: colors.background.primary }]}>
                <ActivityIndicator color={colors.accent.purple} size="large" />
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>AI Performance Reports</Text>
                <TouchableOpacity onPress={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                    {generateMutation.isPending ? (
                        <ActivityIndicator color={colors.accent.purple} size="small" />
                    ) : (
                        <Ionicons name="sparkles" size={24} color={colors.accent.purple} />
                    )}
                </TouchableOpacity>
            </View>

            {reports.length === 0 ? (
                <View style={styles.emptyState}>
                    <Ionicons name="analytics" size={64} color={colors.text.tertiary} />
                    <Text style={[typography.heading, { color: colors.text.primary, marginTop: 20 }]}>No Reports Yet</Text>
                    <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 10, paddingHorizontal: 40 }]}>
                        Generate your first AI performance audit to get deep insights on your adherence and progress.
                    </Text>
                    <TouchableOpacity
                        style={[styles.generateBtn, { backgroundColor: colors.accent.purple, borderRadius: borderRadius.xl, marginTop: 30 }]}
                        onPress={() => generateMutation.mutate()}
                        disabled={generateMutation.isPending}
                    >
                        <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>Generate First Audit</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    {/* Horizontal History Tabs */}
                    <View style={{ height: 80, borderBottomWidth: 1, borderBottomColor: colors.border.default }}>
                        <FlatList
                            horizontal
                            data={reports}
                            keyExtractor={item => item.id}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 20, alignItems: 'center' }}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    onPress={() => setSelectedId(item.id)}
                                    style={[
                                        styles.historyTab,
                                        {
                                            backgroundColor: selectedId === item.id ? colors.accent.purple + '20' : colors.background.secondary,
                                            borderColor: selectedId === item.id ? colors.accent.purple : colors.border.default,
                                            borderRadius: borderRadius.lg
                                        }
                                    ]}
                                >
                                    <Text style={[typography.caption, { color: selectedId === item.id ? colors.accent.purple : colors.text.secondary }]}>
                                        {item.weekRange}
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 10 }]}>
                                        {new Date(item.date).toLocaleDateString()}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        />
                    </View>

                    {activeReport && (
                        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
                            {/* Score Banner */}
                            <View style={[styles.scoreCard, { backgroundColor: colors.background.secondary, borderRadius: borderRadius["2xl"], borderColor: colors.border.default }]}>
                                <View>
                                    <Text style={[typography.caption, { color: colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 1 }]}>Weekly Performance</Text>
                                    <Text style={[typography.heading, { color: colors.text.primary, fontSize: 24, marginTop: 4 }]}>{activeReport.weekRange}</Text>
                                </View>
                                <View style={[styles.scoreBadge, { backgroundColor: activeReport.score >= 80 ? '#10b98120' : activeReport.score >= 60 ? '#f59e0b20' : '#ef444420' }]}>
                                    <Text style={[styles.scoreText, { color: activeReport.score >= 80 ? '#10b981' : activeReport.score >= 60 ? '#f59e0b' : '#ef4444' }]}>
                                        {activeReport.score}
                                    </Text>
                                </View>
                            </View>

                            {/* Summary */}
                            <View style={[styles.section, { backgroundColor: colors.accent.purple + '08', borderColor: colors.accent.purple + '20', borderRadius: borderRadius.xl }]}>
                                <Text style={[typography.body, { color: colors.text.primary, lineHeight: 22, fontStyle: 'italic' }]}>
                                    "{activeReport.summary}"
                                </Text>
                            </View>

                            {/* Highlights */}
                            <View style={styles.sectionTitleRow}>
                                <Ionicons name="trending-up" size={18} color="#10b981" />
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700', marginLeft: 8 }]}>Highlights</Text>
                            </View>
                            {activeReport.highlights.map((h, i) => (
                                <View key={i} style={styles.bulletItem}>
                                    <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                                    <Text style={[typography.body, { color: colors.text.secondary, marginLeft: 10, flex: 1 }]}>{h}</Text>
                                </View>
                            ))}

                            {/* Improvements */}
                            <View style={[styles.sectionTitleRow, { marginTop: 24 }]}>
                                <Ionicons name="alert-circle" size={18} color="#f59e0b" />
                                <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700', marginLeft: 8 }]}>Areas to Improve</Text>
                            </View>
                            {activeReport.improvements.map((imp, i) => (
                                <View key={i} style={styles.bulletItem}>
                                    <Ionicons name="flash" size={16} color="#f59e0b" />
                                    <Text style={[typography.body, { color: colors.text.secondary, marginLeft: 10, flex: 1 }]}>{imp}</Text>
                                </View>
                            ))}

                            {/* Focus Area */}
                            <View style={[styles.focusCard, { backgroundColor: colors.accent.cyan + '10', borderColor: colors.accent.cyan + '30', borderRadius: borderRadius.xl, marginTop: 30 }]}>
                                <Text style={[typography.subhead, { color: colors.accent.cyan, fontWeight: '800', marginBottom: 8 }]}>Next Week's Focus</Text>
                                <Text style={[typography.body, { color: colors.text.primary }]}>{activeReport.focusArea}</Text>
                            </View>
                        </ScrollView>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    generateBtn: { paddingVertical: 14, paddingHorizontal: 30, elevation: 2 },
    historyTab: { paddingHorizontal: 16, paddingVertical: 10, marginRight: 10, borderWidth: 1, alignItems: 'center', minWidth: 100 },
    scoreCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, marginBottom: 20, borderWidth: 1 },
    scoreBadge: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
    scoreText: { fontSize: 22, fontWeight: '900' },
    section: { padding: 20, marginBottom: 24, borderWidth: 1 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    bulletItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    focusCard: { padding: 20, borderWidth: 1 },
});
