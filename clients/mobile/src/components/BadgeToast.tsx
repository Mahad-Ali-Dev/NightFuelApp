/**
 * BadgeToast — polls for unseen badges and displays a celebratory modal
 * when the user earns a new achievement.
 *
 * Mount this once in the root layout; it handles its own polling & state.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    Modal, View, Text, StyleSheet, TouchableOpacity,
    Animated, Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getUnseenBadges, type Badge } from '@/api/community';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

// ── Tier styling ──────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, { from: string; to: string; glow: string }> = {
    bronze:   { from: '#CD7F32', to: '#8B4513', glow: '#CD7F32' },
    silver:   { from: '#C0C0C0', to: '#808080', glow: '#A0A0A0' },
    gold:     { from: '#FFD700', to: '#FF8C00', glow: '#FFD700' },
    platinum: { from: '#A855F7', to: '#6D28D9', glow: '#A855F7' },
};

const POLL_INTERVAL_MS = 30_000; // 30 s

// ── Component ─────────────────────────────────────────────────────────────────

export default function BadgeToast() {
    const { colors, typography } = useTheme();
    const router = useRouter();
    const qc = useQueryClient();

    // Only poll while signed in. On the login/signup screens there is no token,
    // so an ungated poll 401s → the axios interceptor treats it as session-expired
    // and router.replace('/(auth)/login') remounts the screen mid-typing (the
    // "page reloads while I type slowly" bug). Gating on auth stops that entirely.
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    const [queue, setQueue] = useState<Badge[]>([]);
    const [visible, setVisible] = useState(false);
    const [current, setCurrent] = useState<Badge | null>(null);

    // Animations
    const scaleAnim  = useRef(new Animated.Value(0.7)).current;
    const opacAnim   = useRef(new Animated.Value(0)).current;
    const shineAnim  = useRef(new Animated.Value(-1)).current;

    // Poll for unseen badges
    // TanStack Query v5 removed `onSuccess` from useQuery — use useEffect instead.
    const { data: unseenBadges } = useQuery({
        queryKey: ['unseen-badges'],
        queryFn: getUnseenBadges,
        enabled: isAuthenticated,
        refetchInterval: POLL_INTERVAL_MS,
        refetchIntervalInBackground: false,
        retry: false,
    });

    // Enqueue new badges whenever the query delivers fresh data
    useEffect(() => {
        if (!unseenBadges || unseenBadges.length === 0) return;
        setQueue(prev => {
            // Avoid re-queuing duplicates already in the queue
            const existingIds = new Set(prev.map((b: Badge) => b.id));
            const fresh = unseenBadges.filter((b: Badge) => !existingIds.has(b.id));
            if (fresh.length === 0) return prev;
            // Invalidate badge lists so achievements screen refreshes
            qc.invalidateQueries({ queryKey: ['my-badges'] });
            qc.invalidateQueries({ queryKey: ['user-score'] });
            return [...prev, ...fresh];
        });
    }, [unseenBadges, qc]);

    // Pop next badge from queue when modal is not visible
    const showNext = useCallback(() => {
        setQueue(prev => {
            if (prev.length === 0) return prev;
            const [next, ...rest] = prev;
            setCurrent(next!);
            setVisible(true);
            return rest;
        });
    }, []);

    useEffect(() => {
        if (!visible && queue.length > 0) {
            // Small delay between successive badges
            const t = setTimeout(showNext, 600);
            return () => clearTimeout(t);
        }
    }, [visible, queue.length, showNext]);

    // Animate in when visible
    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
                Animated.timing(opacAnim,  { toValue: 1, duration: 250, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
            ]).start();

            // Shine sweep animation
            shineAnim.setValue(-1);
            Animated.loop(
                Animated.timing(shineAnim, { toValue: 1, duration: 2000, useNativeDriver: true, easing: Easing.linear }),
                { iterations: 3 },
            ).start();
        } else {
            scaleAnim.setValue(0.7);
            opacAnim.setValue(0);
        }
    }, [visible, opacAnim, scaleAnim, shineAnim]);

    const handleClose = () => {
        Animated.parallel([
            Animated.spring(scaleAnim, { toValue: 0.85, useNativeDriver: true }),
            Animated.timing(opacAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => setVisible(false));
    };

    const handleViewAll = () => {
        handleClose();
        setTimeout(() => router.push('/(community)/achievements' as any), 300);
    };

    if (!current) return null;

    const tier = TIER_COLORS[current.tier] ?? TIER_COLORS['bronze']!;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            {/* Backdrop */}
            <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose}>
                <Animated.View
                    style={[s.card, { opacity: opacAnim, transform: [{ scale: scaleAnim }] }]}
                    // Prevent touch pass-through on the card itself
                >
                    <TouchableOpacity activeOpacity={1} style={{ width: '100%' }}>
                        {/* Glowing background */}
                        <LinearGradient
                            colors={[withAlpha(tier.glow, 0.18), withAlpha(tier.glow, 0.04)]}
                            style={[s.cardInner, { backgroundColor: colors.background.secondary, borderColor: withAlpha(tier.glow, 0.5) }]}
                        >
                            {/* Shine sweep */}
                            <Animated.View
                                style={[
                                    s.shine,
                                    {
                                        transform: [{
                                            translateX: shineAnim.interpolate({
                                                inputRange: [-1, 1],
                                                outputRange: [-200, 400],
                                            }),
                                        }],
                                    },
                                ]}
                            />

                            {/* Close button */}
                            <TouchableOpacity style={s.closeBtn} onPress={handleClose} activeOpacity={0.85}>
                                <Ionicons name="close" size={18} color={colors.text.tertiary} />
                            </TouchableOpacity>

                            {/* "New Badge" header */}
                            <View style={[s.newLabel, { backgroundColor: withAlpha(tier.glow, 0.15), borderColor: withAlpha(tier.glow, 0.4) }]}>
                                <Text style={[typography.caption, { color: tier.glow, fontWeight: '800', letterSpacing: 2, fontSize: 10 }]}>
                                    NEW BADGE UNLOCKED
                                </Text>
                            </View>

                            {/* Badge emoji */}
                            <LinearGradient
                                colors={[tier.from, tier.to]}
                                style={s.emojiRing}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <Text style={s.emoji}>{current.iconEmoji}</Text>
                            </LinearGradient>

                            {/* Badge name & tier */}
                            <Text style={[typography.display, { color: colors.text.primary, fontSize: 24, fontWeight: '900', marginTop: 16, textAlign: 'center' }]}>
                                {current.name}
                            </Text>

                            <View style={[s.tierChip, { backgroundColor: withAlpha(tier.glow, 0.15), borderColor: withAlpha(tier.glow, 0.4) }]}>
                                <Text style={[typography.caption, { color: tier.glow, fontWeight: '800', fontSize: 10, letterSpacing: 1.5 }]}>
                                    {current.tier.toUpperCase()}
                                </Text>
                            </View>

                            <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: 10, marginHorizontal: 8, lineHeight: 22 }]}>
                                {current.description}
                            </Text>

                            {/* XP reward */}
                            {current.xpReward > 0 && (
                                <View style={[s.xpRow, { backgroundColor: withAlpha('#00D4FF', 0.1), borderColor: withAlpha('#00D4FF', 0.3) }]}>
                                    <Ionicons name="star" size={16} color="#00D4FF" />
                                    <Text style={[typography.subhead, { color: '#00D4FF', fontWeight: '800', marginLeft: 8 }]}>
                                        +{current.xpReward} XP
                                    </Text>
                                </View>
                            )}

                            {/* Actions */}
                            <View style={s.actions}>
                                <TouchableOpacity
                                    style={[s.viewAllBtn, { borderColor: withAlpha(colors.text.primary, 0.2) }]}
                                    onPress={handleViewAll}
                                    activeOpacity={0.85}
                                >
                                    <Text style={[typography.caption, { color: colors.text.secondary, fontWeight: '700' }]}>
                                        View Achievements
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[s.doneBtn, { backgroundColor: tier.glow }]}
                                    onPress={handleClose}
                                    activeOpacity={0.85}
                                >
                                    <Text style={[typography.caption, { color: '#FFF', fontWeight: '800' }]}>
                                        Awesome! 🎉
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 360,
    },
    cardInner: {
        borderRadius: 28,
        borderWidth: 1.5,
        padding: 28,
        alignItems: 'center',
        overflow: 'hidden',
    },
    shine: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 60,
        backgroundColor: 'rgba(255,255,255,0.06)',
        transform: [{ skewX: '-20deg' }],
    },
    closeBtn: {
        position: 'absolute',
        top: 16,
        right: 16,
        padding: 4,
    },
    newLabel: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
        marginBottom: 20,
    },
    emojiRing: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#FFD700',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
    },
    emoji: {
        fontSize: 48,
    },
    tierChip: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
        marginTop: 10,
    },
    xpRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        marginTop: 16,
    },
    actions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 24,
        width: '100%',
    },
    viewAllBtn: {
        flex: 1,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    doneBtn: {
        flex: 1,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
