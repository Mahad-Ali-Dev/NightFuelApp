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
 * Patterns mirror app/(settings)/notification-preferences.tsx (header, overline
 * SectionHeader, staggered FadeInDown entrances, inline GlassCard status surface,
 * react-query mutations, red-tinted/separated Danger Zone) and the Log Out
 * confirmation recipe in app/(settings)/index.tsx.
 *
 * 60/30/10: the deep OLED bg + dark-glass surfaces carry the screen; lime is
 * reserved for the ONE primary action (Export my data) — every other accent is
 * functional (calm purple for the trust banner, red for the destructive zone).
 */
import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
    Share, Alert,
} from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
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

// What the export contains — surfaced as legible chips so the value (the scope
// of the data) dominates the label, rather than burying it in prose.
const EXPORT_INCLUDES = ['Profile', 'Workouts', 'Nutrition', 'Settings'] as const;

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

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + spacing['4xl'] }}
            >
                {/* ── Trust banner ─────────────────────────────────────────────
                    Calm purple (the "AI + calm" hue), lock glyph: sets the
                    GDPR/ownership tone before the controls. Not lime — lime is
                    reserved for the one primary action below. */}
                <Animated.View entering={FadeInDown.duration(360).springify().damping(18)}>
                    <View
                        style={[
                            styles.trustBanner,
                            {
                                backgroundColor: withAlpha(colors.accent.purple, 0.1),
                                borderColor: withAlpha(colors.accent.purple, 0.25),
                            },
                        ]}
                        accessible
                        accessibilityRole="summary"
                        accessibilityLabel="Your data is yours. Under GDPR you can export a full copy at any time, or permanently delete your account."
                    >
                        <View style={[styles.trustIcon, { backgroundColor: withAlpha(colors.accent.purple, 0.16) }]}>
                            <Ionicons name="lock-closed-outline" size={20} color={colors.accent.purpleLight} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}>
                                Your data is yours
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 3, lineHeight: 18 }]}>
                                Under GDPR you can export a full copy at any time, or permanently delete
                                your account. We never sell your data.
                            </Text>
                        </View>
                    </View>
                </Animated.View>

                {/* ── Export my data ───────────────────────────────────────── */}
                <Animated.View entering={FadeInDown.delay(80).duration(360).springify().damping(18)}>
                    <SectionHeader
                        label="Your data"
                        icon="server-outline"
                        tag="GDPR"
                        colors={colors}
                        typography={typography}
                    />
                    <GlassCard radius={br.lg} style={styles.card}>
                        <View style={styles.cardBody}>
                            <View style={styles.cardHeadRow}>
                                <View style={[styles.cardIconBox, { backgroundColor: withAlpha(colors.accent.cyan, 0.12) }]}>
                                    <Ionicons name="download-outline" size={20} color={colors.accent.cyan} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[typography.subhead, styles.cardTitle, { color: colors.text.primary }]}>
                                        Export my data
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 1 }]}>
                                        JSON file · ready to share
                                    </Text>
                                </View>
                            </View>

                            <Text style={[typography.caption, { color: colors.text.secondary, lineHeight: 18, marginTop: spacing.md }]}>
                                Download a copy of your Zeitra account data as a JSON file. We&apos;ll prepare
                                it and open the share sheet so you can save or send it.
                            </Text>

                            {/* Value-forward "what's included" chips — the scope of
                                the export reads at a glance instead of as prose. */}
                            <View style={styles.chipRow}>
                                {EXPORT_INCLUDES.map((label) => (
                                    <View
                                        key={label}
                                        style={[styles.chip, { backgroundColor: withAlpha(colors.accent.cyan, 0.1), borderColor: withAlpha(colors.accent.cyan, 0.22) }]}
                                    >
                                        <Text style={[typography.caption, styles.chipText, { color: colors.accent.cyan }]}>
                                            {label}
                                        </Text>
                                    </View>
                                ))}
                            </View>

                            {exportStatus === 'success' ? (
                                <Animated.View entering={FadeIn.duration(220)}>
                                    <View
                                        style={[styles.statusContent, { backgroundColor: withAlpha(colors.accent.emerald, 0.1), borderColor: withAlpha(colors.accent.emerald, 0.25) }]}
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
                                </Animated.View>
                            ) : null}

                            {exportStatus === 'error' ? (
                                <Animated.View entering={FadeIn.duration(220)}>
                                    <View
                                        style={[styles.statusContent, { backgroundColor: withAlpha(colors.accent.red, 0.1), borderColor: withAlpha(colors.accent.red, 0.25) }]}
                                        accessible
                                        accessibilityRole="alert"
                                        accessibilityLiveRegion="polite"
                                        accessibilityLabel="Export failed. Please try again."
                                        testID="export-status-error"
                                    >
                                        <Ionicons name="alert-circle" size={18} color={colors.accent.red} />
                                        <Text style={[typography.caption, styles.statusText, { color: colors.text.primary }]}>
                                            Export failed. Please try again.
                                        </Text>
                                    </View>
                                </Animated.View>
                            ) : null}

                            {/* The screen's ONE primary action — ink-on-lime CTA. */}
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
                </Animated.View>

                {/* ── Danger Zone — destructive controls, visually separated and
                    red-tinted so they never read as a normal section. ───────── */}
                <Animated.View entering={FadeInDown.delay(160).duration(360).springify().damping(18)}>
                    <SectionHeader
                        label="Danger Zone"
                        icon="warning-outline"
                        tone={colors.accent.red}
                        colors={colors}
                        typography={typography}
                    />
                    <GlassCard
                        radius={br.lg}
                        style={[styles.card, { borderColor: withAlpha(colors.accent.red, 0.3) }]}
                        glow={colors.accent.red}
                    >
                        <View style={styles.cardBody}>
                            <View style={styles.cardHeadRow}>
                                <View style={[styles.cardIconBox, { backgroundColor: withAlpha(colors.accent.red, 0.12) }]}>
                                    <Ionicons name="trash-outline" size={20} color={colors.accent.red} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[typography.subhead, styles.cardTitle, { color: colors.accent.red }]}>
                                        Delete account
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 1 }]}>
                                        Permanent · cannot be undone
                                    </Text>
                                </View>
                            </View>

                            <Text style={[typography.caption, { color: colors.text.secondary, lineHeight: 18, marginTop: spacing.md }]}>
                                This permanently deletes your account and all of your data. This action is
                                irreversible — there is no way to recover your account afterwards.
                            </Text>

                            <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
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
                                        borderColor: colors.accent.red,
                                        backgroundColor: withAlpha(colors.accent.red, pressed ? 0.2 : 0.12),
                                        opacity: !deleteArmed || deleteMutation.isPending ? 0.5 : 1,
                                        transform: [{ scale: pressed && deleteArmed && !deleteMutation.isPending ? 0.97 : 1 }],
                                    },
                                ]}
                            >
                                <Ionicons name="trash-outline" size={17} color={colors.accent.red} />
                                <Text style={[typography.subhead, { color: colors.accent.red, fontWeight: '800', marginLeft: 8 }]}>
                                    {deleteMutation.isPending ? 'Deleting…' : 'Delete account'}
                                </Text>
                            </Pressable>
                        </View>
                    </GlassCard>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Grouped-section overline header: quiet leading glyph + overline label, with an
// optional trailing tag pill (e.g. "GDPR") as a calm detail. When `tone` is
// passed (Danger Zone) the glyph + label adopt that hue so the destructive
// section reads as red before the user reaches its card.
function SectionHeader({ label, icon, tag, tone, colors, typography }: any) {
    const headerColor = tone ?? colors.text.secondary;
    return (
        <View
            style={styles.sectionHeader}
            accessibilityRole="header"
            accessibilityLabel={tag ? `${label}, ${tag}` : label}
        >
            <Ionicons name={icon} size={14} color={headerColor} />
            <Text style={[typography.overline, { color: headerColor, marginLeft: 6 }]}>
                {label}
            </Text>
            <View style={{ flex: 1 }} />
            {tag ? (
                <View style={[styles.tagPill, { backgroundColor: withAlpha(colors.text.tertiary, 0.12) }]}>
                    <Text style={[typography.caption, styles.tagText, { color: colors.text.tertiary }]}>
                        {tag}
                    </Text>
                </View>
            ) : null}
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
    // Trust banner — calm purple notice that opens the screen.
    trustBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        marginHorizontal: spacing.xl,
        marginTop: spacing.lg,
        padding: spacing.lg,
        borderRadius: br.lg,
        borderWidth: 1,
    },
    trustIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Grouped-section header (leading glyph + overline label + optional tag).
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
        paddingTop: spacing['2xl'],
        paddingBottom: spacing.sm,
    },
    tagPill: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        borderRadius: br.full,
    },
    tagText: {
        fontWeight: '700',
        fontSize: 10,
        letterSpacing: 0.5,
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
        gap: spacing.md,
    },
    cardIconBox: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        fontWeight: '700',
    },
    // "What's included" chips for the export scope.
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginTop: spacing.lg,
    },
    chip: {
        paddingHorizontal: spacing.md,
        paddingVertical: 5,
        borderRadius: br.full,
        borderWidth: 1,
    },
    chipText: {
        fontWeight: '700',
        fontSize: 11,
        letterSpacing: 0.2,
    },
    statusContent: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: spacing.lg,
        padding: spacing.md,
        borderRadius: br.md,
        borderWidth: 1,
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
