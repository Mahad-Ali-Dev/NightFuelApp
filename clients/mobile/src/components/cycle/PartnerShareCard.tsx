import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Alert, Share, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/theme';
import { useCycleAccents } from '@/theme/useCycleAccents';
import { GlassCard, CtaButton, Skeleton } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { getCycleShare, createCycleShare, revokeCycleShare } from '@/api/cycle';

/**
 * PartnerShareCard — the "Share with partner" section of the cycle screen.
 *
 * The user GENERATES a long, opaque, REVOCABLE code and hands it to a partner, who
 * opens the read-only viewer (app/(performance)/cycle-viewer) to see a SANITIZED
 * summary (current phase + next-period / fertile-window PREDICTIONS only). The
 * partner never sees the raw symptom / activity / notes logs — that stripping is
 * enforced server-side by the allow-list resolver; this card only surfaces the
 * code + the generate / copy / share / revoke actions.
 *
 * Sharing is ALWAYS user-initiated: nothing is shared until the user taps
 * "Create share code" and hands the code over. Generation is idempotent server-
 * side (re-tapping returns the same active code), and revoking kills it instantly.
 */
export function PartnerShareCard() {
    const { colors, typography, borderRadius } = useTheme();
    const { coral: CORAL } = useCycleAccents();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [copied, setCopied] = useState(false);

    const shareQuery = useQuery({ queryKey: ['cycle-share'], queryFn: getCycleShare });
    const share = shareQuery.data?.share ?? null;

    const createM = useMutation({
        mutationFn: () => createCycleShare(),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cycle-share'] }),
        onError: (err: any) =>
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Could not create a share code'),
    });

    const revokeM = useMutation({
        mutationFn: () => revokeCycleShare(),
        onSuccess: () => {
            setCopied(false);
            queryClient.invalidateQueries({ queryKey: ['cycle-share'] });
        },
        onError: (err: any) =>
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Could not revoke the code'),
    });

    const onCopy = useCallback(async (code: string) => {
        try {
            await Clipboard.setStringAsync(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            Alert.alert('Copy failed', 'Could not copy the code. Long-press the code to copy it instead.');
        }
    }, []);

    const onShare = useCallback(async (code: string) => {
        try {
            await Share.share({
                message:
                    `I'm sharing a read-only view of my Zeitra cycle with you.\n\n` +
                    `In the Zeitra app, open Profile → "View a partner's cycle" and enter this code:\n\n` +
                    `${code}\n\n` +
                    `You'll see my current phase and predictions only — and I can revoke it anytime.`,
            });
        } catch {
            /* user dismissed the share sheet — no-op */
        }
    }, []);

    const onRevoke = useCallback(() => {
        Alert.alert(
            'Revoke share code?',
            'Your partner will immediately lose access. You can generate a new code afterward if you want to share again.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Revoke', style: 'destructive', onPress: () => revokeM.mutate() },
            ],
        );
    }, [revokeM]);

    return (
        <GlassCard radius={borderRadius['2xl']} style={styles.card}>
            <View style={styles.inner}>
                <View style={styles.header}>
                    <Ionicons name="heart-circle-outline" size={18} color={CORAL} />
                    <Text style={[typography.overline, styles.headerLabel, { color: colors.text.secondary }]}>
                        SHARE WITH PARTNER
                    </Text>
                </View>

                <Text style={[typography.bodySm, styles.blurb, { color: colors.text.secondary }]}>
                    Give a partner a read-only view of your cycle status and predictions. They never see your
                    symptom, activity, or notes logs — and you can revoke access anytime.
                </Text>

                {shareQuery.isLoading ? (
                    <Skeleton height={96} radius={16} />
                ) : share ? (
                    <>
                        {/* The opaque code. `selectable` gives a native long-press copy
                            as a universal fallback even if the Copy button ever fails. */}
                        <View
                            style={[
                                styles.codeBox,
                                { borderColor: withAlpha(CORAL, 0.4), backgroundColor: withAlpha(CORAL, 0.08) },
                            ]}
                        >
                            <Text
                                selectable
                                accessibilityLabel={`Share code ${share.code}`}
                                style={[typography.body, styles.codeText, { color: colors.text.primary }]}
                            >
                                {share.code}
                            </Text>
                        </View>

                        <View style={styles.actionsRow}>
                            <CoralAction
                                icon={copied ? 'checkmark' : 'copy-outline'}
                                label={copied ? 'Copied' : 'Copy'}
                                color={CORAL}
                                onPress={() => onCopy(share.code)}
                            />
                            <CoralAction
                                icon="share-social-outline"
                                label="Share"
                                color={CORAL}
                                onPress={() => onShare(share.code)}
                            />
                        </View>

                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Preview what your partner sees"
                            onPress={() =>
                                router.push(
                                    `/(performance)/cycle-viewer?code=${encodeURIComponent(share.code)}` as never,
                                )
                            }
                            style={({ pressed }) => [styles.previewRow, pressed && { opacity: 0.6 }]}
                        >
                            <Ionicons name="eye-outline" size={15} color={colors.text.tertiary} />
                            <Text style={[typography.caption, styles.previewText, { color: colors.text.tertiary }]}>
                                Preview what your partner sees
                            </Text>
                        </Pressable>

                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Revoke share code"
                            disabled={revokeM.isPending}
                            onPress={onRevoke}
                            style={({ pressed }) => [styles.revokeRow, pressed && { opacity: 0.6 }]}
                        >
                            <Ionicons name="close-circle-outline" size={16} color={colors.error} />
                            <Text style={[typography.bodySm, styles.revokeText, { color: colors.error }]}>
                                {revokeM.isPending ? 'Revoking…' : 'Revoke access'}
                            </Text>
                        </Pressable>
                    </>
                ) : (
                    <CtaButton
                        label={createM.isPending ? 'Generating…' : 'Create share code'}
                        icon="heart-circle-outline"
                        onPress={() => {
                            if (!createM.isPending) createM.mutate();
                        }}
                        loading={createM.isPending}
                        disabled={createM.isPending}
                        accessibilityLabel="Create a partner share code"
                        testID="cycle-share-create"
                        style={styles.cta}
                    />
                )}
            </View>
        </GlassCard>
    );
}

/** A coral-tinted secondary action pill (Copy / Share). */
function CoralAction({
    icon,
    label,
    color,
    onPress,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    color: string;
    onPress: () => void;
}) {
    const { typography } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            style={({ pressed }) => [
                styles.coralAction,
                { backgroundColor: withAlpha(color, 0.14), borderColor: withAlpha(color, 0.4) },
                pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
            ]}
        >
            <Ionicons name={icon} size={16} color={color} />
            <Text style={[typography.subtitle, styles.coralActionLabel, { color }]}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: { marginTop: 12 },
    inner: { padding: 18 },
    header: { flexDirection: 'row', alignItems: 'center' },
    headerLabel: { marginLeft: 8, letterSpacing: 1 },
    blurb: { marginTop: 12, lineHeight: 19 },
    codeBox: {
        marginTop: 14,
        borderWidth: 1,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    codeText: { letterSpacing: 1, textAlign: 'center', fontWeight: '600' },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    coralAction: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        minHeight: 44,
        paddingVertical: 11,
        borderRadius: 13,
        borderWidth: 1,
    },
    coralActionLabel: { fontWeight: '600' },
    previewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 14,
    },
    previewText: { letterSpacing: 0.3 },
    revokeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 12,
    },
    revokeText: { fontWeight: '600' },
    cta: { marginTop: 14 },
});

export default PartnerShareCard;
