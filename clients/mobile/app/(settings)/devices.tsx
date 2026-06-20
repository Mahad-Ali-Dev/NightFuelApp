import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard, CtaButton } from '@/components/ui';
import { getHealthSyncAdapter, SUPPORTED_HEALTH_SOURCES } from '@/lib/healthSync';
import { HEALTH_SOURCE_LABELS, type HealthSource } from '@/lib/healthSync.types';

/**
 * Connected Devices screen.
 *
 * Reachable from Settings > Connected Devices and the More tab. Evolved off the
 * old static "coming soon" empty state onto the {@link getHealthSyncAdapter}
 * health-sync seam (`@/lib/healthSync`): it lists the three supported sources —
 * Apple Health, Google Fit / Health Connect, and a generic Bluetooth (BLE)
 * device — each as a GlassCard row with a Connect CtaButton and a Sync-now
 * affordance.
 *
 * HONEST GATE: the default adapter shipped in Expo Go is a NO-OP. `connect()`
 * and `syncNow()` resolve (they never throw) to a `{ status: 'unavailable',
 * reason }` result whose reason explains a native dev build is required. We
 * surface that reason verbatim — we NEVER fake a "Connected" state. Real
 * HealthKit / Health-Connect / BLE adapters slot in behind the same interface
 * in a later dev build with no change to this screen.
 *
 * ── Applied react-native-skills ────────────────────────────────────────────
 *   - rules/imports-design-system-folder.md: the glass card + coral CTA come
 *     from the `@/components/ui` design-system folder (GlassCard / CtaButton),
 *     never an inline SafeBlurView card or a hand-rolled coral LinearGradient.
 *   - rules/react-state-minimize.md + rules/state-ground-truth.md: the adapter
 *     is the ground truth. The ONLY state we keep is `messages` — the transient
 *     per-source `reason` from the user's last connect/sync attempt (user-action
 *     feedback, not a duplicate of connection state). Status and last-synced are
 *     DERIVED live from the adapter on each render, so they can't drift.
 *   - rules/rendering-no-falsy-and.md: the honest reason renders via an explicit
 *     ternary-null (`{message ? … : null}`) so an empty/undefined message yields
 *     `null` and can never leak a falsy ("" / 0) value into the JSX tree.
 *   - rules/ui-pressable.md: the back button + Sync-now affordance are the
 *     surrounding screen's existing TouchableOpacity idiom; the primary Connect
 *     action is the design-system CtaButton (a Pressable under the hood). Both
 *     touch targets meet the 44pt minimum (Connect forwards minHeight:44, Sync
 *     has minHeight:44 + hitSlop), and both carry honest a11y labels/state that
 *     reflect the adapter result rather than implying a connection.
 *   - rules/list-performance-callbacks.md: the row press handlers
 *     (`handleConnect` / `handleSync`) are single hoisted `useCallback`
 *     instances that each row invokes with its own source id — no new callback
 *     per row per render.
 *
 * ── Why a static map of three, not a FlatList ──────────────────────────────
 * The source set is a fixed list of exactly three (`SUPPORTED_HEALTH_SOURCES`).
 * A FlatList buys nothing here — there is no virtualization win for three rows,
 * and nesting a VirtualizedList inside this header+ScrollView screen triggers
 * RN's nested-list warning. The work-item explicitly allows a documented static
 * `.map`, so we render the three rows inline and keep the handlers hoisted.
 */

/** Per-source presentation metadata. The display NAME is sourced from
 * {@link HEALTH_SOURCE_LABELS} (the single source of truth in the types module);
 * here we only add the glyph + a platform-clarifying subtitle. */
const SOURCE_META: Record<
    HealthSource,
    { icon: keyof typeof Ionicons.glyphMap; subtitle: string; tint: 'coral' | 'cyan' | 'blue' }
> = {
    apple_health: {
        icon: 'logo-apple',
        subtitle: 'iOS · HealthKit',
        tint: 'coral',
    },
    google_fit: {
        icon: 'logo-google',
        subtitle: 'Android · Health Connect',
        tint: 'cyan',
    },
    generic_ble: {
        icon: 'bluetooth-outline',
        subtitle: 'Cross-platform · BLE wearable',
        tint: 'blue',
    },
};

interface SourceRowProps {
    source: HealthSource;
    /** Transient reason from this source's last connect/sync attempt, if any. */
    message?: string;
    /** Hoisted, source-parameterised handlers (single instances). */
    onConnect: (source: HealthSource) => void;
    onSync: (source: HealthSource) => void;
}

/**
 * One health source as a GlassCard row. Memoised so a message update on a
 * sibling row doesn't re-render the rows that didn't change. It derives its
 * last-synced label live from the adapter (ground truth) rather than storing it.
 */
const SourceRow = React.memo(function SourceRow({ source, message, onConnect, onSync }: SourceRowProps) {
    const { colors, typography } = useTheme();
    const meta = SOURCE_META[source];
    const name = HEALTH_SOURCE_LABELS[source];
    const tintColor = colors.accent[meta.tint];

    // Ground truth — derived from the adapter on each render, never duplicated
    // into state. `lastSyncedAt()` is an ISO string or null (→ "Never synced").
    const lastSynced = getHealthSyncAdapter().lastSyncedAt();
    const lastSyncedLabel = lastSynced ? formatLastSynced(lastSynced) : 'Never synced';

    // Did this source's last connect/sync attempt come back non-connected (i.e.
    // the adapter surfaced an honest reason)? Drives the a11y state on BOTH
    // affordances so a screen reader announces the unavailable result instead of
    // implying a working connection. The controls stay pressable on purpose —
    // pressing re-surfaces the honest reason; we never fake `disabled`.
    const hasNotice = !!message;

    return (
        <GlassCard radius={br.xl} style={styles.row}>
            <View style={styles.rowHeader}>
                <View
                    style={[
                        styles.iconBadge,
                        {
                            backgroundColor: withAlpha(tintColor, 0.12),
                            borderColor: withAlpha(tintColor, 0.28),
                        },
                    ]}
                >
                    <Ionicons name={meta.icon} size={22} color={tintColor} />
                </View>
                <View style={styles.rowTitleBlock}>
                    <Text style={[typography.body, styles.rowTitle, { color: colors.text.primary }]} numberOfLines={1}>
                        {name}
                    </Text>
                    <Text style={[typography.caption, { color: colors.text.tertiary }]} numberOfLines={1}>
                        {meta.subtitle}
                    </Text>
                </View>
            </View>

            <View style={[styles.metaRow, { borderTopColor: colors.border.default }]}>
                <Ionicons name="sync-outline" size={14} color={colors.text.tertiary} />
                <Text style={[typography.caption, styles.metaText, { color: colors.text.secondary }]}>
                    {lastSyncedLabel}
                </Text>
            </View>

            {/* Honest unavailable reason (or any non-connected result). Rendered
                with an explicit ternary-null per rules/rendering-no-falsy-and.md:
                `message` is a string, so an empty/undefined value yields `null`
                (never a falsy 0/"" leaked into the JSX tree). */}
            {message ? (
                <View
                    style={[
                        styles.noticeBox,
                        {
                            backgroundColor: withAlpha(colors.warning, 0.1),
                            borderColor: withAlpha(colors.warning, 0.25),
                        },
                    ]}
                    // Group the icon + reason into ONE accessible alert unit so a
                    // screen reader announces the honest reason as a single live
                    // region (and the node is reachable by role="alert"). The label
                    // mirrors the visible reason so the announcement is verbatim.
                    accessible
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={message}
                >
                    <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
                    <Text style={[typography.caption, styles.noticeText, { color: colors.text.secondary }]}>
                        {message}
                    </Text>
                </View>
            ) : null}

            <View style={styles.actions}>
                <CtaButton
                    label="Connect"
                    icon="link-outline"
                    size="sm"
                    onPress={() => onConnect(source)}
                    // Honest label: once an attempt has surfaced a reason, the
                    // label announces the source is unavailable rather than
                    // implying a connection. The CtaButton primitive owns its own
                    // accessibilityRole="button" + accessibilityState.disabled (it
                    // takes only a label), so we reflect the adapter result through
                    // the label. We do NOT pass disabled — the control stays
                    // pressable so a tap re-surfaces the honest reason.
                    accessibilityLabel={hasNotice ? `Connect ${name}, currently unavailable` : `Connect ${name}`}
                    // sm's intrinsic minHeight is 40; connectBtn forwards
                    // minHeight:44 (merged last in CtaButton, so it wins) to meet
                    // the 44pt touch-target minimum alongside the Sync control.
                    style={styles.connectBtn}
                    testID={`connect-${source}`}
                />
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => onSync(source)}
                    accessibilityRole="button"
                    // Honest label + state reflecting the adapter result: when the
                    // last attempt was non-connected the label announces it, and
                    // the hint explains what a press does. `disabled` stays false
                    // on purpose — the control is pressable so a tap re-surfaces
                    // the honest reason; we never fake a disabled/connected state.
                    accessibilityLabel={hasNotice ? `Sync ${name} now, currently unavailable` : `Sync ${name} now`}
                    accessibilityHint={`Attempts to sync ${name} and shows the result`}
                    accessibilityState={{ disabled: false }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={[styles.syncBtn, { borderColor: colors.border.light }]}
                    testID={`sync-${source}`}
                >
                    <Ionicons name="refresh-outline" size={16} color={colors.text.secondary} />
                    <Text style={[typography.caption, styles.syncLabel, { color: colors.text.secondary }]}>
                        Sync now
                    </Text>
                </TouchableOpacity>
            </View>
        </GlassCard>
    );
});

/** Render an ISO-8601 timestamp as a short "Last synced …" label. Defensive: an
 * unparseable string falls back to the raw value rather than throwing. */
function formatLastSynced(iso: string): string {
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return `Last synced ${iso}`;
    const d = new Date(ts);
    return `Last synced ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ConnectedDevicesScreen() {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // The ONLY UI state: the transient per-source reason from the user's last
    // connect/sync attempt. Keyed by source; absent = no attempt yet. Connection
    // status / last-synced are NOT stored here — they are the adapter's ground
    // truth and are derived live in each row.
    const [messages, setMessages] = useState<Partial<Record<HealthSource, string>>>({});

    // Single hoisted instances (rules/list-performance-callbacks.md): each row
    // calls these with its own source id rather than getting a fresh closure.
    // The adapter NEVER throws — it resolves a HealthSyncResult whose status is
    // 'unavailable' on a no-native-module build — so a non-connected result is
    // surfaced as DATA (the honest reason), never a fake success.
    const runAttempt = useCallback(
        async (source: HealthSource, op: 'connect' | 'syncNow') => {
            const adapter = getHealthSyncAdapter();
            const result = op === 'connect' ? await adapter.connect() : await adapter.syncNow();
            if (result.status === 'connected') {
                // A real adapter connected — clear any stale notice for this row.
                setMessages((prev) => {
                    if (!prev[source]) return prev;
                    const next = { ...prev };
                    delete next[source];
                    return next;
                });
                return;
            }
            // Honest fallback: surface the adapter's reason verbatim (it explains
            // a native dev build is required). Fall back to a plain sentence if a
            // future adapter omits the reason — but NEVER claim "Connected".
            setMessages((prev) => ({
                ...prev,
                [source]: result.reason ?? 'This source is unavailable on the current build.',
            }));
        },
        [],
    );

    const handleConnect = useCallback((source: HealthSource) => { void runAttempt(source, 'connect'); }, [runAttempt]);
    const handleSync = useCallback((source: HealthSource) => { void runAttempt(source, 'syncNow'); }, [runAttempt]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border.default }]}>
                <TouchableOpacity
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={() => router.back()}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Connected Devices</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView
                contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: insets.bottom + spacing['3xl'] }}
                showsVerticalScrollIndicator={false}
            >
                <Text style={[typography.body, styles.intro, { color: colors.text.secondary }]}>
                    Sync sleep, heart rate, and activity from a wearable or health app to sharpen your chrono-nutrition
                    plan. Connect a source below.
                </Text>

                {/* Static map of the three supported sources (see header note on
                    why this is not a FlatList). */}
                {SUPPORTED_HEALTH_SOURCES.map((source) => (
                    <SourceRow
                        key={source}
                        source={source}
                        message={messages[source]}
                        onConnect={handleConnect}
                        onSync={handleSync}
                    />
                ))}
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
        paddingBottom: spacing.lg,
        borderBottomWidth: 1,
    },
    intro: { lineHeight: 21, marginBottom: spacing.xl },
    row: { padding: spacing.xl, marginBottom: spacing.lg },
    rowHeader: { flexDirection: 'row', alignItems: 'center' },
    iconBadge: {
        width: 44,
        height: 44,
        borderRadius: br.lg,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowTitleBlock: { flex: 1, marginLeft: spacing.md },
    rowTitle: { fontWeight: '700', marginBottom: 2 },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: spacing.lg,
        paddingTop: spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    metaText: { marginLeft: spacing.xs },
    noticeBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: br.md,
        borderWidth: 1,
    },
    noticeText: { flex: 1, lineHeight: 18 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
    // flex:1 to share the row; minHeight:44 lifts the sm CtaButton's intrinsic
    // 40 to the 44pt touch-target minimum (forwarded style merges last in
    // CtaButton, so it wins). Matches the Sync control's 44.
    connectBtn: { flex: 1, minHeight: 44 },
    syncBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        minHeight: 44,
        paddingHorizontal: spacing.lg,
        borderRadius: br.lg,
        borderWidth: 1,
    },
    syncLabel: { fontWeight: '600' },
});
