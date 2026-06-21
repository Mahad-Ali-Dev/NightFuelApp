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

/**
 * What KIND of notice a row's current `message` is (#11):
 *   - 'unavailable' → a non-connected result (honest error; drives the warning
 *     styling + "currently unavailable" a11y names).
 *   - 'info'        → a CONNECTED result that carried a reason, e.g. 'No new
 *     health data to sync.' — a benign confirmation; the user IS connected, so
 *     the controls must NOT announce "unavailable".
 */
type NoticeKind = 'unavailable' | 'info';

interface SourceRowProps {
    source: HealthSource;
    /** Transient reason from this source's last connect/sync attempt, if any. */
    message?: string;
    /** Whether `message` is an honest error or a benign success confirmation. */
    noticeKind?: NoticeKind;
    /**
     * Monotonic token bumped after every successful attempt (#7). Read here only
     * so a plain success (which changes no other prop for this row) still
     * re-renders the memoised row and re-derives the live lastSyncedAt() label.
     */
    syncTick?: number;
    /** Hoisted, source-parameterised handlers (single instances). */
    onConnect: (source: HealthSource) => void;
    onSync: (source: HealthSource) => void;
}

/**
 * One health source as a GlassCard row. Memoised so a message update on a
 * sibling row doesn't re-render the rows that didn't change. It derives its
 * last-synced label live from the adapter (ground truth) rather than storing it.
 */
const SourceRow = React.memo(function SourceRow({
    source,
    message,
    noticeKind,
    syncTick,
    onConnect,
    onSync,
}: SourceRowProps) {
    const { colors, typography } = useTheme();
    const meta = SOURCE_META[source];
    const name = HEALTH_SOURCE_LABELS[source];
    const tintColor = colors.accent[meta.tint];

    // Read `syncTick` so a plain success (which advances the adapter's
    // last-synced timestamp but changes no other prop for this row) still
    // re-renders this memoised row and re-derives the live label below (#7).
    void syncTick;

    // Ground truth — derived from the adapter on each render, never duplicated
    // into state. `lastSyncedAt()` is an ISO string or null (→ "Never synced").
    const lastSynced = getHealthSyncAdapter().lastSyncedAt();
    const lastSyncedLabel = lastSynced ? formatLastSynced(lastSynced) : 'Never synced';

    // Did this source's last attempt come back NON-connected (an honest
    // unavailable reason)? Drives the "currently unavailable" a11y names on both
    // affordances so a screen reader announces the unavailable result instead of
    // implying a working connection. A benign 'info' confirmation (a CONNECTED
    // result that carried a reason, e.g. "No new health data to sync.") is NOT
    // unavailable — the user IS connected — so it must not flip these to
    // "unavailable". The controls stay pressable either way; we never fake
    // `disabled`.
    const isUnavailable = noticeKind === 'unavailable';
    const isInfo = noticeKind === 'info';

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
                        // Benign 'info' confirmation (success-with-reason, #11) uses
                        // the source tint; an honest 'unavailable' reason keeps the
                        // warning styling. Default to warning for safety.
                        isInfo
                            ? { backgroundColor: withAlpha(tintColor, 0.1), borderColor: withAlpha(tintColor, 0.25) }
                            : { backgroundColor: withAlpha(colors.warning, 0.1), borderColor: withAlpha(colors.warning, 0.25) },
                    ]}
                    // Group the icon + reason into ONE accessible unit so a screen
                    // reader announces the reason as a single live region. An
                    // unavailable reason is an 'alert'; a benign confirmation is a
                    // non-urgent 'status'. The label mirrors the visible reason so
                    // the announcement is verbatim.
                    accessible
                    accessibilityRole={isInfo ? 'text' : 'alert'}
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={message}
                    testID={`notice-${source}`}
                >
                    <Ionicons
                        name={isInfo ? 'checkmark-circle-outline' : 'information-circle-outline'}
                        size={16}
                        color={isInfo ? tintColor : colors.warning}
                    />
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
                    accessibilityLabel={isUnavailable ? `Connect ${name}, currently unavailable` : `Connect ${name}`}
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
                    accessibilityLabel={isUnavailable ? `Sync ${name} now, currently unavailable` : `Sync ${name} now`}
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

    // A monotonic render token bumped after every SUCCESSFUL attempt (#7). The
    // last-synced label is DERIVED live from the adapter (ground truth), not
    // stored — but a plain success with no prior notice changes no other state,
    // so the memoised row would not re-render and the "Last synced …" label
    // would stay stale. Passing this token to each row (a prop it reads via
    // dependency, see SourceRow) forces the memoised row to re-derive
    // lastSyncedAt() right after a successful sync. It carries no meaning beyond
    // "the adapter may have advanced; re-read it".
    const [syncTick, setSyncTick] = useState(0);
    const bumpSync = useCallback(() => setSyncTick((t) => t + 1), []);

    // Classifies the current notice on each row (#11). A non-connected result is
    // an honest 'unavailable' error (drives the "currently unavailable" a11y
    // names + warning styling). A CONNECTED result that still carries a reason
    // (e.g. 'No new health data to sync.') is a benign 'info' confirmation —
    // the user DID connect/sync, so the controls must NOT announce "unavailable".
    const [noticeKinds, setNoticeKinds] = useState<Partial<Record<HealthSource, NoticeKind>>>({});

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
                // A real adapter connected/synced. Two cases:
                //  (b #11) A successful sync can still carry a reason — e.g.
                //    'No new health data to sync.' (healthSyncNative). That is a
                //    benign confirmation, NOT an unavailable error, so surface it
                //    briefly so the user gets feedback instead of silence.
                //  (a #7) Otherwise it's a plain success: drop any stale notice
                //    AND bump a render token so the lastSyncedAt-derived label
                //    (ground truth from the adapter) re-reads now that the
                //    adapter advanced its last-synced timestamp. (Without this,
                //    a success with no prior notice changed no state, so the
                //    "Last synced …" label stayed stale until the next render.)
                if (result.reason) {
                    setMessages((prev) => ({ ...prev, [source]: result.reason as string }));
                    setNoticeKinds((prev) => ({ ...prev, [source]: 'info' }));
                } else {
                    setMessages((prev) => {
                        if (!prev[source]) return prev;
                        const next = { ...prev };
                        delete next[source];
                        return next;
                    });
                    setNoticeKinds((prev) => {
                        if (!prev[source]) return prev;
                        const next = { ...prev };
                        delete next[source];
                        return next;
                    });
                }
                // Force a re-render so each row re-derives lastSyncedAt() (and the
                // success-with-reason rows above adopt the confirmation).
                bumpSync();
                return;
            }
            // Honest fallback: surface the adapter's reason verbatim (it explains
            // a native dev build is required). Fall back to a plain sentence if a
            // future adapter omits the reason — but NEVER claim "Connected".
            setMessages((prev) => ({
                ...prev,
                [source]: result.reason ?? 'This source is unavailable on the current build.',
            }));
            setNoticeKinds((prev) => ({ ...prev, [source]: 'unavailable' }));
        },
        [bumpSync],
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
                        noticeKind={noticeKinds[source]}
                        syncTick={syncTick}
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
