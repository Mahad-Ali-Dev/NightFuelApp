import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, AccessibilityInfo } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { Skeleton, EmptyState, GlassCard, CtaButton, Avatar } from '@/components/ui';
import { getMessageRequests, acceptRequest, declineRequest, type MessageRequest } from '@/api/community';
import { withAlpha } from '@/theme/utils';

const REQUESTS_KEY = ['chat-requests'] as const;

// Social inbox sits in the AI/coach colour family (purple) — NOT lime. Lime is
// reserved as the 10% accent for the one primary action per row (Accept) and the
// active count indicator, so the screen reads calm with a single bright pull.
const relativeTime = (iso?: string): string | null => {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    const diff = Date.now() - t;
    if (diff < 0) return 'just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const wks = Math.floor(days / 7);
    return `${wks}w ago`;
};

/**
 * Incoming message-requests inbox (SOCIAL API CONTRACT — Instagram-DM style).
 * A pending 1:1 conversation is a request: the recipient (me) sees the peer here
 * and can Accept (unlocks the chat for both) or Decline. Acting on a row removes
 * it from the list immediately (optimistic) — the cache is the single ground
 * truth, so there is no parallel "dismissed" state (react-state-minimize).
 */
export default function MessageRequestsScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: requests, isLoading, isError, refetch } = useQuery({
        queryKey: REQUESTS_KEY,
        queryFn: getMessageRequests,
    });

    // Remove a row from the cache by conversation id. Used as the optimistic
    // update for both Accept and Decline (state-ground-truth: the cache list IS
    // the source of truth — we never mirror it into component state).
    const removeRow = useCallback(
        (conversationId: string) => {
            queryClient.setQueryData<MessageRequest[]>(REQUESTS_KEY, (old) =>
                (old ?? []).filter((r) => r.id !== conversationId),
            );
        },
        [queryClient],
    );

    const acceptMutation = useMutation({
        mutationFn: (conversationId: string) => acceptRequest(conversationId),
        // On error, refetch so a failed accept doesn't silently drop the row.
        onError: () => { refetch(); },
    });

    const declineMutation = useMutation({
        mutationFn: (conversationId: string) => declineRequest(conversationId),
        onError: () => { refetch(); },
    });

    // Single callback instances created at the list root and called by each row
    // with its own id (list-performance-callbacks). Accept also opens the now-
    // unlocked conversation so the recipient can reply right away.
    //
    // Order matters for the PEAK-END moment: fire the mutation IMMEDIATELY for
    // correctness, but DEFER the optimistic removeRow + the navigation by the
    // celebration's lifetime (~500ms). The row sets `accepting` synchronously and
    // paints its lime "Accepted" wash; if we removed/navigated in the same frame
    // (as before) that wash got ~1 frame and the user was yanked off-screen, so
    // the celebration never landed. Letting the accept RESOLVE on the inbox first
    // (wash plays → FadeOutUp exit) and only THEN routing also removes the
    // router/optimistic-removal race.
    const onAccept = useCallback(
        (conversationId: string, peerUserId?: string) => {
            acceptMutation.mutate(conversationId);
            setTimeout(() => {
                removeRow(conversationId);
                if (peerUserId) router.push(`/messages/${peerUserId}` as any);
            }, 500);
        },
        [removeRow, acceptMutation, router],
    );

    const onDecline = useCallback(
        (conversationId: string) => {
            removeRow(conversationId);
            declineMutation.mutate(conversationId);
        },
        [removeRow, declineMutation],
    );

    const keyExtractor = useCallback((item: MessageRequest) => item.id, []);

    const renderItem = useCallback(
        ({ item, index }: { item: MessageRequest; index: number }) => (
            <RequestRow item={item} index={index} onAccept={onAccept} onDecline={onDecline} />
        ),
        [onAccept, onDecline],
    );

    const count = requests?.length ?? 0;

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
            {/* Header — back + condensed title with an INBOX overline. The live
                count is NOT duplicated here: it lives once, value-dominant, in the
                RequestsLede below (number as hero + newest-requester avatar stack),
                so the count isn't stacked twice within ~100px. A fixed-width spacer
                keeps the title optically centered against the back button. */}
            <View style={[styles.header, { borderBottomColor: colors.border.default }]}>
                <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    activeOpacity={0.85}
                    onPress={() => router.back()}
                    style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                >
                    <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <View style={styles.headerTitleWrap}>
                    <Text style={[typography.overline, { color: colors.text.tertiary }]}>INBOX</Text>
                    <Text style={[typography.h2, { color: colors.text.primary }]}>Requests</Text>
                </View>
                <View style={styles.headerSpacer} />
            </View>

            {/* List */}
            {isLoading ? (
                <View style={{ padding: 16 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <RequestRowSkeleton key={i} />
                    ))}
                </View>
            ) : isError ? (
                // Honest error surface: an explicit retry CtaButton (not an
                // EmptyState text button) so the recovery action is the same
                // coral primitive used everywhere else, and it is a11y-labelled.
                // The CtaButton's onPress is the query's refetch — and only that.
                <View style={styles.stateWrap}>
                    <GlassCard style={styles.stateCard}>
                        <View style={styles.stateInner}>
                            <View
                                style={[
                                    styles.stateIconCircle,
                                    {
                                        backgroundColor: withAlpha(colors.accent.coral, 0.12),
                                        borderColor: withAlpha(colors.accent.coral, 0.24),
                                    },
                                ]}
                            >
                                <Ionicons name="cloud-offline-outline" size={36} color={colors.accent.coral} />
                            </View>
                            <Text style={[typography.h3, { color: colors.text.primary, textAlign: 'center', marginTop: 16 }]}>
                                Couldn't load requests
                            </Text>
                            <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 8 }]}>
                                Something went wrong fetching your message requests. Check your connection and try again.
                            </Text>
                            <CtaButton
                                label="Try Again"
                                icon="refresh"
                                accessibilityLabel="Retry loading your message requests"
                                onPress={() => refetch()}
                                style={styles.stateRetryBtn}
                            />
                        </View>
                    </GlassCard>
                </View>
            ) : !requests || requests.length === 0 ? (
                // Guiding empty state — never blank. Animated in so the screen
                // settles with intent, with the established EmptyState primitive
                // (icon + one-line guidance) centered in the viewport.
                <Animated.View entering={FadeIn.duration(320)} style={styles.emptyWrap}>
                    <EmptyState
                        icon="mail-open-outline"
                        title="No message requests"
                        subtitle="When someone you don't follow messages you, their request will appear here for you to accept or decline."
                    />
                </Animated.View>
            ) : (
                <FlatList
                    data={requests}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
                    renderItem={renderItem}
                    ListHeaderComponent={<RequestsLede count={count} requests={requests} />}
                    removeClippedSubviews={Platform.OS === 'android'}
                    initialNumToRender={10}
                    maxToRenderPerBatch={10}
                    windowSize={11}
                />
            )}
        </View>
    );
}

// Count requests whose updatedAt falls inside the current calendar day, so the
// lede can carry a "N new today" beat the old number-only pill could not.
const countNewToday = (rows?: MessageRequest[]): number => {
    if (!rows?.length) return 0;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const floor = start.getTime();
    let n = 0;
    for (const r of rows) {
        const t = r.updatedAt ? Date.parse(r.updatedAt) : NaN;
        if (!Number.isNaN(t) && t >= floor) n += 1;
    }
    return n;
};

/**
 * The list lede — now the SINGLE, value-dominant count surface (the header pill
 * was dropped to avoid showing the same number twice within ~100px). The COUNT
 * (big, condensed) is the hero; the quiet label sits beneath it (value > label).
 * It earns its space by carrying what a bare pill could not: a stacked avatar
 * preview of the newest requesters and a "N new today" beat. Purple keeps it in
 * the social/coach family; lime stays reserved for the per-row Accept.
 *
 * a11y: because this replaced the header indicator, the live count is announced
 * here on change (announceForAccessibility + a polite live region) so the
 * "action waiting" state is perceivable without sight — number/colour alone is
 * not a sufficient signal.
 */
function RequestsLede({ count, requests }: { count: number; requests?: MessageRequest[] }) {
    const { colors, typography } = useTheme();
    const newToday = useMemo(() => countNewToday(requests), [requests]);
    // Newest few requesters (the list arrives newest-first) for the avatar stack.
    const preview = useMemo(() => (requests ?? []).slice(0, 3), [requests]);

    // Announce count transitions for screen readers (the old pill carried a
    // static label and never re-announced when a request arrived or the list
    // cleared). announceForAccessibility covers iOS + Android; the wrapper also
    // sets accessibilityLiveRegion for Android's native polite channel.
    const prevCount = useRef<number | null>(null);
    useEffect(() => {
        if (prevCount.current !== null && prevCount.current !== count) {
            AccessibilityInfo.announceForAccessibility(
                `${count} pending ${count === 1 ? 'request' : 'requests'}`,
            );
        }
        prevCount.current = count;
    }, [count]);

    return (
        <Animated.View entering={FadeIn.duration(300)} style={styles.lede}>
            <View
                style={[
                    styles.ledeIcon,
                    { backgroundColor: withAlpha(colors.accent.purple, 0.14), borderColor: withAlpha(colors.accent.purple, 0.28) },
                ]}
            >
                <Ionicons name="people-outline" size={20} color={colors.accent.purpleLight} />
            </View>
            <View
                style={styles.ledeText}
                accessible
                accessibilityLiveRegion="polite"
                accessibilityRole="text"
                accessibilityLabel={`${count} pending ${count === 1 ? 'request' : 'requests'}${newToday > 0 ? `, ${newToday} new today` : ''}`}
            >
                <View style={styles.ledeCountLine}>
                    <Text style={[typography.statSmall, { color: colors.text.primary }]} numberOfLines={1}>
                        {count} {count === 1 ? 'request' : 'requests'}
                    </Text>
                    {newToday > 0 ? (
                        <View
                            style={[
                                styles.newTodayChip,
                                { backgroundColor: withAlpha(colors.accent.purple, 0.16), borderColor: withAlpha(colors.accent.purple, 0.3) },
                            ]}
                        >
                            <Text
                                style={[typography.captionMedium, { color: colors.accent.purpleLight }]}
                                numberOfLines={1}
                                accessibilityElementsHidden
                                importantForAccessibility="no-hide-descendants"
                            >
                                {newToday} new today
                            </Text>
                        </View>
                    ) : null}
                </View>
                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: 2 }]} numberOfLines={1}>
                    {count === 1 ? 'someone wants to reach you' : 'people waiting to reach you'}
                </Text>
            </View>
            {preview.length > 0 ? (
                <View
                    style={styles.ledeAvatars}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                >
                    {preview.map((r, i) => (
                        <View
                            key={r.id}
                            style={[
                                styles.ledeAvatarSlot,
                                { marginLeft: i === 0 ? 0 : -12, zIndex: preview.length - i },
                            ]}
                        >
                            <Avatar
                                uri={r.peer?.avatarUrl ?? undefined}
                                name={r.peer?.displayName}
                                size={32}
                                borderColor={colors.background.primary}
                            />
                        </View>
                    ))}
                </View>
            ) : null}
        </Animated.View>
    );
}

interface RequestRowProps {
    item: MessageRequest;
    index: number;
    onAccept: (conversationId: string, peerUserId?: string) => void;
    onDecline: (conversationId: string) => void;
}

/**
 * A single request row: peer avatar + display name, Accept / Decline. Memoized so
 * the FlatList skips unchanged rows when one is acted on. The peer descriptor is
 * read off the CONTRACT `peer` field; values are derived in-row so the parent
 * never reparents the list (list-performance-function-references).
 *
 * `pending` is a row-LOCAL tap-guard, not mirrored server state: the two
 * mutations are shared across the whole list, so binding their `isPending` here
 * would dim EVERY row, and the acted row is optimistically removed the instant
 * it is tapped. So we keep the minimal per-row source of truth for "this row's
 * action already fired" (react-state-minimize) — it disables BOTH buttons (and
 * dims them, surfacing accessibilityState.disabled) so a fast double-tap can't
 * fire the handler twice in the frame before removeRow unmounts the row.
 *
 * `accepting` is a sibling cosmetic flag set only on Accept: it flips the card to
 * a lime "Accepted" confirmation that the card wears while the celebration plays.
 * It never gates the handler — onAccept still fires synchronously in handleAccept;
 * the PARENT defers removeRow + navigation (~500ms) so this lime wash has time to
 * land before the row exits. That deferral is what makes the peak-end moment real.
 */
const RequestRow = React.memo(function RequestRow({ item, index, onAccept, onDecline }: RequestRowProps) {
    const { colors, typography } = useTheme();
    const peer = item.peer;
    const name = peer?.displayName ?? (peer?.userId ? `User ${peer.userId.slice(0, 4)}` : 'Athlete');
    const when = useMemo(() => relativeTime(item.updatedAt), [item.updatedAt]);

    const [pending, setPending] = useState(false);
    const [accepting, setAccepting] = useState(false);

    const handleAccept = useCallback(() => {
        if (pending) return;
        setPending(true);
        setAccepting(true);
        onAccept(item.id, peer?.userId);
    }, [pending, onAccept, item.id, peer?.userId]);

    const handleDecline = useCallback(() => {
        if (pending) return;
        setPending(true);
        onDecline(item.id);
    }, [pending, onDecline, item.id]);

    // Stagger the entrance (40ms steps, capped) and let removal fade up so an
    // accept/decline exits with intent instead of popping — transform/opacity
    // only, on the UI thread.
    return (
        <Animated.View
            entering={FadeInDown.delay(Math.min(index, 8) * 40).springify().damping(18)}
            exiting={FadeOutUp.duration(220)}
            layout={LinearTransition.springify().damping(20)}
        >
            <GlassCard
                style={styles.rowCard}
                glow={accepting ? colors.accent.coral : undefined}
            >
                {/* Peak-end celebration overlay: a lime wash + check that the
                    row wears for the brief beat before it is removed on Accept. */}
                {accepting ? (
                    <Animated.View
                        entering={FadeIn.duration(160)}
                        pointerEvents="none"
                        style={[styles.acceptedOverlay, { backgroundColor: withAlpha(colors.accent.coral, 0.14) }]}
                    >
                        <View style={[styles.acceptedBadge, { backgroundColor: colors.accent.coral }]}>
                            <Ionicons name="checkmark" size={16} color={colors.text.inverse} />
                        </View>
                        <Text style={[typography.subhead, { color: colors.accent.coral, fontWeight: '800', marginLeft: 8 }]}>
                            Accepted
                        </Text>
                    </Animated.View>
                ) : null}

                <View style={styles.rowInner}>
                    {/* The non-interactive identity block is one a11y node so a screen
                        reader announces "<name>, wants to send you a message" as a
                        single summary, then moves to the Decline / Accept buttons
                        (kept as their own focusable controls — we never set
                        `accessible` on a container that holds those buttons). */}
                    <View
                        style={styles.rowTop}
                        accessible
                        accessibilityRole="summary"
                        accessibilityLabel={`${name}, wants to send you a message${when ? `, ${when}` : ''}`}
                    >
                        <Avatar uri={peer?.avatarUrl ?? undefined} name={peer?.displayName} size={52} borderColor={withAlpha(colors.accent.purple, 0.3)} />
                        <View style={styles.rowInfo}>
                            <Text style={[typography.subtitle, { color: colors.text.primary, fontWeight: 'bold' }]} numberOfLines={1}>{name}</Text>
                            <View style={styles.rowMetaLine}>
                                <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.text.tertiary} />
                                <Text style={[typography.caption, { color: colors.text.secondary, marginLeft: 5 }]} numberOfLines={1}>
                                    wants to send you a message
                                </Text>
                            </View>
                        </View>
                        {when ? (
                            <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 8 }]} numberOfLines={1}>
                                {when}
                            </Text>
                        ) : null}
                    </View>

                    {/* Action row — clear hierarchy: Accept is the single lime
                        primary, Decline a subordinate ghost. Both ≥44pt tall. */}
                    <View style={styles.rowActions}>
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`Decline message request from ${name}`}
                            accessibilityState={{ disabled: pending }}
                            disabled={pending}
                            activeOpacity={0.85}
                            onPress={handleDecline}
                            style={[styles.declineBtn, { borderColor: colors.border.light }, pending ? styles.btnPending : null]}
                        >
                            <Text style={[typography.subhead, { color: colors.text.secondary, fontWeight: '700' }]}>Decline</Text>
                        </TouchableOpacity>
                        <CtaButton
                            label="Accept"
                            icon="checkmark"
                            accessibilityLabel={`Accept message request from ${name}`}
                            disabled={pending}
                            onPress={handleAccept}
                            style={styles.acceptBtn}
                        />
                    </View>
                </View>
            </GlassCard>
        </Animated.View>
    );
});

function RequestRowSkeleton() {
    const { borderRadius } = useTheme();
    return (
        <GlassCard style={styles.rowCard}>
            <View style={styles.rowInner}>
                <View style={styles.rowTop}>
                    <Skeleton width={52} height={52} radius={26} />
                    <View style={styles.rowInfo}>
                        <Skeleton width="50%" height={16} radius={borderRadius.sm} />
                        <Skeleton width="70%" height={11} radius={borderRadius.sm} style={{ marginTop: 8 }} />
                    </View>
                </View>
                <View style={styles.rowActions}>
                    <Skeleton width={110} height={48} radius={borderRadius.lg} />
                    <Skeleton width={110} height={48} radius={borderRadius.lg} style={{ marginLeft: 12 }} />
                </View>
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, minHeight: 72, paddingVertical: 10, borderBottomWidth: 1 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    headerTitleWrap: { flex: 1, alignItems: 'center' },
    // Balances the back button so the title stays optically centered now that the
    // duplicate count pill is gone (the count lives once, in the lede).
    headerSpacer: { width: 40, height: 40 },
    // Centered error surface (honest retry state).
    stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    stateCard: { width: '100%', maxWidth: 420 },
    stateInner: { padding: 24, alignItems: 'center' },
    stateIconCircle: { width: 72, height: 72, borderRadius: 9999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    stateRetryBtn: { marginTop: 24, minWidth: 160, borderRadius: 14 },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    // List lede summary (value-dominant count above the rows; the single count
    // surface on the screen).
    lede: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 2, paddingBottom: 18 },
    ledeIcon: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    ledeText: { marginLeft: 14, flex: 1 },
    ledeCountLine: { flexDirection: 'row', alignItems: 'center' },
    // "N new today" beat — quiet purple chip that earns the lede's space by
    // carrying info the old bare number could not.
    newTodayChip: { marginLeft: 10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
    // Stacked avatar preview of the newest requesters (overlap via negative
    // margin; ringed in the page bg so they read as a tidy stack).
    ledeAvatars: { flexDirection: 'row', alignItems: 'center', marginLeft: 12 },
    ledeAvatarSlot: { borderRadius: 18 },
    rowCard: { marginBottom: 12 },
    rowInner: { padding: 16 },
    rowTop: { flexDirection: 'row', alignItems: 'center' },
    rowInfo: { flex: 1, marginLeft: 14 },
    rowMetaLine: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
    rowActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 16 },
    declineBtn: { minHeight: 48, paddingHorizontal: 22, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    // Dim the Decline control while its row's action is in flight (the Accept
    // CtaButton dims itself via its own disabled treatment) so a double-tap is
    // visibly blocked and the accessibilityState.disabled reads true.
    btnPending: { opacity: 0.6 },
    acceptBtn: { minWidth: 120, borderRadius: 14 },
    // Peak-end "Accepted" wash, sits above the row content for its brief life.
    acceptedOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    acceptedBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
