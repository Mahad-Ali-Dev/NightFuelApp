import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { GlassCard, CtaButton, DateTimeField, nowDateString } from '@/components/ui';
import { logPeriod } from '@/api/cycle';
import type { LogPeriodBody, CycleStatsResponse } from '@/api/cycle';

/**
 * LogPeriodCard — the "Log Period" action: a date picker (reusing the app's
 * DateTimeField) for the period start (+ an optional end), and a CTA that POSTs
 * to /v1/users/me/cycle/period.
 *
 * On success it INVALIDATES the forecast / history / status queries so the
 * calendar, the history card and the live cycle-phase card all refresh from the
 * server's freshly-learned stats.
 *
 * Allows logging TODAY or any PAST day (maximumDate = today); the optional end
 * date is bounded to >= the chosen start (matching the server's refine).
 */

/**
 * Parse a 'YYYY-MM-DD' string into a Date at LOCAL midnight (#12).
 *
 * The native date picker and DateTimeField's `seedDate` both interpret a
 * 'YYYY-MM-DD' value at the device's LOCAL midnight. Any bound we hand the
 * picker (`minimumDate`) must therefore also be local midnight, or it will be
 * compared against a differently-zoned instant. Building the bound with
 * `new Date('YYYY-MM-DDT00:00:00Z')` instead anchors it to UTC midnight, which
 * for a user BEHIND UTC (negative offset) resolves to the previous LOCAL day —
 * an off-by-one that wrongly allows an end date one day before the start.
 *
 * Using the `new Date(year, monthIndex, day)` constructor yields local midnight
 * regardless of the device timezone. Returns `undefined` for a malformed value
 * so the caller simply omits the bound (matching the empty-string behaviour).
 */
export function localMidnightFromDateString(value: string): Date | undefined {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return undefined;
    const year = Number(m[1]);
    const monthIndex = Number(m[2]) - 1; // JS months are 0-based
    const day = Number(m[3]);
    const d = new Date(year, monthIndex, day); // local midnight
    return Number.isNaN(d.getTime()) ? undefined : d;
}

// Coral period/cycle accent (the brand `accent.coral` token resolves to LIME
// post-rebrand, so coral is an explicit literal here).
const CORAL = '#FF7A90';

export interface LogPeriodCardProps {
    /** Called after a successful log (e.g. to surface a toast at the screen level). */
    onLogged?: (stats: CycleStatsResponse) => void;
}

export function LogPeriodCard({ onLogged }: LogPeriodCardProps) {
    const { colors, typography, borderRadius } = useTheme();
    const queryClient = useQueryClient();

    const [startDate, setStartDate] = useState<string>(nowDateString());
    const [endDate, setEndDate] = useState<string>('');

    const mutation = useMutation({
        mutationFn: (body: LogPeriodBody) => logPeriod(body),
        onError: (err: any) => {
            Alert.alert('Error', err?.response?.data?.message ?? err?.message ?? 'Could not log period');
        },
        onSuccess: (stats) => {
            // Refresh everything the cycle screen + phase card derive from.
            queryClient.invalidateQueries({ queryKey: ['cycle-forecast'] });
            queryClient.invalidateQueries({ queryKey: ['cycle-history'] });
            queryClient.invalidateQueries({ queryKey: ['my-status'] });
            // Clear the optional end so a subsequent log starts clean.
            setEndDate('');
            onLogged?.(stats);
        },
    });

    const handleSubmit = () => {
        if (!startDate) return;
        const body: LogPeriodBody = { startDate };
        if (endDate) body.endDate = endDate;
        mutation.mutate(body);
    };

    const today = new Date();

    // #12: bound the end-date picker to >= the chosen start. The picker (and
    // DateTimeField's seedDate) parse 'YYYY-MM-DD' at LOCAL midnight, so this
    // bound must be built at LOCAL midnight too. The previous
    // `new Date(`${startDate}T00:00:00Z`)` parsed UTC midnight, which for users
    // BEHIND UTC (negative offset) lands on the PREVIOUS local day — an
    // off-by-one that let them pick an end date one day before the start. Parse
    // the Y-M-D parts explicitly into a local Date to stay consistent.
    const minEndDate = startDate ? localMidnightFromDateString(startDate) : undefined;

    return (
        <GlassCard radius={borderRadius['2xl']} style={styles.card}>
            <View style={styles.inner}>
                <View style={styles.header}>
                    <Ionicons name="add-circle-outline" size={18} color={CORAL} />
                    <Text style={[typography.overline, styles.headerLabel, { color: colors.text.secondary }]}>
                        LOG PERIOD
                    </Text>
                </View>

                <View style={styles.field}>
                    <Text style={[typography.caption, styles.fieldLabel, { color: colors.text.secondary }]}>
                        Start date
                    </Text>
                    <DateTimeField
                        mode="date"
                        value={startDate}
                        onChange={setStartDate}
                        maximumDate={today}
                        accessibilityLabel="Period start date"
                        onNow={() => setStartDate(nowDateString())}
                    />
                </View>

                <View style={styles.field}>
                    <Text style={[typography.caption, styles.fieldLabel, { color: colors.text.secondary }]}>
                        End date (optional)
                    </Text>
                    <DateTimeField
                        mode="date"
                        value={endDate}
                        onChange={setEndDate}
                        maximumDate={today}
                        minimumDate={minEndDate}
                        accessibilityLabel="Period end date, optional"
                    />
                </View>

                <CtaButton
                    label="Log Period"
                    icon="checkmark-circle-outline"
                    onPress={handleSubmit}
                    loading={mutation.isPending}
                    disabled={!startDate || mutation.isPending}
                    testID="log-period-submit"
                    style={styles.cta}
                />
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    card: { marginTop: 12 },
    inner: { padding: 18 },
    header: { flexDirection: 'row', alignItems: 'center' },
    headerLabel: { marginLeft: 8, letterSpacing: 1 },
    field: { marginTop: 14 },
    fieldLabel: { marginBottom: 6, letterSpacing: 0.5 },
    cta: { marginTop: 18 },
});

export default LogPeriodCard;
