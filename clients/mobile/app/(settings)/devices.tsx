import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { spacing, borderRadius as br } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard, CtaButton } from '@/components/ui';
import { PressableScale } from '@/components/ui/PressableScale';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { getHealthSyncAdapter, SUPPORTED_HEALTH_SOURCES } from '@/lib/healthSync';
import { HEALTH_SOURCE_LABELS, type HealthSource } from '@/lib/healthSync.types';

/**
 * Connected Devices screen.
 *
 * Reachable from Settings > Connected Devices and the More tab. Evolved off the
 * old static "coming soon" empty state onto the {@link getHealthSyncAdapter}
 * health-sync seam (`@/lib/healthSync`): it lists the three supported sources —
 * Apple Health, Google Fit / Health Connect, and a generic Bluetooth (BLE)
 * device — each as a GlassCard row with a subordinate lime-tint Connect control
 * and a Sync-now affordance, with a SINGLE full-lime primary CTA pinned in the
 * thumb zone below.
 *
 * HONEST GATE: the default adapter shipped in Expo Go is a NO-OP. `connect()`
 * and `syncNow()` resolve (they never throw) to a `{ status: 'unavailable',
 * reason }` result whose reason explains a native dev build is required. We
 * surface that reason verbatim — we NEVER fake a "Connected" state. Real
 * HealthKit / Health-Connect / BLE adapters slot in behind the same interface
 * in a later dev build with no change to this screen.
 *
 * The connection STATUS pill and the summary header are DERIVED live from the
 * adapter's `getStatus()` / `lastSyncedAt()` ground truth on each render — never
 * stored — so they can't drift. When no source is connected the screen leads
 * with an honest empty-state band guiding the user to connect a first device.
 *
 * ── Applied react-native-skills ────────────────────────────────────────────
 *   - rules/imports-design-system-folder.md: the glass card + lime CTA come
 *     from the `@/components/ui` design-system folder (GlassCard / CtaButton),
 *     never an inline SafeBlurView card or a hand-rolled lime LinearGradient.
 *   - rules/react-state-minimize.md + rules/state-ground-truth.md: the adapter
 *     is the ground truth. The ONLY state we keep is `messages` — the transient
 *     per-source `reason` from the user's last connect/sync attempt (user-action
 *     feedback, not a duplicate of connection state). Status and last-synced are
 *     DERIVED live from the adapter on each render, so they can't drift.
 *   - rules/rendering-no-falsy-and.md: the honest reason renders via an explicit
 *     ternary-null (`{message ? … : null}`) so an empty/undefined message yields
 *     `null` and can never leak a falsy ("" / 0) value into the JSX tree.
 *   - rules/ui-pressable.md: the back button, the per-row subordinate Connect
 *     and the Sync-now affordance all use the design-system `PressableScale`
 *     (transform-only 0.96 pressed-scale); the screen's ONE primary action is the
 *     pinned thumb-zone `CtaButton`. Every touch target meets the 44pt minimum
 *     (Connect/Sync minHeight:44 + hitSlop; back has hitSlop), and each carries
 *     honest a11y labels/state that reflect the adapter result rather than
 *     implying a connection.
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
 * here we only add the glyph + a platform-clarifying subtitle.
 *
 * COLOR RESTRAINT: source rows no longer carry a per-source BRAND tint. The
 * three icon badges render in one NEUTRAL treatment (text.secondary on glass)
 * so brand colour stays concentrated on STATE, not decoration — only the live
 * status pill carries functional colour, and a status-cyan ("connected") hue
 * can no longer be mistaken for a connection on an unavailable source. */
const SOURCE_META: Record<
    HealthSource,
    { icon: keyof typeof Ionicons.glyphMap; subtitle: string }
> = {
    apple_health: {
        icon: 'logo-apple',
        subtitle: 'iOS · HealthKit',
    },
    google_fit: {
        icon: 'logo-google',
        subtitle: 'Android · Health Connect',
    },
    generic_ble: {
        icon: 'bluetooth-outline',
        subtitle: 'Cross-platform · BLE wearable',
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
    /** Staggered entrance index — drives the FadeInDown delay for this card. */
    index: number;
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

/** A derived, presentation-ready view of a source's live connection status. The
 * STATUS comes from the adapter's `getStatus()` ground truth, mapped to a label,
 * a functional tint role and a glyph for the pill. */
function statusView(
    status: 'connected' | 'unavailable' | 'disconnected',
    colors: ReturnType<typeof useTheme>['colors'],
): { label: string; color: string; icon: keyof typeof Ionicons.glyphMap } {
    switch (status) {
        case 'connected':
            return { label: 'Connected', color: colors.accent.cyan, icon: 'checkmark-circle' };
        case 'unavailable':
            return { label: 'Unavailable', color: colors.warning, icon: 'alert-circle' };
        default:
            return { label: 'Not connected', color: colors.text.tertiary, icon: 'ellipse-outline' };
    }
}

/**
 * One health source as a GlassCard row. Memoised so a message update on a
 * sibling row doesn't re-render the rows that didn't change. It derives its
 * status + last-synced label live from the adapter (ground truth) rather than
 * storing them.
 */
const SourceRow = React.memo(function SourceRow({
    source,
    index,
    message,
    noticeKind,
    syncTick,
    onConnect,
    onSync,
}: SourceRowProps) {
    const { colors, typography } = useTheme();
    const meta = SOURCE_META[source];
    const name = HEALTH_SOURCE_LABELS[source];
    // Benign success-with-reason confirmations (e.g. "No new health data to
    // sync.") read in the functional SUCCESS role (cyan), not a decorative
    // brand tint — the user genuinely synced, so a real state colour fits.
    const infoColor = colors.accent.cyan;

    // Read `syncTick` so a plain success (which advances the adapter's
    // last-synced timestamp but changes no other prop for this row) still
    // re-renders this memoised row and re-derives the live label below (#7).
    void syncTick;

    // Ground truth — derived from the adapter on each render, never duplicated
    // into state. `getStatus()` drives the live connection pill; `lastSyncedAt()`
    // is an ISO string or null (→ "Never synced").
    const status = getHealthSyncAdapter().getStatus();
    const sv = statusView(status, colors);
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
        <Animated.View entering={FadeInDown.delay(120 + index * 60).springify().damping(18)}>
            <GlassCard radius={br.xl} style={styles.row}>
                <View style={styles.rowHeader}>
                    {/* Neutral icon badge (text.secondary on glass) — no brand
                        tint, so colour stays reserved for the status pill. */}
                    <View
                        style={[
                            styles.iconBadge,
                            {
                                backgroundColor: colors.background.tertiary,
                                borderColor: colors.border.default,
                            },
                        ]}
                    >
                        <Ionicons name={meta.icon} size={24} color={colors.text.secondary} />
                    </View>
                    <View style={styles.rowTitleBlock}>
                        <Text
                            style={[typography.h3, styles.rowTitle, { color: colors.text.primary }]}
                            numberOfLines={1}
                        >
                            {name}
                        </Text>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]} numberOfLines={1}>
                            {meta.subtitle}
                        </Text>
                    </View>
                    {/* Live connection status pill — derived from getStatus(). The
                        glyph backs the colour so status is never colour-only. */}
                    <View
                        style={[
                            styles.statusPill,
                            { backgroundColor: withAlpha(sv.color, 0.12), borderColor: withAlpha(sv.color, 0.3) },
                        ]}
                        accessible
                        accessibilityRole="text"
                        accessibilityLabel={`Status: ${sv.label}`}
                    >
                        <Ionicons name={sv.icon} size={12} color={sv.color} />
                        <Text style={[typography.overline, styles.statusText, { color: sv.color }]} numberOfLines={1}>
                            {sv.label}
                        </Text>
                    </View>
                </View>

                <View style={[styles.metaRow, { borderTopColor: colors.border.default }]}>
                    <Ionicons name="time-outline" size={14} color={colors.text.tertiary} />
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
                            // the functional SUCCESS role (cyan); an honest 'unavailable'
                            // reason keeps the warning styling. Default to warning.
                            isInfo
                                ? { backgroundColor: withAlpha(infoColor, 0.1), borderColor: withAlpha(infoColor, 0.25) }
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
                            color={isInfo ? infoColor : colors.warning}
                        />
                        <Text style={[typography.caption, styles.noticeText, { color: colors.text.secondary }]}>
                            {message}
                        </Text>
                    </View>
                ) : null}

                <View style={styles.actions}>
                    {/* SUBORDINATE 'Connect' — demoted from a full-lime CtaButton to
                        a lime-TINT outline control (≈10% fill + lime hairline +
                        lime icon/label), matching the retry / disable-all subordinate
                        recipe used across the settings screens. Full lime is the 10%
                        accent reserved for the ONE thumb-zone primary below; the three
                        per-row Connects must not each paint a solid-lime fill + glow.
                        PressableScale gives the house transform-only pressed-scale
                        (0.96). We keep the control pressable (never fake `disabled`)
                        so a tap on an unavailable source re-surfaces the honest reason;
                        the a11y label announces unavailability. */}
                    <PressableScale
                        onPress={() => onConnect(source)}
                        accessibilityRole="button"
                        accessibilityLabel={isUnavailable ? `Connect ${name}, currently unavailable` : `Connect ${name}`}
                        accessibilityState={{ disabled: false }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={[
                            styles.connectBtn,
                            {
                                backgroundColor: withAlpha(colors.accent.coral, 0.1),
                                borderColor: withAlpha(colors.accent.coral, 0.35),
                            },
                        ]}
                        testID={`connect-${source}`}
                    >
                        <Ionicons name="link-outline" size={16} color={colors.accent.coral} />
                        <Text style={[typography.caption, styles.connectLabel, { color: colors.accent.coral }]}>
                            Connect
                        </Text>
                    </PressableScale>
                    {/* PressableScale gives the Sync control the same transform-only
                        pressed-scale (0.96) as the rest of the system, replacing the
                        old activeOpacity fade (MOTION: transform/opacity only). */}
                    <PressableScale
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
                    </PressableScale>
                </View>
            </GlassCard>
        </Animated.View>
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
          // Defense-in-depth: the adapter contract is "never throw — failure is
          // a resolved { status:'unavailable', reason }". But a REAL native
          // adapter (HealthKit / Health Connect) could still throw or hang, and
          // an uncaught throw here would surface as a blank frozen screen the
          // user has to force-close. Wrapping the whole attempt guarantees every
          // outcome becomes an honest in-UI notice and the user can always leave.
          try {
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
          } catch {
            // The adapter threw (contract violation) or a native call blew up.
            // Convert it to the SAME honest "unavailable" notice the resolved-
            // failure path produces — never an uncaught throw, never a freeze.
            // The control stays pressable so the user can retry or just leave.
            setMessages((prev) => ({
                ...prev,
                [source]: 'This source is unavailable right now. Please try again.',
            }));
            setNoticeKinds((prev) => ({ ...prev, [source]: 'unavailable' }));
          }
        },
        [bumpSync],
    );

    const handleConnect = useCallback((source: HealthSource) => { void runAttempt(source, 'connect'); }, [runAttempt]);
    const handleSync = useCallback((source: HealthSource) => { void runAttempt(source, 'syncNow'); }, [runAttempt]);

    // The SINGLE thumb-zone primary action. The screen used to have THREE solid
    // lime per-row Connect buttons and no reachable primary; those rows are now
    // subordinate lime-tint controls, and this one pinned CtaButton is the lone
    // full-lime accent — the 10% brand colour spent on exactly one action. It
    // drives the same honest connect flow (reusing the per-row handler) on the
    // first supported source, so the no-op adapter still surfaces its real
    // "needs a dev build" reason on that row rather than faking a connection.
    // (Indexed access is `HealthSource | undefined` under strict config; the
    // list is statically the fixed three, so the footer simply no-ops if empty.)
    const primarySource = SUPPORTED_HEALTH_SOURCES[0];
    const handlePrimaryConnect = useCallback(() => {
        if (primarySource) handleConnect(primarySource);
    }, [handleConnect, primarySource]);

    // Derived summary (#state-ground-truth): the live connection status is read
    // from the adapter, never stored. `syncTick` is read so this recomputes
    // right after a successful attempt advances the adapter. With the no-op
    // adapter every source is 'unavailable' → connectedCount 0 → the empty-state
    // band leads the screen, honestly inviting the user to connect a first
    // device in a dev build.
    const connectedCount = useMemo(() => {
        void syncTick;
        return SUPPORTED_HEALTH_SOURCES.reduce(
            (n, source) => (getHealthSyncAdapter().getStatus() === 'connected' ? n + 1 : n),
            0,
        );
    }, [syncTick]);
    const total = SUPPORTED_HEALTH_SOURCES.length;
    const noneConnected = connectedCount === 0;

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />
            <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border.default }]}>
                {/* PressableScale gives the back control the house transform-only
                    pressed-scale (0.96), replacing the old activeOpacity fade so it
                    shares the same tactile feedback as the rest of the system. */}
                <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={() => router.back()}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </PressableScale>
                <Text style={[typography.heading, { color: colors.text.primary }]}>Connected Devices</Text>
                <View style={{ width: 24 }} />
            </View>

            {/* Contain any render/native fault in the body (e.g. an APK-only
                health-module failure) to a recoverable "Try again" card instead
                of a blank screen — the header above stays so Back always works,
                and ErrorBoundary.componentDidCatch reports the real error to
                Sentry so the root cause is diagnosable without adb logcat. */}
            <ErrorBoundary>
            <ScrollView
                contentContainerStyle={{
                    paddingHorizontal: spacing['2xl'],
                    paddingTop: spacing['2xl'],
                    // Extra bottom room so the last card clears the pinned
                    // thumb-zone CTA bar (footer height + its safe-area inset).
                    paddingBottom: spacing['5xl'],
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* Summary hero — the VALUE (connected count) dominates its label.
                    Derived live from the adapter; never stored. */}
                <Animated.View entering={FadeInDown.delay(40).springify().damping(18)}>
                    <GlassCard radius={br.xl} style={styles.summaryCard}>
                        <View style={styles.summaryTextBlock}>
                            <Text style={[typography.overline, { color: colors.text.tertiary }]}>HEALTH SOURCES</Text>
                            <View style={styles.summaryCountRow}>
                                <Text style={[typography.statMedium, { color: colors.text.primary }]}>
                                    {connectedCount}
                                </Text>
                                <Text style={[typography.subtitle, styles.summaryOf, { color: colors.text.tertiary }]}>
                                    / {total} connected
                                </Text>
                            </View>
                            <Text style={[typography.caption, styles.summaryHint, { color: colors.text.secondary }]}>
                                {noneConnected
                                    ? 'Sleep, heart rate & activity power your plan.'
                                    : 'Keeping your chrono-nutrition plan in sync.'}
                            </Text>
                        </View>
                        {/* Hero glyph in the CALM/info role (blue), not lime — lime
                            stays reserved for the single primary action. */}
                        <View
                            style={[
                                styles.summaryGlyph,
                                {
                                    backgroundColor: withAlpha(colors.accent.blue, 0.12),
                                    borderColor: withAlpha(colors.accent.blue, 0.28),
                                },
                            ]}
                        >
                            <Ionicons name="pulse" size={26} color={colors.accent.blue} />
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* Empty state — the source list is a fixed three and never empty,
                    but when NOTHING is connected we lead with an honest invitation
                    to connect a first device (icon + one-line guidance), then still
                    show the three source cards below so the CTA target is right
                    there. Never a blank screen. */}
                {noneConnected ? (
                    <Animated.View entering={FadeInDown.delay(80).springify().damping(18)}>
                        {/* Empty-state band in the CALM role (purple = "AI + calm"),
                            not lime — an informational guidance band shouldn't compete
                            with the single primary CTA for the lime accent. */}
                        <View
                            style={[
                                styles.emptyBand,
                                {
                                    backgroundColor: withAlpha(colors.accent.purple, 0.08),
                                    borderColor: withAlpha(colors.accent.purple, 0.22),
                                },
                            ]}
                            accessible
                            accessibilityRole="text"
                            accessibilityLabel="No devices connected yet. Connect a source below to sync sleep, heart rate, and activity."
                        >
                            <View
                                style={[
                                    styles.emptyIcon,
                                    {
                                        backgroundColor: withAlpha(colors.accent.purple, 0.12),
                                        borderColor: withAlpha(colors.accent.purple, 0.26),
                                    },
                                ]}
                            >
                                <Ionicons name="watch-outline" size={26} color={colors.accent.purple} />
                            </View>
                            <Text style={[typography.subtitle, styles.emptyTitle, { color: colors.text.primary }]}>
                                No devices connected yet
                            </Text>
                            <Text style={[typography.body, styles.emptyBody, { color: colors.text.secondary }]}>
                                Connect a source below to sync sleep, heart rate, and activity — and sharpen your
                                chrono-nutrition plan.
                            </Text>
                        </View>
                    </Animated.View>
                ) : null}

                {/* Grouped section: the available sources, under an overline. */}
                <Animated.View entering={FadeInDown.delay(100).springify().damping(18)}>
                    <Text style={[typography.overline, styles.sectionHeader, { color: colors.text.tertiary }]}>
                        AVAILABLE SOURCES
                    </Text>
                </Animated.View>

                {/* Static map of the three supported sources (see header note on
                    why this is not a FlatList). */}
                {SUPPORTED_HEALTH_SOURCES.map((source, index) => (
                    <SourceRow
                        key={source}
                        source={source}
                        index={index}
                        message={messages[source]}
                        noticeKind={noticeKinds[source]}
                        syncTick={syncTick}
                        onConnect={handleConnect}
                        onSync={handleSync}
                    />
                ))}

                {/* Honest privacy footnote — calms the "what happens to my data"
                    question, framed in the calm/info purple-blue role. */}
                <Animated.View entering={FadeInDown.delay(320).springify().damping(18)}>
                    <View style={styles.privacyRow}>
                        <Ionicons name="lock-closed-outline" size={14} color={colors.text.tertiary} />
                        <Text style={[typography.caption, styles.privacyText, { color: colors.text.tertiary }]}>
                            Health data stays on your device until you choose to sync it.
                        </Text>
                    </View>
                </Animated.View>
            </ScrollView>

            {/* Pinned thumb-zone primary — the screen's ONE full-lime action,
                anchored in the bottom third and above the safe-area inset so it's
                reachable one-handed. Context-aware label: invites a first
                connection when nothing is linked, else nudges keeping data fresh.
                This is the only solid-lime fill on the screen; the per-row
                Connects are subordinate lime-tint controls. */}
            <Animated.View
                entering={FadeInDown.delay(200).springify().damping(18)}
                style={[
                    styles.footer,
                    {
                        paddingBottom: insets.bottom + spacing.lg,
                        borderTopColor: colors.border.default,
                        backgroundColor: colors.background.primary,
                    },
                ]}
            >
                <CtaButton
                    label={noneConnected ? 'Connect a device' : 'Connect another device'}
                    icon="add-circle-outline"
                    onPress={handlePrimaryConnect}
                    accessibilityLabel={noneConnected ? 'Connect a device' : 'Connect another device'}
                    testID="connect-primary"
                />
            </Animated.View>
            </ErrorBoundary>
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

    // Summary hero
    summaryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.xl,
        marginBottom: spacing.xl,
    },
    summaryTextBlock: { flex: 1 },
    summaryCountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs },
    summaryOf: { marginLeft: spacing.sm },
    summaryHint: { marginTop: spacing.xs, lineHeight: 17 },
    summaryGlyph: {
        width: 52,
        height: 52,
        borderRadius: br.lg,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: spacing.lg,
    },

    // Empty-state band
    emptyBand: {
        alignItems: 'center',
        padding: spacing.xl,
        borderRadius: br.xl,
        borderWidth: 1,
        marginBottom: spacing.xl,
    },
    emptyIcon: {
        width: 56,
        height: 56,
        borderRadius: br.full,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.md,
    },
    emptyTitle: { textAlign: 'center' },
    emptyBody: { textAlign: 'center', marginTop: spacing.xs, lineHeight: 21, maxWidth: 300 },

    sectionHeader: { marginBottom: spacing.md },

    row: { padding: spacing.xl, marginBottom: spacing.lg },
    rowHeader: { flexDirection: 'row', alignItems: 'center' },
    iconBadge: {
        width: 48,
        height: 48,
        borderRadius: br.lg,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowTitleBlock: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
    rowTitle: { marginBottom: 1 },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xxs,
        borderRadius: br.full,
        borderWidth: 1,
    },
    statusText: { letterSpacing: 0.6 },
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
    // Subordinate lime-tint Connect control: flex:1 to lead the row, with the
    // same 44pt touch-target + outline footprint as the Sync control. The lime
    // tint fill / hairline / label colour are applied inline from theme tokens.
    connectBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        minHeight: 44,
        paddingHorizontal: spacing.lg,
        borderRadius: br.lg,
        borderWidth: 1,
    },
    connectLabel: { fontWeight: '700' },
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

    // Pinned thumb-zone primary CTA bar (single full-lime action).
    footer: {
        paddingHorizontal: spacing['2xl'],
        paddingTop: spacing.lg,
        borderTopWidth: StyleSheet.hairlineWidth,
    },

    privacyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        marginTop: spacing.md,
        paddingHorizontal: spacing.lg,
    },
    privacyText: { textAlign: 'center', lineHeight: 17 },
});
