/**
 * Privacy & Data — GDPR data-export + account-deletion surface.
 *
 * Wires the two previously-clientless backends (F36 DELETE /v1/users/me,
 * F37 GET /v1/users/me/export) into the app. The privacy/terms/support copy and
 * the Premium tier's "Export Data" promise both reference these, and Apple
 * (App Store Review 5.1.1(v)) + Google Play REQUIRE an in-app account-deletion
 * path — this screen is that path.
 *
 *   - Export my data → exportMyData() → writes the returned JSON to a file in
 *     the app document/cache dir, then opens the OS share sheet (React Native's
 *     core `Share`) so the user keeps a copy. No new native dependency.
 *   - Delete account → a DESTRUCTIVE, typed-confirmation flow. The CTA is
 *     disabled until the user types DELETE exactly, then deleteAccount() runs;
 *     on success we invalidate react-query, clear the secure-store session via
 *     authStore.logout(), and replace to the auth stack. It is permanent and
 *     irreversible, and the copy says so.
 *
 * Patterns mirror app/(settings)/notification-preferences.tsx (header, inline
 * GlassCard status surface, react-query mutations) and the Log Out confirmation
 * recipe in app/(settings)/index.tsx.
 */
import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
    Share, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import { withAlpha } from '@/theme/utils';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { GlassCard, CtaButton, Input } from '@/components/ui';
import { exportMyData, deleteAccount } from '@/api/users';
import { useAuthStore } from '@/store/authStore';

// The exact word the user must type to arm the destructive delete CTA.
const DELETE_CONFIRM_WORD = 'DELETE';

/**
 * Write the export payload to a file and open the OS share sheet so the user
 * keeps a copy. Returns the file URI on success. Falls back to sharing the raw
 * JSON string if the document/cache dir is unavailable (e.g. restricted env).
 */
async function shareExport(payload: unknown): Promise<void> {
    const json = JSON.stringify(payload, null, 2);
    const dir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory;

    if (dir) {
        const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const fileUri = `${dir}zeitra-data-export-${stamp}.json`;
        await FileSystem.writeAsStringAsync(fileUri, json);
        // `url` is honored by the iOS share sheet for file attachments; Android
        // surfaces the text. We pass both so the user always gets the data.
        await Share.share({
            url: fileUri,
            message: json,
            title: 'Zeitra data export',
        });
        return;
    }

    // No writable dir — share the JSON inline rather than failing the flow.
    await Share.share({ message: json, title: 'Zeitra data export' });
}

export default function PrivacyDataScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    // Typed-confirmation gate for the destructive delete. The CTA stays disabled
    // until this matches DELETE_CONFIRM_WORD exactly.
    const [confirmText, setConfirmText] = useState('');
    const deleteArmed = confirmText.trim().toUpperCase() === DELETE_CONFIRM_WORD;

    // Inline status for the export flow (mirrors notification-preferences.tsx).
    const [exportStatus, setExportStatus] = useState<null | 'success' | 'error'>(null);

    const exportMutation = useMutation({
        mutationFn: exportMyData,
        onMutate: () => setExportStatus(null),
        onSuccess: async (res: any) => {
            // axios responses carry the payload on `.data`; tolerate a bare body too.
            await shareExport(res?.data ?? res);
            setExportStatus('success');
        },
        onError: () => setExportStatus('error'),
    });

    const deleteMutation = useMutation({
        mutationFn: deleteAccount,
        onSuccess: async () => {
            // Account is gone server-side: drop every cached query, clear the
            // secure-store session, and bounce to the auth stack.
            queryClient.clear();
            await useAuthStore.getState().logout();
            router.replace('/(auth)/login');
        },
        onError: () => {
            Alert.alert(
                'Couldn\'t delete account',
                'Something went wrong deleting your account. Please check your connection and try again.',
            );
        },
    });

    const handleExport = () => {
        setExportStatus(null);
        exportMutation.mutate();
    };

    // Final confirmation before the irreversible call — even with DELETE typed,
    // we surface one explicit "this is permanent" prompt (the textbook
    // destructive-Alert use, same recipe as Log Out).
    const handleDelete = () => {
        if (!deleteArmed || deleteMutation.isPending) return;
        Alert.alert(
            'Delete account permanently?',
            'This permanently deletes your Zeitra account and all of your data. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteMutation.mutate(),
                },
            ],
            { cancelable: true },
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
            <StatusBar style="light" />

            {/* Header (mirrors notification-preferences.tsx) */}
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
                    Privacy & Data
                </Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {/* ── Export my data ───────────────────────────────────────── */}
                <Text style={[styles.sectionLabel, { color: colors.text.secondary }]}>YOUR DATA</Text>
                <GlassCard radius={br.lg} style={styles.card}>
                    <View style={styles.cardBody}>
                        <View style={styles.cardHeadRow}>
                            <Ionicons name="download-outline" size={20} color={colors.accent.cyan} />
                            <Text style={[typography.subhead, styles.cardTitle, { color: colors.text.primary }]}>
                                Export my data
                            </Text>
                        </View>
                        <Text style={[typography.caption, { color: colors.text.secondary, lineHeight: 18 }]}>
                            Download a copy of your Zeitra account data as a JSON file. We&apos;ll prepare
                            it and open the share sheet so you can save or send it.
                        </Text>

                        {exportStatus === 'success' ? (
                            <View
                                style={styles.statusContent}
                                accessible
                                accessibilityRole="alert"
                                accessibilityLiveRegion="polite"
                                accessibilityLabel="Your data export is ready to share."
                                testID="export-status-success"
                            >
                                <Ionicons name="checkmark-circle" size={18} color={colors.accent.emerald} />
                                <Text style={[typography.caption, styles.statusText, { color: colors.text.primary }]}>
                                    Your data export is ready to share.
                                </Text>
                            </View>
                        ) : null}

                        {exportStatus === 'error' ? (
                            <View
                                style={styles.statusContent}
                                accessible
                                accessibilityRole="alert"
                                accessibilityLiveRegion="polite"
                                accessibilityLabel="Export failed. Please try again."
                                testID="export-status-error"
                            >
                                <Ionicons name="alert-circle" size={18} color={colors.accent.coral} />
                                <Text style={[typography.caption, styles.statusText, { color: colors.text.primary }]}>
                                    Export failed. Please try again.
                                </Text>
                            </View>
                        ) : null}

                        <CtaButton
                            label="Export my data"
                            icon="download-outline"
                            onPress={handleExport}
                            loading={exportMutation.isPending}
                            accessibilityLabel="Export my data"
                            testID="export-cta"
                            style={{ marginTop: spacing.lg }}
                        />
                    </View>
                </GlassCard>

                {/* ── Delete account ───────────────────────────────────────── */}
                <Text style={[styles.sectionLabel, { color: colors.text.secondary, marginTop: spacing['2xl'] }]}>
                    DANGER ZONE
                </Text>
                <GlassCard
                    radius={br.lg}
                    style={styles.card}
                    glow={colors.accent.coral}
                >
                    <View style={styles.cardBody}>
                        <View style={styles.cardHeadRow}>
                            <Ionicons name="trash-outline" size={20} color={colors.accent.coral} />
                            <Text style={[typography.subhead, styles.cardTitle, { color: colors.accent.coral }]}>
                                Delete account
                            </Text>
                        </View>
                        <Text style={[typography.caption, { color: colors.text.secondary, lineHeight: 18 }]}>
                            This permanently deletes your account and all of your data. This action is
                            irreversible — there is no way to recover your account afterwards.
                        </Text>

                        <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.lg }]}>
                            Type <Text style={{ color: colors.text.primary, fontWeight: '800' }}>DELETE</Text> to confirm.
                        </Text>
                        <Input
                            value={confirmText}
                            onChangeText={setConfirmText}
                            placeholder="DELETE"
                            autoCapitalize="characters"
                            autoCorrect={false}
                            accessibilityLabel="Type DELETE to confirm account deletion"
                            testID="delete-confirm-input"
                        />

                        <Pressable
                            onPress={handleDelete}
                            disabled={!deleteArmed || deleteMutation.isPending}
                            accessibilityRole="button"
                            accessibilityLabel="Delete account"
                            accessibilityState={{
                                disabled: !deleteArmed || deleteMutation.isPending,
                                busy: deleteMutation.isPending,
                            }}
                            testID="delete-cta"
                            style={({ pressed }) => [
                                styles.deleteBtn,
                                {
                                    borderColor: colors.accent.coral,
                                    backgroundColor: withAlpha(colors.accent.coral, pressed ? 0.18 : 0.1),
                                    opacity: !deleteArmed || deleteMutation.isPending ? 0.5 : 1,
                                },
                            ]}
                        >
                            <Ionicons name="trash-outline" size={17} color={colors.accent.coral} />
                            <Text style={[typography.subhead, { color: colors.accent.coral, fontWeight: '800', marginLeft: 8 }]}>
                                {deleteMutation.isPending ? 'Deleting…' : 'Delete account'}
                            </Text>
                        </Pressable>
                    </View>
                </GlassCard>
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
    sectionLabel: {
        fontWeight: 'bold',
        letterSpacing: 1,
        fontSize: 11,
        paddingHorizontal: spacing.xl,
        paddingTop: spacing['2xl'],
        paddingBottom: spacing.sm,
    },
    card: {
        marginHorizontal: spacing.xl,
    },
    cardBody: {
        padding: spacing.lg,
    },
    cardHeadRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    cardTitle: {
        fontWeight: '700',
        marginLeft: spacing.sm,
    },
    statusContent: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: spacing.lg,
    },
    statusText: {
        flex: 1,
        marginLeft: spacing.sm,
        fontWeight: '600',
        lineHeight: 18,
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.lg,
        minHeight: 48,
        borderWidth: 1,
        borderRadius: br.lg,
        paddingVertical: 13,
    },
});
