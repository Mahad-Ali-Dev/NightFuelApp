import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, FlatList, Platform } from 'react-native';

import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAll, markRead, Notification } from '@/api/notifications';
import { EmptyState, Skeleton, GlassCard, CtaButton } from '@/components/ui';

// ---------------------------------------------------------------------------
// Date-bucketing — pure presentation logic over the existing `createdAt` field.
// Buckets a notification into Today / Yesterday / Earlier using local-midnight
// math on its timestamp. Deliberately uses ONLY Date arithmetic
// (getTime/getFullYear/…) and NEVER `toLocaleDateString` — the row's visible
// date cell is the sole caller of that formatter (the timestamp-guard test pins
// it to exactly one call per valid row). Malformed/empty timestamps fall into
// 'Earlier' so the row is grouped, never dropped.
// ---------------------------------------------------------------------------
type Bucket = 'Today' | 'Yesterday' | 'Earlier';
const BUCKET_ORDER: Bucket[] = ['Today', 'Yesterday', 'Earlier'];
const BUCKET_ICON: Record<Bucket, keyof typeof Ionicons.glyphMap> = {
    Today: 'today-outline',
    Yesterday: 'time-outline',
    Earlier: 'calendar-outline',
};

function bucketFor(createdAt: string): Bucket {
    const t = createdAt ? new Date(createdAt).getTime() : NaN;
    if (Number.isNaN(t)) return 'Earlier';
    const d = new Date(t);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayMs = 86_400_000;
    if (startOfDay >= startOfToday) return 'Today';
    if (startOfDay >= startOfToday - dayMs) return 'Yesterday';
    return 'Earlier';
}

// A header sentinel interleaved into the FlatList data so date sections render
// inline while the list stays a single <FlatList> (the loading/error/empty/
// populated branch tests assert on FlatList identity + count). Each header
// carries a synthetic id so keyExtractor stays total.
type HeaderItem = { _kind: 'header'; id: string; bucket: Bucket; count: number };
type RowItem = { _kind: 'row'; id: string; notification: Notification; isLast: boolean };
type ListItem = HeaderItem | RowItem;

export default function NotificationsScreen() {
    const { colors, typography, spacing } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    // Holds the id of the row whose mark-read FAILED — genuine error state (the
    // real outcome of the mutation), null = no failure. We surface the failure
    // INLINE (a GlassCard the screen reader announces via role="alert" + a polite
    // live region) instead of an imperative system dialog, matching the
    // inline-notice pattern notification-preferences.tsx already ships. The banner
    // JSX is derived from this; the Retry re-invokes mutate(markReadError.id) — a
    // genuine retry of the failed id, never a fabricated success.
    const [markReadError, setMarkReadError] = useState<{ id: string } | null>(null);

    const { data: notifications, isLoading, isError, refetch } = useQuery({
        queryKey: ['notifications'],
        queryFn: getAll,
    });

    const markReadMutation = useMutation({
        mutationFn: (id: string) => markRead(id),
        onError: (_err, id) => { setMarkReadError({ id }); },
        onSuccess: () => {
            setMarkReadError(null);
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
    });

    // Count of unread rows — drives the lime header pill (a key indicator; the
    // ONE place full-strength lime is earned on this screen).
    const unreadCount = useMemo(
        () => (notifications || []).reduce((n, x) => n + (x.isRead ? 0 : 1), 0),
        [notifications],
    );

    // Flatten the rows into [header, row, row, …, header, row, …] grouped by
    // date bucket, preserving the server order WITHIN each bucket. Built from the
    // existing query data only — no new fetch. Header sentinels let the single
    // FlatList render grouped sections without becoming a SectionList.
    const listData = useMemo<ListItem[]>(() => {
        const rows = notifications || [];
        const groups: Record<Bucket, Notification[]> = { Today: [], Yesterday: [], Earlier: [] };
        for (const n of rows) groups[bucketFor(n.createdAt)].push(n);

        const out: ListItem[] = [];
        for (const bucket of BUCKET_ORDER) {
            const items = groups[bucket];
            if (items.length === 0) continue;
            out.push({ _kind: 'header', id: `hdr-${bucket}`, bucket, count: items.length });
            items.forEach((notification, i) => {
                out.push({
                    _kind: 'row',
                    id: notification.id,
                    notification,
                    isLast: i === items.length - 1,
                });
            });
        }
        return out;
    }, [notifications]);

    const getIconForType = useCallback((type: string) => {
        switch (type) {
            case 'workout': return { name: 'barbell', color: colors.accent.cyan };
            case 'meal': return { name: 'restaurant', color: colors.accent.coral };
            case 'social': return { name: 'people', color: colors.accent.purple };
            case 'system': return { name: 'information-circle', color: colors.accent.amber };
            default: return { name: 'notifications', color: colors.text.secondary };
        }
    }, [colors]);

    // ── Section header row — overline label + count, the grouped-list convention.
    const renderHeader = useCallback((item: HeaderItem, index: number) => (
        <Animated.View
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(360).springify().damping(18)}
            style={styles.sectionHeader}
        >
            <Ionicons name={BUCKET_ICON[item.bucket]} size={13} color={colors.text.tertiary} />
            <Text style={[typography.overline, { color: colors.text.secondary, marginLeft: 6 }]}>
                {item.bucket}
            </Text>
            <View style={styles.sectionHeaderSpacer} />
            <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                {item.count}
            </Text>
        </Animated.View>
    ), [colors, typography]);

    // ── A single notification, rendered as a row inside a per-section glass card.
    // Unread rows earn a faint lime wash + a lime accent rail + the lime dot
    // (the screen's 10% accent / key indicator); read rows stay neutral. The VALUE
    // (title) dominates its body + timestamp via weight + opacity.
    const renderRow = useCallback((item: RowItem, index: number) => {
        const n = item.notification;
        const iconConfig = getIconForType(n.type);
        const unread = !n.isRead;
        return (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(360).springify().damping(18)}>
                <GlassCard
                    radius={br.xl}
                    style={[styles.card, item.isLast ? styles.cardLast : null]}
                >
                    {/* Grouped-list wash inside the glass, above blur, below content. */}
                    <LinearGradient
                        colors={colors.gradients.card}
                        style={StyleSheet.absoluteFillObject}
                        pointerEvents="none"
                    />
                    {unread ? (
                        <LinearGradient
                            colors={[withAlpha(colors.accent.coral, 0.10), 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={StyleSheet.absoluteFillObject}
                            pointerEvents="none"
                        />
                    ) : null}
                    <TouchableOpacity
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`${n.isRead ? '' : 'Unread. '}${n.title}. ${n.body}`}
                        accessibilityState={{ selected: unread }}
                        style={styles.cardInner}
                        onPress={() => !n.isRead && markReadMutation.mutate(n.id)}
                    >
                        {/* Unread accent rail — colour is a redundant cue (the dot + */}
                        {/* weight also signal unread), never the only signal. */}
                        {unread ? (
                            <View style={[styles.rail, { backgroundColor: colors.accent.coral }]} />
                        ) : null}
                        <View style={[styles.iconBox, { backgroundColor: withAlpha(iconConfig.color, 0.14), borderColor: withAlpha(iconConfig.color, 0.28) }]}>
                            <Ionicons name={iconConfig.name as any} size={22} color={iconConfig.color} />
                        </View>
                        <View style={styles.body}>
                            <View style={styles.titleRow}>
                                <Text
                                    style={[typography.subhead, { color: colors.text.primary, fontWeight: unread ? '700' : '500', flex: 1 }]}
                                    numberOfLines={1}
                                >
                                    {n.title}
                                </Text>
                                {unread ? <View style={[styles.unreadDot, { backgroundColor: colors.accent.coral }]} /> : null}
                            </View>
                            <Text style={[typography.body, { color: colors.text.secondary, marginTop: 3 }]} numberOfLines={2}>
                                {n.body}
                            </Text>
                            <Text style={[typography.caption, { color: colors.text.tertiary, marginTop: 8 }]}>
                                {n.createdAt && !isNaN(new Date(n.createdAt).getTime())
                                    ? new Date(n.createdAt).toLocaleDateString()
                                    : ''}
                            </Text>
                        </View>
                    </TouchableOpacity>
                </GlassCard>
            </Animated.View>
        );
    }, [getIconForType, colors, typography, markReadMutation]);

    const renderItem = useCallback(({ item, index }: { item: ListItem; index: number }) => (
        item._kind === 'header' ? renderHeader(item, index) : renderRow(item, index)
    ), [renderHeader, renderRow]);

    const keyExtractor = useCallback((item: ListItem) => item.id, []);

    // Loading placeholder shaped like a real notification row (icon + text lines).
    const renderSkeletonRow = (key: number) => (
        <View key={key} style={[styles.skeletonCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
            <Skeleton width={44} height={44} radius={br.lg} />
            <View style={{ flex: 1, marginLeft: spacing.lg }}>
                <Skeleton width="55%" height={16} radius={br.sm} />
                <Skeleton width="90%" height={14} radius={br.sm} style={{ marginTop: 8 }} />
                <Skeleton width="30%" height={12} radius={br.sm} style={{ marginTop: 10 }} />
            </View>
        </View>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={styles.header}>
                <TouchableOpacity
                    activeOpacity={0.85}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={() => router.back()}
                    style={[styles.backBtn, { backgroundColor: withAlpha(colors.text.primary, 0.06), borderColor: colors.border.default }]}
                >
                    <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
                </TouchableOpacity>
                <View style={styles.headerTitleWrap}>
                    <Text style={[typography.overline, { color: colors.accent.coral }]}>ZEITRA</Text>
                    <Text style={[typography.h1, { color: colors.text.primary }]}>Notifications</Text>
                </View>
                {/* Unread count — the screen's one earned full-lime indicator. */}
                {unreadCount > 0 ? (
                    <View
                        style={[styles.countPill, { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.32) }]}
                        accessibilityRole="text"
                        accessibilityLabel={`${unreadCount} unread`}
                    >
                        <View style={[styles.countDot, { backgroundColor: colors.accent.coral }]} />
                        <Text style={[typography.captionMedium, { color: colors.accent.coral }]} maxFontSizeMultiplier={1.4}>
                            {unreadCount}
                        </Text>
                    </View>
                ) : null}
            </View>

            {isLoading ? (
                <View style={{ paddingTop: spacing.md }}>
                    {[0, 1, 2, 3, 4, 5].map(renderSkeletonRow)}
                </View>
            ) : isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load notifications"
                    subtitle="Something went wrong fetching your notifications. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => refetch()}
                />
            ) : (
                <>
                    {/* Inline mark-read failure surface (replaces the old imperative
                        system dialog on markReadMutation.onError). Rendered with an
                        explicit ternary-null per rules/rendering-no-falsy-and.md — markReadError
                        is { id } | null, never a falsy 0/"" that could leak into the
                        JSX tree. As a GlassCard from @/components/ui (no inline glass),
                        it carries accessibilityRole="alert" + a polite live region on
                        its inner content View so a screen reader announces the failure.
                        The Retry Pressable is a SIBLING (independently focusable) and
                        re-invokes markReadMutation.mutate(markReadError.id) — the
                        genuine retry of the failed id, never a fabricated success.
                        Mirrors notification-preferences.tsx's statusCard recipe. */}
                    {markReadError ? (
                        <GlassCard radius={br.lg} style={styles.statusCard} testID="mark-read-error">
                            <View style={styles.statusRow}>
                                <View
                                    style={styles.statusContent}
                                    accessible
                                    accessibilityRole="alert"
                                    accessibilityLiveRegion="polite"
                                    accessibilityLabel="Couldn't mark as read"
                                >
                                    <Ionicons name="alert-circle" size={20} color={colors.accent.coral} />
                                    <Text style={[typography.subhead, styles.statusText, { color: colors.text.primary }]}>
                                        Couldn't mark as read
                                    </Text>
                                </View>
                                <Pressable
                                    onPress={() => markReadMutation.mutate(markReadError.id)}
                                    disabled={markReadMutation.isPending}
                                    accessibilityRole="button"
                                    accessibilityLabel="Retry"
                                    accessibilityState={{ disabled: markReadMutation.isPending, busy: markReadMutation.isPending }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={({ pressed }) => [
                                        styles.retryBtn,
                                        {
                                            borderColor: withAlpha(colors.accent.coral, 0.4),
                                            backgroundColor: withAlpha(colors.accent.coral, pressed ? 0.16 : 0.08),
                                        },
                                    ]}
                                    testID="mark-read-error-retry"
                                >
                                    <Ionicons name="refresh-outline" size={15} color={colors.accent.coral} />
                                    <Text style={[typography.caption, styles.retryLabel, { color: colors.accent.coral }]}>
                                        Retry
                                    </Text>
                                </Pressable>
                            </View>
                        </GlassCard>
                    ) : null}

                    <FlatList
                        data={listData}
                        keyExtractor={keyExtractor}
                        renderItem={renderItem}
                        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing['7xl'] + insets.bottom, flexGrow: 1 }}
                        showsVerticalScrollIndicator={false}
                        removeClippedSubviews={Platform.OS === 'android'}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={11}
                        ListEmptyComponent={
                            <EmptyState
                                icon="notifications-off-outline"
                                title="No notifications yet"
                                subtitle="You're all caught up. New workout, meal, and coach alerts will show up here."
                            />
                        }
                    />

                    {/* Thumb-zone primary — genuine refetch() of the inbox, pinned in
                        the bottom third over the safe-area inset. */}
                    <View
                        style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
                        pointerEvents="box-none"
                    >
                        <LinearGradient
                            colors={['transparent', colors.background.primary]}
                            style={StyleSheet.absoluteFillObject}
                            pointerEvents="none"
                        />
                        <CtaButton
                            label="Refresh"
                            icon="refresh"
                            onPress={() => refetch()}
                            accessibilityLabel="Refresh notifications"
                        />
                    </View>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.sm,
        paddingBottom: spacing.lg,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: br.full,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitleWrap: { flex: 1, marginLeft: spacing.md },
    countPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        minHeight: 28,
        paddingHorizontal: spacing.md,
        borderRadius: br.full,
        borderWidth: 1,
    },
    countDot: { width: 6, height: 6, borderRadius: 3 },

    // Grouped-section header (icon + overline + trailing count).
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
        paddingHorizontal: spacing.xs,
    },
    sectionHeaderSpacer: { flex: 1 },

    // Notification card (one per row; the GlassCard owns the frosted fill +
    // hairline + radius — the wash gradients sit above its blur).
    card: { marginBottom: spacing.sm },
    cardLast: { marginBottom: spacing.xs },
    cardInner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: spacing.lg,
        paddingLeft: spacing.lg + spacing.xs,
    },
    rail: {
        position: 'absolute',
        left: 0,
        top: spacing.md,
        bottom: spacing.md,
        width: 3,
        borderTopRightRadius: br.sm,
        borderBottomRightRadius: br.sm,
    },
    iconBox: { width: 44, height: 44, borderRadius: br.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, marginLeft: spacing.lg },
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    unreadDot: { width: 8, height: 8, borderRadius: 4, marginLeft: spacing.sm },

    skeletonCard: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: spacing.md,
        marginBottom: spacing.sm,
        padding: spacing.lg,
        borderRadius: br.xl,
        borderWidth: 1,
    },

    // Thumb-zone footer holding the primary Refresh CTA, faded into the bg.
    footer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: spacing.md,
        paddingTop: spacing['2xl'],
    },

    // Inline mark-read failure surface (GlassCard wrapper margins; the GlassCard
    // owns the frosted fill + hairline border + radius). Mirrors the statusCard
    // recipe in notification-preferences.tsx.
    statusCard: {
        marginHorizontal: spacing.md,
        marginTop: spacing.sm,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.lg,
    },
    // The announced alert content (icon + copy). Flexes to fill the row so the
    // trailing Retry sibling sits flush right.
    statusContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusText: {
        flex: 1,
        marginLeft: spacing.md,
        fontWeight: '600',
        lineHeight: 19,
    },
    retryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginLeft: spacing.sm,
        minHeight: 44,
        paddingHorizontal: spacing.lg,
        borderRadius: br.lg,
        borderWidth: 1,
    },
    retryLabel: {
        fontWeight: '700',
    },
});
