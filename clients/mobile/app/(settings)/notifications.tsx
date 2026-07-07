import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, FlatList, Image, Platform } from 'react-native';

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

// Ria's avatar — the app logo, shown on coach-authored notifications (mirrors the
// messaging look in (modals)/ai-coach.tsx + messages/index.tsx). Required once at
// module scope so Metro bundles it a single time. Uses RN's <Image> (always
// present on every renderer) rather than expo-image so the avatar is inert under
// the screen test's renderer.
const RIA_AVATAR = require('../../assets/images/logo_app.png');

// ---------------------------------------------------------------------------
// Date-bucketing — pure presentation logic over the existing `createdAt` field.
// Buckets a notification into Today / Earlier using local-midnight math on its
// timestamp. Deliberately uses ONLY Date arithmetic (getTime/getFullYear/…) and
// NEVER `toLocaleDateString` — the row's visible date cell is the sole caller of
// that formatter (the timestamp-guard test pins it to exactly one call per valid
// row). Malformed/empty timestamps fall into 'Earlier' so the row is grouped,
// never dropped. The mockup groups by Today / Earlier; "Yesterday" folds into
// Earlier to match it.
// ---------------------------------------------------------------------------
type Bucket = 'Today' | 'Earlier';
const BUCKET_ORDER: Bucket[] = ['Today', 'Earlier'];

function bucketFor(createdAt: string): Bucket {
    const t = createdAt ? new Date(createdAt).getTime() : NaN;
    if (Number.isNaN(t)) return 'Earlier';
    const d = new Date(t);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (startOfDay >= startOfToday) return 'Today';
    return 'Earlier';
}

// A header sentinel interleaved into the FlatList data so date sections render
// inline while the list stays a single <FlatList> (the loading/error/empty/
// populated branch tests assert on FlatList identity + count). Each header
// carries a synthetic id so keyExtractor stays total.
type HeaderItem = { _kind: 'header'; id: string; bucket: Bucket; count: number };
type RowItem = { _kind: 'row'; id: string; notification: Notification; isLast: boolean };
type ListItem = HeaderItem | RowItem;

// ── Icon-tile classification ────────────────────────────────────────────────
// The mockup shows three tile flavours: a Ria avatar (coach), social initials,
// and a lime reminder glyph (everything else). We map the REAL `type` union
// ('meal' | 'caffeine' | 'sleep' | 'workout' | 'coach' | 'system', plus the
// 'social'/'streak' the backend may send) onto these without fabricating data.
type TileKind = 'ria' | 'social' | 'reminder';

function tileKindFor(type: string): TileKind {
    if (type === 'coach') return 'ria';
    if (type === 'social') return 'social';
    return 'reminder';
}

// Per-type reminder glyph — a lime icon on a dark tile (the mockup look). All
// reminder types render lime; the glyph just hints the category.
const REMINDER_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
    workout: 'barbell',
    meal: 'restaurant',
    caffeine: 'cafe',
    sleep: 'moon',
    streak: 'flame',
    system: 'information-circle',
};
function reminderIconFor(type: string): keyof typeof Ionicons.glyphMap {
    return REMINDER_ICON[type] ?? 'notifications';
}

// Derive 1–2 letter initials for a social tile from a name carried on the
// notification's optional `data` bag — ONLY if a name-ish field is actually
// present (never fabricated). Returns null when no usable name exists, so the
// row falls back to a glyph tile instead of inventing initials.
const NAME_KEYS = ['actorName', 'fromName', 'displayName', 'name', 'author', 'from', 'user'];
function socialInitials(n: Notification): string | null {
    const bag = n.data;
    let raw: string | null = null;
    if (bag) {
        for (const k of NAME_KEYS) {
            const v = bag[k];
            if (typeof v === 'string' && v.trim()) { raw = v.trim(); break; }
        }
    }
    if (!raw) return null;
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    const initials = (first + last).toUpperCase();
    return initials || null;
}

export default function NotificationsScreen() {
    const { colors, typography } = useTheme();
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

    // The unread rows — drives the count + the "Mark all read" action. Memoised so
    // the action handler and the indicator read the same derived set.
    const unreadIds = useMemo(
        () => (notifications || []).filter((x) => !x.isRead).map((x) => x.id),
        [notifications],
    );
    const unreadCount = unreadIds.length;

    // "Mark all read" — marks EVERY currently-unread notification read by firing
    // the existing per-row markRead mutation for each unread id (no new endpoint;
    // the same mutation the rows use). onSuccess invalidates the list once per
    // call so the inbox refreshes. A no-op when nothing is unread.
    const markAllRead = useCallback(() => {
        if (markReadMutation.isPending) return;
        for (const id of unreadIds) markReadMutation.mutate(id);
    }, [unreadIds, markReadMutation]);

    // Flatten the rows into [header, row, row, …, header, row, …] grouped by
    // date bucket, preserving the server order WITHIN each bucket. Built from the
    // existing query data only — no new fetch. Header sentinels let the single
    // FlatList render grouped sections without becoming a SectionList.
    const listData = useMemo<ListItem[]>(() => {
        const rows = notifications || [];
        const groups: Record<Bucket, Notification[]> = { Today: [], Earlier: [] };
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

    // ── Section header — a quiet overline label (Today / Earlier), the mockup's
    // grouped-list convention.
    const renderHeader = useCallback((item: HeaderItem, index: number) => (
        <Animated.View
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(360).springify().damping(18)}
            style={styles.sectionHeader}
        >
            <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                {item.bucket}
            </Text>
        </Animated.View>
    ), [colors, typography]);

    // ── One notification row. Icon tile (Ria avatar / social initials / lime
    // reminder glyph) + bold title + one-line preview + time, with a lime unread
    // dot on unread rows. Unread rows earn a faint lime wash; read rows stay
    // neutral. Whole row is the press target — tapping an unread row marks it read.
    const renderRow = useCallback((item: RowItem, index: number) => {
        const n = item.notification;
        const unread = !n.isRead;
        const kind = tileKindFor(n.type);
        const initials = kind === 'social' ? socialInitials(n) : null;
        const lime = colors.accent.lime;
        const dateText = n.createdAt && !isNaN(new Date(n.createdAt).getTime())
            ? new Date(n.createdAt).toLocaleDateString()
            : '';
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
                            colors={[withAlpha(lime, 0.12), 'transparent']}
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
                        {/* ── Icon tile: three flavours, per the mockup. */}
                        {kind === 'ria' ? (
                            <View style={[styles.tile, { backgroundColor: withAlpha(lime, 0.14), borderColor: withAlpha(lime, 0.30) }]}>
                                <Image source={RIA_AVATAR} style={styles.tileAvatar} resizeMode="cover" />
                            </View>
                        ) : kind === 'social' && initials ? (
                            <View style={[styles.tile, { backgroundColor: withAlpha(colors.accent.purple, 0.16), borderColor: withAlpha(colors.accent.purple, 0.30) }]}>
                                <Text style={[typography.captionMedium, { color: colors.text.primary }]} maxFontSizeMultiplier={1.3}>
                                    {initials}
                                </Text>
                            </View>
                        ) : kind === 'social' ? (
                            <View style={[styles.tile, { backgroundColor: withAlpha(colors.accent.purple, 0.16), borderColor: withAlpha(colors.accent.purple, 0.30) }]}>
                                <Ionicons name="people" size={20} color={colors.accent.purple} />
                            </View>
                        ) : (
                            <View style={[styles.tile, { backgroundColor: colors.background.tertiary, borderColor: colors.border.default }]}>
                                <Ionicons name={reminderIconFor(n.type)} size={20} color={lime} />
                            </View>
                        )}

                        {/* ── Body: title + preview. */}
                        <View style={styles.body}>
                            <Text
                                style={[typography.subhead, { color: colors.text.primary, fontWeight: unread ? '700' : '500' }]}
                                numberOfLines={1}
                            >
                                {n.title}
                            </Text>
                            <Text style={[typography.bodySm, { color: colors.text.secondary, marginTop: 2 }]} numberOfLines={1}>
                                {n.body}
                            </Text>
                        </View>

                        {/* ── Trailing: time + unread dot, stacked (mockup). */}
                        <View style={styles.meta}>
                            {dateText ? (
                                <Text style={[typography.caption, { color: colors.text.tertiary }]} numberOfLines={1}>
                                    {dateText}
                                </Text>
                            ) : null}
                            {unread ? <View style={[styles.unreadDot, { backgroundColor: lime }]} /> : null}
                        </View>
                    </TouchableOpacity>
                </GlassCard>
            </Animated.View>
        );
    }, [colors, typography, markReadMutation]);

    const renderItem = useCallback(({ item, index }: { item: ListItem; index: number }) => (
        item._kind === 'header' ? renderHeader(item, index) : renderRow(item, index)
    ), [renderHeader, renderRow]);

    const keyExtractor = useCallback((item: ListItem) => item.id, []);

    // Loading placeholder shaped like a real notification row (tile + text lines).
    const renderSkeletonRow = (key: number) => (
        <View key={key} style={[styles.skeletonCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
            <Skeleton width={40} height={40} radius={br.md} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Skeleton width="50%" height={14} radius={br.sm} />
                <Skeleton width="85%" height={12} radius={br.sm} style={{ marginTop: 8 }} />
            </View>
            <Skeleton width={24} height={12} radius={br.sm} />
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
                    <Text style={[typography.h1, { color: colors.text.primary }]} numberOfLines={1}>
                        Notifications
                    </Text>
                </View>
                {/* "Mark all read" — marks every unread row read via the existing
                    markRead mutation. Only shown when there's something unread. */}
                {unreadCount > 0 ? (
                    <Pressable
                        onPress={markAllRead}
                        disabled={markReadMutation.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={`Mark all ${unreadCount} as read`}
                        accessibilityState={{ disabled: markReadMutation.isPending, busy: markReadMutation.isPending }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={({ pressed }) => [styles.markAllBtn, { opacity: pressed || markReadMutation.isPending ? 0.6 : 1 }]}
                    >
                        <Text style={[typography.captionMedium, { color: colors.accent.lime }]} maxFontSizeMultiplier={1.3}>
                            Mark all read
                        </Text>
                    </Pressable>
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
                                    <Ionicons name="alert-circle" size={20} color={colors.accent.lime} />
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
                                            borderColor: withAlpha(colors.accent.lime, 0.4),
                                            backgroundColor: withAlpha(colors.accent.lime, pressed ? 0.16 : 0.08),
                                        },
                                    ]}
                                    testID="mark-read-error-retry"
                                >
                                    <Ionicons name="refresh-outline" size={15} color={colors.accent.lime} />
                                    <Text style={[typography.caption, styles.retryLabel, { color: colors.accent.lime }]}>
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
    markAllBtn: {
        minHeight: 32,
        paddingHorizontal: spacing.sm,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Grouped-section header (quiet overline label).
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
        paddingHorizontal: spacing.xs,
    },

    // Notification card (one per row; the GlassCard owns the frosted fill +
    // hairline + radius — the wash gradients sit above its blur).
    card: { marginBottom: spacing.sm },
    cardLast: { marginBottom: spacing.xs },
    cardInner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        paddingRight: spacing.lg,
    },
    // The icon tile — 40px rounded square (mockup), one of three flavours.
    tile: {
        width: 40,
        height: 40,
        borderRadius: br.md,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    tileAvatar: { width: '100%', height: '100%', borderRadius: br.md },
    body: { flex: 1, marginLeft: spacing.md },
    // Trailing time + unread dot, stacked top-right (mockup).
    meta: {
        marginLeft: spacing.sm,
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
        gap: spacing.sm,
        minWidth: 28,
    },
    unreadDot: { width: 8, height: 8, borderRadius: 4 },

    skeletonCard: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: spacing.md,
        marginBottom: spacing.sm,
        padding: spacing.md,
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
