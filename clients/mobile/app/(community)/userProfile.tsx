import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPublicProfile } from '@/api/users';
import { getUserPosts, getUserSocial, followUser, unfollowUser, getUserBadges, Post, UserSocial, Badge } from '@/api/community';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Skeleton, EmptyState, CtaButton, GlassCard } from '@/components/ui';
import { Avatar } from '@/components/ui/Avatar';
import { PressableScale } from '@/components/ui/PressableScale';
import { StatusBar } from 'expo-status-bar';
import { shadows } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { formatDistanceToNow } from 'date-fns';
import Animated, {
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

// LIST-PERFORMANCE — one memoized post row at module scope.
//
// react-native-skills applied:
//   • list-performance-item-memo / Pass Primitives: the row takes ONLY primitives
//     (id/content/imageUrl/createdAt/authorName/authorAvatar/index) + ONE stable
//     callback `onOpen`, so React.memo's shallow compare is effective and the row
//     skips re-render when its post is unchanged (e.g. while the parent re-renders
//     for a follow toggle).
//   • list-performance-callbacks / list-performance-function-references: the parent
//     passes a SINGLE hoisted `onOpen` instance to every row (no new closure per row
//     per render); the row re-binds it to its own id via a local useCallback keyed on
//     [onOpen, id].
//   • list-performance-inline-objects: theme-derived style is read via useTheme INSIDE
//     the memoized row (not passed down as a churning prop), and static layout lives in
//     the hoisted StyleSheet — the parent allocates no per-row style/object.
//
// The row tap → onOpen(id) is the canonical post-open nav (matching
// app/(community)/index.tsx's `router.push('/(community)/${post.id}')`). The redesign
// fronts each activity card with the author avatar + name (avatars-for-people) and a
// staggered FadeInDown entrance keyed on `index`.
type PostRowProps = {
    id: string;
    content: string;
    imageUrl?: string;
    createdAt: string;
    authorName: string;
    authorAvatar?: string;
    index: number;
    onOpen: (postId: string) => void;
};

const PostRow = React.memo(function PostRow({
    id,
    content,
    imageUrl,
    createdAt,
    authorName,
    authorAvatar,
    index,
    onOpen,
}: PostRowProps) {
    const { colors, typography, borderRadius } = useTheme();
    const handlePress = useCallback(() => onOpen(id), [onOpen, id]);

    // Locale-correct relative time via date-fns' own suffixing ({ addSuffix })
    // instead of concatenating ' ago' (which would also yield "Invalid Date ago"
    // for a missing/garbage createdAt). Guard the parse so a bad timestamp degrades
    // to an em-dash rather than rendering "Invalid Date".
    const parsed = new Date(createdAt);
    const timeAgo = createdAt && !Number.isNaN(parsed.getTime())
        ? formatDistanceToNow(parsed, { addSuffix: true })
        : '—';

    return (
        <Animated.View entering={FadeInDown.delay(60 + index * 45).duration(420).springify().damping(18)}>
            <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Open ${authorName}'s post`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={handlePress}
            >
                <GlassCard style={styles.postCard} radius={borderRadius['2xl']}>
                    <View style={styles.postBody}>
                        {/* Author header — avatar + name + relative time (avatars-for-people) */}
                        <View style={styles.postHead}>
                            <Avatar uri={authorAvatar} name={authorName} size={36} />
                            <View style={styles.postHeadText}>
                                <Text numberOfLines={1} style={[typography.subhead, { color: colors.text.primary }]}>
                                    {authorName}
                                </Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>
                                    {timeAgo}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
                        </View>

                        <Text style={[typography.body, { color: colors.text.secondary, lineHeight: 22 }]}>
                            {content}
                        </Text>

                        {!!imageUrl && (
                            <Image
                                source={{ uri: imageUrl }}
                                style={[styles.postImg, { borderRadius: borderRadius.lg, backgroundColor: colors.background.tertiary }]}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={200}
                            />
                        )}
                    </View>
                </GlassCard>
            </PressableScale>
        </Animated.View>
    );
});

// One pillar of the hero stat triad. The VALUE dominates (statMedium, condensed,
// full-white) and the LABEL is a small uppercase overline at reduced opacity —
// hierarchy via size + weight + opacity, never colour. Lime is NOT spent here
// (10% rule): these are neutral metrics, the accent is reserved for the one
// primary action + the active follow state.
function StatPillar({ value, label }: { value: string | number; label: string }) {
    const { colors, typography } = useTheme();
    return (
        <View style={styles.statPillar} accessible accessibilityLabel={`${value} ${label}`}>
            <Text style={[typography.statMedium, { color: colors.text.primary }]} maxFontSizeMultiplier={1.2}>
                {value}
            </Text>
            <Text style={[typography.overline, { color: colors.text.tertiary, marginTop: 2 }]}>{label}</Text>
        </View>
    );
}

// Tier colours — the same metallic identity the achievements screen uses, so a
// gold badge reads as gold here too. The lime brand accent stays reserved for the
// follow action / active state (10% rule); tiers keep their own hue.
const BADGE_TIER_COLOR: Record<string, string> = {
    bronze: '#CD7F32',
    silver: '#C0C0C0',
    gold: '#FFD700',
    platinum: '#E5E4E2',
};

// PEAK-END — a celebratory badge strip on an unlocked profile. Earned badges are a
// real achievement, so the natural place to surface them is the profile. Renders a
// horizontal avatar-row of earned badges (emoji medallion on a tier-tinted glass
// chip + a tier glow), a count pill, and a staggered FadeInDown entrance. Self-
// contained: own data hook (getUserBadges), no shared primitive touched. Hidden
// entirely (renders nothing) when the member has no badges, so it never reads as a
// blank section.
function BadgeStrip({ userId }: { userId: string }) {
    const { colors, typography } = useTheme();

    const { data: badges } = useQuery({
        queryKey: ['user-badges', userId],
        queryFn: () => getUserBadges(userId),
        enabled: !!userId,
    });

    // No badges (or still loading / errored) → render nothing. The strip is a bonus
    // peak, not a required section, so an empty/locked member simply omits it rather
    // than showing an empty-state placeholder.
    if (!badges || badges.length === 0) return null;

    return (
        <Animated.View entering={FadeInDown.delay(90).duration(420)} style={styles.badgeSection}>
            <View style={styles.sectionHeader}>
                <Text style={[typography.overline, { color: colors.text.tertiary }]}>ACHIEVEMENTS</Text>
                <View style={[styles.badgeCountPill, { backgroundColor: withAlpha(colors.accent.coral, 0.14) }]}>
                    <Ionicons name="ribbon" size={11} color={colors.accent.coralLight} />
                    <Text style={[typography.captionMedium, { color: colors.accent.coralLight, fontSize: 11 }]}>
                        {badges.length}
                    </Text>
                </View>
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.badgeRow}
            >
                {badges.map((badge: Badge, i: number) => {
                    const tint = BADGE_TIER_COLOR[badge.tier] ?? BADGE_TIER_COLOR.bronze!;
                    return (
                        // One a11y node per badge — announces "<name> badge, <tier> tier,
                        // earned" rather than reading the bare emoji glyph. Cap the per-item
                        // stagger so a large collection still enters snappily.
                        <Animated.View
                            key={badge.id}
                            entering={FadeInDown.delay(140 + Math.min(i, 8) * 45).duration(360)}
                        >
                            <View
                                accessible
                                accessibilityRole="image"
                                accessibilityLabel={`${badge.name} badge, ${badge.tier} tier, earned`}
                                style={[
                                    styles.badgeChip,
                                    { backgroundColor: withAlpha(tint, 0.12), borderColor: withAlpha(tint, 0.4) },
                                    shadows.glow(tint),
                                ]}
                            >
                                <Text style={styles.badgeEmoji}>{badge.iconEmoji}</Text>
                            </View>
                            <Text
                                numberOfLines={1}
                                style={[typography.caption, { color: colors.text.tertiary, marginTop: 6, textAlign: 'center', maxWidth: 64 }]}
                            >
                                {badge.name}
                            </Text>
                        </Animated.View>
                    );
                })}
            </ScrollView>
        </Animated.View>
    );
}

export default function UserProfileScreen() {
    const { userId } = useLocalSearchParams<{ userId: string }>();
    const { colors, typography, borderRadius } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: profileResp, isLoading: profileLoading, isError: profileError, refetch: refetchProfile } = useQuery({
        queryKey: ['public-profile', userId],
        queryFn: () => getPublicProfile(userId || ''),
        enabled: !!userId,
    });

    const profile = profileResp?.data?.data || profileResp?.data;

    const { data: posts, isLoading: postsLoading, isError: postsError, refetch: refetchPosts } = useQuery({
        queryKey: ['user-posts', userId],
        queryFn: () => getUserPosts(userId || ''),
        enabled: !!userId,
    });

    // Follow-graph state (SOCIAL API CONTRACT): { isFollowing, followers, following }.
    const { data: social } = useQuery({
        queryKey: ['user-social', userId],
        queryFn: () => getUserSocial(userId || ''),
        enabled: !!userId,
    });

    // Optimistic override — state is USER INTENT only (react-state-fallback):
    // `undefined` means "the user hasn't toggled this session", so the displayed
    // values fall back to the server `social` reactively (a refetch updates them).
    // Once the user taps, their optimistic choice persists until the next refetch.
    const [override, setOverride] = useState<{ isFollowing: boolean; followers: number } | undefined>(undefined);
    const isFollowing = override?.isFollowing ?? social?.isFollowing ?? false;
    const followers = override?.followers ?? social?.followers ?? 0;
    const following = social?.following ?? 0;

    const followMutation = useMutation({
        mutationFn: (next: boolean) => (next ? followUser(userId || '') : unfollowUser(userId || '')),
        onSuccess: () => {
            // Instagram-style persistence: re-fetch the authoritative follow-graph so
            // the FOLLOWING state + follower/following counts reflect the server and
            // survive a refresh. Dropping the optimistic override lets the refetched
            // `social` become the single source of truth (the override was user-intent
            // only); the displayed state stays continuous because the optimistic value
            // already matches what the server now returns.
            setOverride(undefined);
            queryClient.invalidateQueries({ queryKey: ['user-social', userId] });
        },
        onError: (err) => {
            // Surface the failure (previously swallowed) and roll back to server truth
            // by dropping the optimistic override so the UI snaps back to reality.
            console.error('[userProfile] follow toggle failed', err);
            setOverride(undefined);
        },
    });

    const onToggleFollow = useCallback(() => {
        const base: UserSocial = social ?? { isFollowing, followers, following };
        const next = !isFollowing;
        // Optimistically flip + inc/dec the follower count from the current truth.
        setOverride({ isFollowing: next, followers: Math.max(0, (base.followers ?? 0) + (next ? 1 : -1)) });
        followMutation.mutate(next);
    }, [social, isFollowing, followers, following, followMutation]);

    // ONE hoisted press handler shared by every PostRow (list-performance-callbacks /
    // list-performance-function-references): rows invoke onOpen(post.id) — no new
    // closure is allocated per row per render. Opens the post detail at the canonical
    // /(community)/<id> route (same target as the community feed's comment tap).
    const openPost = useCallback((postId: string) => {
        router.push(`/(community)/${postId}` as any);
    }, [router]);

    // PEAK-END celebration — the avatar's lime ring pulses + glows the moment the
    // viewer follows this member (a proportional, transform/opacity-only spring; it
    // does NOT fire on initial load or on unfollow). Reanimated shared values, so the
    // halo lives entirely on the UI thread.
    const ringScale = useSharedValue(1);
    const ringGlow = useSharedValue(0);
    useEffect(() => {
        if (isFollowing) {
            ringScale.value = withSequence(
                withSpring(1.06, { damping: 9, stiffness: 220 }),
                withSpring(1, { damping: 14, stiffness: 220 }),
            );
            ringGlow.value = withSequence(withTiming(1, { duration: 240 }), withTiming(0, { duration: 900 }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFollowing]);
    const ringAnim = useAnimatedStyle(() => ({ transform: [{ scale: ringScale.value }] }));
    const glowAnim = useAnimatedStyle(() => ({ opacity: ringGlow.value }));

    // Private + not-yet-following → show name/avatar only, lock the rest.
    const isLocked = !!profile?.isPrivate && !isFollowing;

    // Shared header — transparent over the OLED bg, back affordance + overline title.
    const Header = (
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity
                activeOpacity={0.85}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => router.back()}
                style={[styles.headerBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
            >
                <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={[typography.overline, { color: colors.text.tertiary }]}>PROFILE</Text>
            <View style={styles.headerBtn} />
        </View>
    );

    if (profileLoading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <StatusBar style="light" />
                {Header}
                <View style={styles.profileSection}>
                    <Skeleton width={104} height={104} radius={52} />
                    <Skeleton width={180} height={30} radius={6} style={{ marginTop: 18 }} />
                    <Skeleton width={220} height={14} radius={4} style={{ marginTop: 12 }} />
                    <View style={[styles.statsCard, { borderColor: colors.border.default }]}>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <View key={i} style={styles.statPillar}>
                                <Skeleton width={40} height={28} radius={6} />
                                <Skeleton width={52} height={11} radius={4} style={{ marginTop: 6 }} />
                            </View>
                        ))}
                    </View>
                </View>
            </View>
        );
    }

    if (profileError || !profile) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
                <StatusBar style="light" />
                {Header}
                <EmptyState
                    icon={profileError ? 'cloud-offline-outline' : 'person-outline'}
                    title={profileError ? "Couldn't load profile" : 'User not found'}
                    subtitle={
                        profileError
                            ? "Something went wrong fetching this member's profile. Check your connection and try again."
                            : "This member's profile may have been removed or is no longer available."
                    }
                    actionLabel={profileError ? 'Try Again' : 'Go Back'}
                    onAction={profileError ? () => refetchProfile() : () => router.back()}
                    style={{ flex: 1 }}
                />
            </View>
        );
    }

    const displayName = (profile as any).displayName ?? ([(profile as any).firstName, (profile as any).lastName].filter(Boolean).join(' ') || 'Athlete');

    // Thumb-zone action bar — the ONE lime primary (Follow) reads as the hero
    // action; Message is the subordinate, neutral-glass secondary (10% restraint:
    // only one full-lime element on screen). Pinned above the safe area so the
    // primary tap target lives in the natural thumb arc; the ScrollView clears it.
    const actionBarHeight = 64 + insets.bottom;

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            {Header}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: actionBarHeight + 24 }}>
                {/* Profile hero */}
                <Animated.View
                    entering={FadeInDown.duration(440).springify().damping(18)}
                    style={styles.profileSection}
                >
                    <View style={styles.avatarWrap}>
                        {/* Celebration halo — fades in/out on follow (peak-end) */}
                        <Animated.View
                            pointerEvents="none"
                            style={[
                                styles.avatarHalo,
                                { borderColor: colors.accent.coral },
                                shadows.glow(colors.accent.coral),
                                glowAnim,
                            ]}
                        />
                        <Animated.View
                            style={[
                                styles.avatarRing,
                                {
                                    borderColor: isFollowing ? withAlpha(colors.accent.coral, 0.85) : withAlpha(colors.text.primary, 0.12),
                                    backgroundColor: colors.background.tertiary,
                                },
                                isFollowing ? shadows.glow(colors.accent.coral) : null,
                                ringAnim,
                            ]}
                        >
                            <Avatar uri={profile.avatarUrl} name={displayName} size={96} />
                        </Animated.View>
                        {/* Active-follow indicator dot — a key lime state signal (icon + colour, never colour alone) */}
                        {isFollowing ? (
                            <View style={[styles.followDot, { backgroundColor: colors.accent.coral, borderColor: colors.background.primary }]}>
                                <Ionicons name="checkmark" size={14} color={colors.text.inverse} />
                            </View>
                        ) : null}
                    </View>

                    <Text style={[typography.display, { color: colors.text.primary, marginTop: 16, fontSize: 30, textAlign: 'center' }]}>
                        {displayName}
                    </Text>

                    {isLocked ? (
                        <View style={[styles.privatePill, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                            <Ionicons name="lock-closed" size={12} color={colors.text.tertiary} />
                            <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 6 }]}>Private account</Text>
                        </View>
                    ) : profile.bio ? (
                        <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 8, marginHorizontal: 24, lineHeight: 22 }]}>
                            {profile.bio}
                        </Text>
                    ) : null}

                    {/* Big condensed stat triad — value dominates label */}
                    <GlassCard style={styles.statsCard} radius={borderRadius['2xl']}>
                        <View style={styles.statsRow}>
                            {/* A private, not-yet-followed account hides ALL three counts
                                (posts AND followers/following) behind '—'. Leaking real
                                follower/following totals on a profile you've deemed private
                                enough to hide posts is contradictory — mask the whole triad. */}
                            <StatPillar value={isLocked ? '—' : (posts?.length || 0)} label="POSTS" />
                            <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                            <StatPillar value={isLocked ? '—' : followers} label="FOLLOWERS" />
                            <View style={[styles.statDivider, { backgroundColor: colors.border.default }]} />
                            <StatPillar value={isLocked ? '—' : following} label="FOLLOWING" />
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* Activity — or a guiding locked state for a private, not-yet-followed account */}
                {isLocked ? (
                    <Animated.View entering={FadeInDown.delay(120).duration(420)} style={styles.lockedSection}>
                        <View
                            style={[
                                styles.lockCircle,
                                { backgroundColor: withAlpha(colors.accent.coral, 0.12), borderColor: withAlpha(colors.accent.coral, 0.24) },
                            ]}
                        >
                            <Ionicons name="lock-closed" size={36} color={colors.accent.coral} />
                        </View>
                        <Text style={[typography.h3, { color: colors.text.primary, marginTop: 18, textAlign: 'center' }]}>This account is private</Text>
                        <Text style={[typography.body, { color: colors.text.secondary, marginTop: 8, textAlign: 'center', maxWidth: 280, lineHeight: 22 }]}>
                            Follow {displayName} to unlock their posts, activity and achievements.
                        </Text>
                    </Animated.View>
                ) : (
                    <View style={styles.activitySection}>
                        {/* PEAK-END — celebratory earned-badge strip (delivers on the
                            locked-state promise of 'achievements'). Self-gating: renders
                            nothing when the member has no badges. */}
                        <BadgeStrip userId={userId || ''} />

                        <View style={styles.sectionHeader}>
                            <Text style={[typography.overline, { color: colors.text.tertiary }]}>RECENT ACTIVITY</Text>
                            {!postsLoading && !postsError && (posts?.length || 0) > 0 ? (
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>{posts?.length} {posts?.length === 1 ? 'post' : 'posts'}</Text>
                            ) : null}
                        </View>

                        {postsLoading ? (
                            <View>
                                {Array.from({ length: 2 }).map((_, i) => (
                                    <GlassCard key={i} style={styles.postCard} radius={borderRadius['2xl']}>
                                        <View style={styles.postBody}>
                                            <View style={styles.postHead}>
                                                <Skeleton width={36} height={36} radius={18} />
                                                <View style={styles.postHeadText}>
                                                    <Skeleton width={120} height={14} radius={4} />
                                                    <Skeleton width={70} height={11} radius={4} style={{ marginTop: 6 }} />
                                                </View>
                                            </View>
                                            <Skeleton width="100%" height={14} radius={4} />
                                            <Skeleton width="80%" height={14} radius={4} style={{ marginTop: 8 }} />
                                        </View>
                                    </GlassCard>
                                ))}
                            </View>
                        ) : postsError ? (
                            <EmptyState
                                icon="cloud-offline-outline"
                                title="Couldn't load posts"
                                subtitle="Something went wrong fetching these posts. Check your connection and try again."
                                actionLabel="Try Again"
                                onAction={() => refetchPosts()}
                            />
                        ) : posts?.length === 0 ? (
                            <EmptyState
                                icon="document-text-outline"
                                title="No posts yet"
                                subtitle={`${displayName} hasn't shared anything with the community yet. Check back soon.`}
                            />
                        ) : (
                            // Stable key=post.id (NOT array index — list-performance-item-memo);
                            // pass only primitives + the single hoisted `openPost` so React.memo
                            // can skip unchanged rows. No per-row object/style is allocated here.
                            posts?.map((post: Post, i: number) => (
                                <PostRow
                                    key={post.id}
                                    id={post.id}
                                    content={post.content}
                                    imageUrl={post.imageUrl}
                                    createdAt={post.createdAt}
                                    authorName={post.author?.name ?? displayName}
                                    authorAvatar={post.author?.avatarUrl ?? profile.avatarUrl ?? undefined}
                                    index={i}
                                    onOpen={openPost}
                                />
                            ))
                        )}
                    </View>
                )}
            </ScrollView>

            {/* Thumb-zone action bar — primary (Follow) + subordinate (Message), above the safe area */}
            <View
                style={[
                    styles.actionBar,
                    {
                        paddingBottom: insets.bottom + 10,
                        backgroundColor: withAlpha(colors.background.primary, 0.96),
                        borderTopColor: colors.border.default,
                    },
                ]}
            >
                {/* Full lime is spent on the ONE actionable acquire action (FOLLOW).
                    Once you already follow, the affordance is subtler — a tinted lime
                    glass with a lime check — so the 10% accent isn't burned on a
                    non-novel state. State is still conveyed by icon + treatment, never
                    colour alone, and the a11y label correctly reads 'Unfollow'. */}
                {isFollowing ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Unfollow this member"
                        accessibilityState={{ selected: true }}
                        onPress={onToggleFollow}
                        style={({ pressed }) => [
                            styles.followBtn,
                            styles.followingBtn,
                            {
                                backgroundColor: withAlpha(colors.accent.coral, 0.12),
                                borderColor: withAlpha(colors.accent.coral, 0.4),
                            },
                            pressed ? { transform: [{ scale: 0.97 }], opacity: 0.9 } : null,
                        ]}
                    >
                        <Ionicons name="checkmark" size={18} color={colors.accent.coralLight} />
                        <Text style={[typography.subhead, { color: colors.accent.coralLight, letterSpacing: 0.3 }]} maxFontSizeMultiplier={1.4}>
                            FOLLOWING
                        </Text>
                    </Pressable>
                ) : (
                    <CtaButton
                        label="FOLLOW"
                        icon="person-add"
                        accessibilityLabel="Follow this member"
                        onPress={onToggleFollow}
                        style={styles.followBtn}
                    />
                )}
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Message this member"
                    onPress={() => router.push(`/messages/${userId}` as any)}
                    style={({ pressed }) => [
                        styles.messageBtn,
                        { backgroundColor: colors.background.secondary, borderColor: colors.border.light },
                        pressed ? { transform: [{ scale: 0.97 }], opacity: 0.9 } : null,
                    ]}
                >
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.text.primary} />
                    <Text style={[typography.subhead, { color: colors.text.primary }]}>Message</Text>
                </Pressable>
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
        paddingBottom: 12,
    },
    headerBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    profileSection: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
    avatarWrap: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center' },
    avatarHalo: {
        position: 'absolute',
        width: 112,
        height: 112,
        borderRadius: 56,
        borderWidth: 2,
    },
    avatarRing: {
        width: 110,
        height: 110,
        borderRadius: 55,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    followDot: {
        position: 'absolute',
        right: 6,
        bottom: 6,
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 3,
        alignItems: 'center',
        justifyContent: 'center',
    },
    privatePill: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 9999,
        borderWidth: 1,
    },
    statsCard: {
        alignSelf: 'stretch',
        marginHorizontal: 20,
        marginTop: 22,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 18,
        paddingHorizontal: 8,
    },
    statPillar: { flex: 1, alignItems: 'center' },
    statDivider: { width: StyleSheet.hairlineWidth, height: 36 },
    activitySection: { paddingHorizontal: 20, paddingTop: 28 },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    // The strip is the first child of activitySection (which already supplies 28px of
    // top padding), so it adds no top padding of its own — only a gap below itself
    // before RECENT ACTIVITY. When the strip is null, RECENT ACTIVITY keeps its
    // natural 28px top with no leftover space.
    badgeSection: { marginBottom: 24 },
    badgeCountPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        minWidth: 30,
        height: 22,
        paddingHorizontal: 8,
        borderRadius: 11,
        justifyContent: 'center',
    },
    badgeRow: { gap: 14, paddingVertical: 4, paddingRight: 4 },
    badgeChip: {
        width: 60,
        height: 60,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeEmoji: { fontSize: 28 },
    lockedSection: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
    lockCircle: { width: 88, height: 88, borderRadius: 9999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    postCard: { marginBottom: 14 },
    postBody: { padding: 16, gap: 12 },
    postHead: { flexDirection: 'row', alignItems: 'center' },
    postHeadText: { flex: 1, marginLeft: 10 },
    postImg: { width: '100%', height: 200 },
    actionBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    followBtn: { flex: 1, borderRadius: 16 },
    // Subdued FOLLOWING affordance — matches the CtaButton footprint (minHeight 48)
    // so the bar height is identical in both states; tinted lime glass + lime check.
    followingBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 48,
        paddingVertical: 13,
        borderWidth: 1,
    },
    messageBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 48,
        paddingHorizontal: 20,
        borderRadius: 16,
        borderWidth: 1,
    },
});
