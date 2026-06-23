import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton, EmptyState, SearchBar, CtaButton, GlassCard } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { MessageAvatar } from '@/components/MessageAvatar';
import { getConversations, type Conversation } from '@/api/chat';
import { formatDistanceToNow } from 'date-fns';
import { withAlpha } from '@/theme/utils';
import { safeImageUri } from '@/lib/imageUrl';

// Fixed list-row height so FlatList can compute getItemLayout without measuring.
const ROW_HEIGHT = 76;

/**
 * Resolve the human-facing fields of a conversation row once, in one place.
 * Prefers the CONTRACT peer descriptor (GET conversations returns requestState +
 * peer {userId, displayName, avatarUrl}). Falls back to the legacy target-id
 * resolution so an older payload shape never crashes the list with `.slice` of
 * undefined. Shared by the row renderer AND the search filter so both read the
 * exact same derived name.
 */
function deriveRow(item: Conversation) {
    const anyItem = item as Conversation & Record<string, any>;
    const peer = item.peer;
    const targetId = String(peer?.userId ?? anyItem?.targetId ?? anyItem?.targetUserId ?? anyItem?.otherUserId ?? anyItem?.userId ?? item?.id ?? '');
    const name = peer?.displayName ?? (targetId ? `User ${targetId.slice(0, 4)}` : '—');
    const isPending = item.requestState === 'pending';
    const updated = item?.updatedAt ? new Date(item.updatedAt) : null;
    const timeAgo = updated && !isNaN(updated.getTime()) ? formatDistanceToNow(updated) : '';
    return { peer, targetId, name, isPending, timeAgo };
}

export default function MessagesListScreen() {
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Local-only client filter over the in-memory conversations (presentational —
    // never refetches; the cache stays the single source of truth).
    const [query, setQuery] = useState('');

    const { data: conversations, isLoading, isError, refetch } = useQuery({
        queryKey: ['conversations'],
        queryFn: getConversations,
    });

    const total = conversations?.length ?? 0;
    // Count of pending message requests — surfaced as the header "needs attention"
    // indicator (the one place lime earns a badge on this screen).
    const pendingCount = useMemo(
        () => (conversations ?? []).filter((c) => c.requestState === 'pending').length,
        [conversations],
    );

    // Case-insensitive name filter. Slicing/filtering the stable query array
    // yields a new array instance but preserves inner row references, so
    // virtualization can still skip unchanged rows.
    const filtered = useMemo(() => {
        const list = conversations ?? [];
        const q = query.trim().toLowerCase();
        if (!q) return list;
        return list.filter((c) => deriveRow(c).name.toLowerCase().includes(q));
    }, [conversations, query]);

    const keyExtractor = useCallback((item: Conversation) => item.id, []);

    const getItemLayout = useCallback(
        (_d: ArrayLike<Conversation> | null | undefined, index: number) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * index,
            index,
        }),
        [],
    );

    const renderItem = useCallback(({ item, index }: { item: Conversation; index: number }) => {
        const { peer, targetId, name, isPending, timeAgo } = deriveRow(item);
        const avatarUri = safeImageUri(peer?.avatarUrl);

        // Pending body copy is warmer and uses the peer's NAME so a connection
        // request reads as a person reaching out (the inbox's one near-peak
        // moment) rather than admin — while the heavy lime treatment is dialled
        // back so visual intensity now matches the copy. Accepted rows have no
        // lastMessage in the contract, so the relative time IS the secondary —
        // the name dominates and we never reprint the same static affordance line.
        const secondary = isPending
            ? (peer?.displayName ? `${name} wants to train with you` : 'Wants to train with you')
            : timeAgo;

        const row = (
            <PressableScale
                pressedScale={0.97}
                accessibilityRole="button"
                accessibilityLabel={`Open chat with ${name}${isPending ? ', message request' : ''}`}
                style={styles.rowTouchable}
                onPress={() => { if (targetId) router.push(`/messages/${targetId}` as any); }}
            >
                {/* Avatar — a person, so always an avatar (photo > initials, never
                    white-on-lime). The ring stays NEUTRAL on every row; the pending
                    state is carried by the labelled Request pill, not lime here. */}
                <MessageAvatar
                    uri={avatarUri}
                    name={peer?.displayName}
                    size={52}
                    borderColor={withAlpha(colors.accent.purple, 0.3)}
                />

                <View style={styles.rowBody}>
                    <Text
                        style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}
                        numberOfLines={1}
                    >
                        {name}
                    </Text>
                    {secondary ? (
                        <Text
                            style={[typography.caption, { color: colors.text.secondary, marginTop: 3 }]}
                            numberOfLines={1}
                        >
                            {secondary}
                        </Text>
                    ) : null}
                </View>

                {/* Trailing affordance: the Request pill is the SINGLE lime token on
                    a pending row (it has a text label, so colour is never the only
                    signal); accepted rows get a plain chevron. */}
                <View style={styles.rowTrail}>
                    {isPending ? (
                        <View style={[styles.requestBadge, { backgroundColor: withAlpha(colors.accent.coral, 0.16), borderColor: withAlpha(colors.accent.coral, 0.4) }]}>
                            <View style={[styles.unreadDot, { backgroundColor: colors.accent.coral }]} />
                            <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: '700', fontSize: 10 }]}>Request</Text>
                        </View>
                    ) : (
                        <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
                    )}
                </View>
            </PressableScale>
        );

        // A pending request still elevates onto an Aurora glass surface so it reads
        // as "needs you", but the hairline is now NEUTRAL and the lime glow halo is
        // gone — lime is the 10% accent (the labelled Request pill), not the row's
        // dominant hue, and the visual intensity now matches the muted copy.
        const card = isPending ? (
            <GlassCard radius={borderRadius.xl} style={{ borderColor: withAlpha(colors.text.primary, 0.10) }}>
                {row}
            </GlassCard>
        ) : (
            <View style={[styles.rowCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                {row}
            </View>
        );

        // Stagger only the first screenful so deep scrolls stay snappy.
        if (index < 10) {
            return (
                <Animated.View entering={FadeInDown.springify().damping(20).mass(0.9).delay(60 + index * 40)} style={styles.rowWrap}>
                    {card}
                </Animated.View>
            );
        }
        return <View style={styles.rowWrap}>{card}</View>;
    }, [colors, typography, borderRadius, router]);

    const showList = !isLoading && !isError && total > 0;

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary, paddingTop: insets.top }]}>
            <StatusBar style="light" />

            {/* Header — value ("Messages") dominates its label ("INBOX"); a lime count
                chip carries the conversation total / pending-request signal. */}
            <Animated.View entering={FadeInDown.springify().damping(20)} style={styles.header}>
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
                    <Text style={[typography.overline, { color: colors.accent.coral }]}>INBOX</Text>
                    <Text style={[typography.h1, { color: colors.text.primary, marginTop: 2 }]}>Messages</Text>
                </View>

                {/* Count chip — big condensed VALUE over a tiny label. Tints lime only
                    when there's a pending request waiting (peak / attention). */}
                {showList ? (
                    <View
                        style={[
                            styles.countChip,
                            pendingCount > 0
                                ? { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.4) }
                                : { backgroundColor: withAlpha(colors.text.primary, 0.04), borderColor: colors.border.default },
                        ]}
                    >
                        <Text style={[typography.statSmall, { color: pendingCount > 0 ? colors.accent.coral : colors.text.primary, lineHeight: 26 }]}>
                            {total}
                        </Text>
                        <Text style={[typography.overline, { color: colors.text.tertiary }]}>
                            {pendingCount > 0 ? 'NEW' : 'CHATS'}
                        </Text>
                    </View>
                ) : (
                    <View style={{ width: 44 }} />
                )}
            </Animated.View>

            {/* Search — presentational client filter, only shown when there's a list.
                The shared SearchBar wraps a bare TextInput with no a11y label, so we
                label the search region here (role='search') for assistive tech. */}
            {showList ? (
                <Animated.View
                    entering={FadeInDown.springify().damping(20).delay(50)}
                    style={styles.searchWrap}
                    accessibilityRole="search"
                    accessibilityLabel="Search conversations"
                >
                    <SearchBar value={query} onChangeText={setQuery} placeholder="Search conversations" />
                </Animated.View>
            ) : null}

            {/* Body */}
            {isLoading ? (
                <View style={styles.listContent}>
                    {Array.from({ length: 7 }).map((_, i) => (
                        <ChatRowSkeleton key={i} />
                    ))}
                </View>
            ) : isError ? (
                <EmptyState
                    icon="cloud-offline-outline"
                    title="Couldn't load messages"
                    subtitle="Something went wrong fetching your conversations. Check your connection and try again."
                    actionLabel="Try Again"
                    onAction={() => refetch()}
                    style={styles.stateFill}
                />
            ) : total === 0 ? (
                // Guiding zero-state — never blank: icon + one-line guidance + a thumb
                // CTA that takes the user to people they can start a chat with.
                <View style={styles.stateFill}>
                    <EmptyState
                        icon="chatbubbles-outline"
                        title="No messages yet"
                        subtitle="Find athletes and coaches in the community, then start a conversation from their profile — it'll show up right here."
                    />
                    <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
                        <CtaButton
                            label="Find people to message"
                            icon="people-outline"
                            size="lg"
                            onPress={() => router.push('/(community)/leaderboard' as any)}
                            accessibilityLabel="Find people to message in the community"
                        />
                    </View>
                </View>
            ) : filtered.length === 0 ? (
                // Search returned nothing — a distinct guiding state with a reset.
                <EmptyState
                    icon="search-outline"
                    title="No matches"
                    subtitle={`No conversations match “${query.trim()}”. Try a different name.`}
                    actionLabel="Clear search"
                    onAction={() => setQuery('')}
                    style={styles.stateFill}
                />
            ) : (
                <>
                    <FlatList
                        data={filtered}
                        keyExtractor={keyExtractor}
                        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
                        renderItem={renderItem}
                        getItemLayout={getItemLayout}
                        showsVerticalScrollIndicator={false}
                        removeClippedSubviews={Platform.OS === 'android'}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={11}
                    />
                    {/* Thumb-zone primary action — discovery is always one tap away. */}
                    <Animated.View entering={FadeIn.delay(280)} style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
                        <CtaButton
                            label="Find people"
                            icon="person-add-outline"
                            onPress={() => router.push('/(community)/leaderboard' as any)}
                            accessibilityLabel="Find people to message in the community"
                        />
                    </Animated.View>
                </>
            )}
        </View>
    );
}

function ChatRowSkeleton() {
    const { colors, borderRadius } = useTheme();
    return (
        <View style={styles.rowWrap}>
            <View style={[styles.rowCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                <View style={styles.rowTouchable}>
                    <Skeleton width={52} height={52} radius={26} />
                    <View style={styles.rowBody}>
                        <Skeleton width="45%" height={15} radius={borderRadius.sm} />
                        <Skeleton width="78%" height={11} radius={borderRadius.sm} style={{ marginTop: 9 }} />
                    </View>
                    <Skeleton width={32} height={11} radius={borderRadius.sm} />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
    },
    headerBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    headerTitleWrap: { flex: 1, marginLeft: 12 },
    countChip: {
        minWidth: 56,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchWrap: { paddingHorizontal: 20, paddingBottom: 12 },
    listContent: { paddingHorizontal: 20, paddingTop: 4 },
    stateFill: { flex: 1 },
    rowWrap: { marginBottom: 12 },
    rowCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
    rowTouchable: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: ROW_HEIGHT },
    rowBody: { flex: 1, marginLeft: 14, marginRight: 10, justifyContent: 'center' },
    rowTrail: { alignItems: 'flex-end', justifyContent: 'center', gap: 6, minHeight: 44 },
    requestBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
    },
    unreadDot: { width: 6, height: 6, borderRadius: 3 },
    bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12 },
});
