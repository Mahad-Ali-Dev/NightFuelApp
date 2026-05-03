import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '@/theme';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getStudents } from '@/api/users';
import { useRouter } from 'expo-router';

export default function CoachDashboardScreen() {
    const { colors, typography, spacing, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { data: studentsResponse, isLoading } = useQuery({
        queryKey: ['coach-students'],
        queryFn: getStudents,
    });

    const students = Array.isArray(studentsResponse?.data) ? studentsResponse.data : [];

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 20 }]}>Coach Dashboard</Text>
                <TouchableOpacity style={styles.chatIcon}>
                    <Ionicons name="notifications-outline" size={24} color={colors.text.primary} />
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.accent.purple} size="large" />
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                    {/* Global KPI */}
                    <Card style={[styles.kpiCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Text style={[typography.subhead, { color: colors.text.secondary }]}>TOTAL ACTIVE STUDENTS</Text>
                        <Text style={[typography.display, { color: colors.text.primary, fontSize: 32 }]}>{students.length}</Text>
                        <Text style={[typography.caption, { color: colors.accent.cyan, marginTop: 4 }]}>Growing steady</Text>
                    </Card>

                    <Text style={[typography.heading, { color: colors.text.primary, marginVertical: spacing.lg }]}>Your Roster</Text>

                    {students.length === 0 ? (
                        <View style={{ alignItems: 'center', marginTop: 40 }}>
                            <Ionicons name="people-outline" size={48} color={colors.text.tertiary} />
                            <Text style={[typography.subhead, { color: colors.text.secondary, marginTop: 16 }]}>You have no students yet.</Text>
                        </View>
                    ) : (
                        students.map((student: any, idx) => (
                            <TouchableOpacity
                                key={student.id || idx}
                                activeOpacity={0.8}
                                onPress={() => router.push(`/messages/${student.id}` as any)}
                            >
                                <Card style={[styles.clientRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                                    <View style={[styles.avatar, { backgroundColor: `${colors.accent.purple}20` }]}>
                                        <Text style={[typography.subhead, { color: colors.accent.purple, fontWeight: 'bold' }]}>
                                            {(student.name || 'U')[0].toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={styles.clientInfo}>
                                        <Text style={[typography.subhead, { color: colors.text.primary }]}>{student.name || 'Unknown Student'}</Text>
                                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>{student.email || 'No email'}</Text>
                                    </View>
                                    <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.accent.purple} />
                                </Card>
                            </TouchableOpacity>
                        ))
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
    chatIcon: { padding: 4 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    kpiCard: { padding: 16, marginBottom: 24, borderWidth: 1 },
    clientRow: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12, borderWidth: 1 },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    clientInfo: { flex: 1 },
});
