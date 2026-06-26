import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, ScrollView } from 'react-native';
import { Image } from 'expo-image';
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

// Ria's coach avatar — the app logo, exactly as the Messages mockup pins it.
const RIA_LOGO = require('../../assets/images/logo_app.png');

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
    // Coach Ria is a normal conversation peer (userId 'ria-1', displayName
    // "Coach Ria" / "Ria") per the SOCIAL contract; we tag it as the COACH row and
    // give it the app-logo avatar. Purely presentational — name match only.
    const isCoach = /ria|coach/i.test(name);
    return { peer, targetId, name, isPending, timeAgo, isCoach };
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

    // Case-insensitive name filter. Slicing/filtering the stable query array
    // yields a new array instance but preserves inner row references, so
    // virtualization can still skip unchanged rows. The Ria/coach row is PINNED
    // to the top so the inbox always opens on the coach thread (mockup parity).
    const filtered = useMemo(() => {
        const list = conversations ?? [];
        const q = query.trim().toLowerCase();
        const matched = q ? list.filter((c) => deriveRow(c).name.toLowerCase().includes(q)) : list;
        // Stable pin: coach rows first, original order otherwise (no mutation of
        // the cache array — we copy before sorting).
        return [...matched].sort((a, b) => {
            const ac = deriveRow(a).isCoach ? 0 : 1;
            const bc = deriveRow(b).isCoach ? 0 : 1;
            return ac - bc;
        });
    }, [conversations, query]);

    // "Active now" rail — a presentational presence strip built from real peers.
    // We surface the accepted conversations (a person each), newest first, so the
    // rail mirrors who the user actually talks to. Capped so it stays a glance.
    const activeNow = useMemo(() => {
        return (conversations ?? [])
            .filter((c) => c.requestState !== 'pending' && !!c.peer)
            .slice(0, 8);
    }, [conversations]);

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
        const { peer, targetId, name, isPending, timeAgo, isCoach } = deriveRow(item);
        const avatarUri = safeImageUri(peer?.avatarUrl);

        // Pending body copy is warmer and uses the peer's NAME so a connection
        // request reads as a person reaching out. Accepted rows have no lastMessage
        // in the contract, so the relative time IS the secondary preview line.
        const secondary = isPending
            ? (peer?.displayName ? `${name} wants to train with you` : 'Wants to train with you')
            : (timeAgo ? `Active ${timeAgo} ago` : 'Tap to open the conversation');

        const onPress = () => { if (targetId) router.push(`/messages/${targetId}` as any); };

        const row = (
            <View style={styles.rowTouchable}>
                {/* Avatar — Ria/coach uses the app logo; everyone else is a person
                    avatar (photo > lime-initials, never white-on-lime). A lime
                    presence dot marks accepted (online-style) rows. */}
                <View style={styles.avatarWrap}>
                    {isCoach ? (
                        <View style={[styles.coachAvatar, { borderColor: withAlpha(colors.accent.coral, 0.45) }]}>
                            <Image source={RIA_LOGO} style={styles.coachAvatarImg} contentFit="cover" />
                        </View>
                    ) : (
                        <MessageAvatar
                            uri={avatarUri}
                            name={peer?.displayName}
                            size={52}
                            borderColor={withAlpha(colors.text.primary, 0.10)}
                        />
                    )}
                    {!isPending ? (
                        <View style={[styles.onlineDot, { backgroundColor: colors.accent.coral, borderColor: colors.background.primary }]} />
                    ) : null}
                </View>

                <View style={styles.rowBody}>
                    <View style={styles.nameRow}>
                        <Text
                            style={[typography.subhead, { color: colors.text.primary, fontWeight: '700' }]}
                            numberOfLines={1}
                        >
                            {name}
                        </Text>
                        {isCoach ? (
                            <View style={[styles.coachTag, { backgroundColor: withAlpha(colors.accent.coral, 0.16), borderColor: withAlpha(colors.accent.coral, 0.4) }]}>
                                <Text style={[typography.overline, { color: colors.accent.coral, fontSize: 9, letterSpacing: 0.8 }]}>COACH</Text>
                            </View>
                        ) : null}
                    </View>
                    {secondary ? (
                        <Text
                            style={[typography.caption, { color: isPending ? colors.accent.coral : colors.text.secondary, marginTop: 3 }]}
                            numberOfLines={1}
                        >
                            {secondary}
                        </Text>
                    ) : null}
                </View>

                {/* Trailing affordance: time + (pending → labelled Request pill, the
                    single lime token on the row; accepted → a chevron). */}
                <View style={styles.rowTrail}>
                    {timeAgo ? (
                        <Text style={[typography.caption, { color: colors.text.tertiary, fontSize: 11 }]} numberOfLines={1}>
                            {timeAgo}
                        </Text>
                    ) : null}
                    {isPending ? (
                        <View style={[styles.requestBadge, { backgroundColor: withAlpha(colors.accent.coral, 0.16), borderColor: withAlpha(colors.accent.coral, 0.4) }]}>
                            <View style={[styles.unreadDot, { backgroundColor: colors.accent.coral }]} />
                            <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: '700', fontSize: 10 }]}>Request</Text>
                        </View>
                    ) : (
                        <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                    )}
                </View>
            </View>
        );

        const pressable = (
            <PressableScale
                pressedScale={0.98}
                accessibilityRole="button"
                accessibilityLabel={`Open chat with ${name}${isCoach ? ', your coach' : ''}${isPending ? ', message request' : ''}`}
                style={styles.rowPress}
                onPress={onPress}
            >
                {row}
            </PressableScale>
        );

        // A pending request (or the pinned coach row) elevates onto an Aurora glass
        // surface so it reads as "needs you" / "your coach"; everyone else is a flat
        // hairline card. Lime is the labelled-pill / coach-tag accent, never the fill.
        const card = (isPending || isCoach) ? (
            <GlassCard radius={borderRadius.xl} style={{ borderColor: withAlpha(isCoach ? colors.accent.coral : colors.text.primary, isCoach ? 0.22 : 0.10) }}>
                {pressable}
            </GlassCard>
        ) : (
            <View style={[styles.rowCard, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                {pressable}
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

            {/* Header — back · "Messages" · compose. The compose icon takes the user
                to the community to find new people to message (the real "new chat"
                entry point on this app). */}
            <Animated.View entering={FadeInDown.springify().damping(20)} style={styles.header}>
                <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    activeOpacity={0.85}
                    onPress={() => router.back()}
                    style={styles.headerIconBtn}
                >
                    <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
                </TouchableOpacity>

                <Text style={[typography.h1, styles.headerTitle, { color: colors.text.primary }]}>Messages</Text>

                <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="New message"
                    activeOpacity={0.85}
                    onPress={() => router.push('/(community)/leaderboard' as any)}
                    style={styles.headerIconBtn}
                >
                    <Ionicons name="create-outline" size={24} color={colors.accent.coral} />
                </TouchableOpacity>
            </Animated.View>

            {/* Search — presentational client filter, only shown when there's a list.
                The shared SearchBar wraps a bare TextInput with no a11y label, so we
                label the search region here (role='search') for assistive tech. */}
            {showList ? (
                <Animated.View
                    entering={FadeInDown.springify().damping(20).delay(50)}
                    style={styles.searchWrap}
                    accessibilityRole="search"
                    accessibilityLabel="Search messages"
                >
                    <SearchBar value={query} onChangeText={setQuery} placeholder="Search messages" />
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
                        ListHeaderComponent={
                            activeNow.length > 0 && !query.trim() ? (
                                <ActiveNowRail items={activeNow} onOpen={(id) => router.push(`/messages/${id}` as any)} />
                            ) : null
                        }
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

/**
 * ActiveNowRail — the horizontal "active now" presence strip. Purely
 * presentational: an avatar (with a lime online dot) + first name per accepted
 * peer, tapping straight into that thread. No presence data exists in the
 * contract, so this surfaces the people the user actually converses with.
 */
function ActiveNowRail({ items, onOpen }: { items: Conversation[]; onOpen: (targetId: string) => void }) {
    const { colors, typography } = useTheme();
    return (
        <View style={styles.railWrap}>
            <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: 10, marginLeft: 2 }]}>ACTIVE NOW</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.railContent}
            >
                {items.map((c) => {
                    const { peer, targetId, name } = deriveRow(c);
                    const first = name.split(' ')[0] ?? name;
                    return (
                        <PressableScale
                            key={c.id}
                            pressedScale={0.94}
                            accessibilityRole="button"
                            accessibilityLabel={`Open chat with ${name}`}
                            style={styles.railItem}
                            onPress={() => { if (targetId) onOpen(targetId); }}
                        >
                            <View>
                                <MessageAvatar uri={safeImageUri(peer?.avatarUrl)} name={peer?.displayName} size={56} borderColor={withAlpha(colors.accent.coral, 0.5)} />
                                <View style={[styles.railDot, { backgroundColor: colors.accent.coral, borderColor: colors.background.primary }]} />
                            </View>
                            <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 11, marginTop: 6, maxWidth: 60 }]} numberOfLines={1}>
                                {first}
                            </Text>
                        </PressableScale>
                    );
                })}
            </ScrollView>
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
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 10,
    },
    headerIconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, marginLeft: 4 },
    searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
    listContent: { paddingHorizontal: 16, paddingTop: 4 },
    stateFill: { flex: 1 },
    // Active-now rail
    railWrap: { paddingTop: 2, paddingBottom: 14 },
    railContent: { gap: 16, paddingRight: 8 },
    railItem: { alignItems: 'center', width: 60 },
    railDot: { position: 'absolute', bottom: 1, right: 1, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
    // Rows
    rowWrap: { marginBottom: 12 },
    rowCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
    rowPress: { borderRadius: 20 },
    rowTouchable: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: ROW_HEIGHT },
    avatarWrap: { position: 'relative' },
    onlineDot: { position: 'absolute', bottom: 1, right: 1, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
    coachAvatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, overflow: 'hidden' },
    coachAvatarImg: { width: '100%', height: '100%' },
    rowBody: { flex: 1, marginLeft: 14, marginRight: 10, justifyContent: 'center' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    coachTag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1 },
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
