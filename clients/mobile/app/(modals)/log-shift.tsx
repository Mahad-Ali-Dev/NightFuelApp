import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Switch, InputAccessoryView, Keyboard } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { create as createShift } from '@/api/shifts';
import { Button, DateTimeField, nowDateString, nowTimeString } from '@/components/ui';
import { ShiftTypeCard } from '@/components/ShiftTypeCard';
import { withAlpha } from '@/theme/utils';
import { typography as themeTypography } from '@/theme/typography';
// Static tokens for the module-scope StyleSheet (cannot call useTheme() there).
import { spacing as space, borderRadius as br } from '@/theme/spacing';
import { format } from 'date-fns';
import { getErrorMessage } from '@/utils/validation';
import {
    validateLogShiftForm,
    isOvernightShift,
    fieldErrorsFromAxiosError,
} from '@/lib/logFormSchemas';

// Shift types — `value`/`label` are unchanged from the original contract. Each
// type now also carries a glanceable `icon`, a one-word `hint`, and a functional
// accent `tintKey` (resolved off the theme at render) so the picker reads as a
// set of distinct, type-tinted cards. Lime stays reserved for the primary CTA.
const SHIFT_TYPES = [
    { value: 'FIXED_NIGHT', label: 'Fixed Night', icon: 'moon', hint: 'Overnight', tintKey: 'purple' as const },
    { value: 'ROTATING', label: 'Rotating', icon: 'sync', hint: 'Shifts vary', tintKey: 'cyan' as const },
    { value: 'SPLIT', label: 'Split Shift', icon: 'contrast', hint: 'Two blocks', tintKey: 'blue' as const },
    { value: 'IRREGULAR', label: 'Irregular', icon: 'shuffle', hint: 'On-call', tintKey: 'amber' as const },
    { value: 'TWELVE_HOUR', label: '12-Hour Shift', icon: 'hourglass', hint: 'Long day', tintKey: 'orange' as const },
] as const;

// iOS number-pad has no built-in return/dismiss key. We attach a "Done" bar via
// InputAccessoryView (iOS-only) so the Commute field can be dismissed with one
// tap — real friction relief for a 3am logging flow.
const COMMUTE_ACCESSORY_ID = 'log-shift-commute-accessory';

export default function LogShiftModal() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();

    const today = format(new Date(), 'yyyy-MM-dd');
    const [shiftDate, setShiftDate] = useState(today);
    const [startTime, setStartTime] = useState('19:00');
    const [endTime, setEndTime] = useState('07:00');
    const [shiftType, setShiftType] = useState('FIXED_NIGHT');
    const [isDayOff, setIsDayOff] = useState(false);
    const [commuteMinutes, setCommuteMinutes] = useState('30');
    // Inline field-level error copy, e.g. { commuteMinutes: 'Commute must be 0-180 minutes' }.
    // Populated by the client-side validator before we hit the network and by
    // the server-error adapter when the API returns a Zod ValidationError 400.
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const mutation = useMutation({
        mutationFn: async () => {
            // Handle overnight shift logical end date — kept identical to the
            // previous inline computation, but now via the shared helper so
            // unit tests can exercise it without rendering the screen.
            let endDate = shiftDate;
            if (isOvernightShift(startTime, endTime)) {
                const nextDay = new Date(shiftDate);
                nextDay.setDate(nextDay.getDate() + 1);
                endDate = format(nextDay, 'yyyy-MM-dd');
            }
            const startStr = `${shiftDate}T${startTime}:00.000`;
            const endStr = `${endDate}T${endTime}:00.000`;

            const payload: any = {
                shiftDate,
                startTime: new Date(startStr).toISOString(),
                endTime: new Date(endStr).toISOString(),
                shiftType,
                isDayOff,
                commuteMinutes: parseInt(commuteMinutes, 10) || 0,
            };

            return createShift(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['current-shift'] });
            queryClient.invalidateQueries({ queryKey: ['shifts'] });
            // The dashboard NextShiftCard countdown reads a separate key
            // (['shifts-upcoming'] — app/(tabs)/index.tsx) off api/shifts.list,
            // not ['shifts']. Without this it stays stale until refocus/staleTime
            // after saving a new upcoming shift. A refetch of an already-fresh
            // list is a harmless no-op.
            queryClient.invalidateQueries({ queryKey: ['shifts-upcoming'] });
            router.back();
        },
        onError: (err) => {
            // Prefer inline field-level errors over an opaque Alert when the
            // server returned a Zod ValidationError (400). 5xx and network
            // errors still fall through to the Alert.
            const fromServer = fieldErrorsFromAxiosError(err);
            if (fromServer) {
                setFieldErrors(fromServer);
                return;
            }
            Alert.alert('Error', getErrorMessage(err));
        }
    });

    const handleSave = () => {
        const result = validateLogShiftForm({
            shiftDate,
            startTime,
            endTime,
            shiftType,
            isDayOff,
            commuteMinutes,
        });
        if (!result.ok) {
            setFieldErrors(result.fieldErrors);
            return;
        }
        // Clear any stale errors from a previous failed attempt before firing.
        setFieldErrors({});
        mutation.mutate();
    };

    const hasErrors = Object.keys(fieldErrors).length > 0;

    // Drop a single field error as the user edits that field — keeps the red
    // helper text from lingering once the user has obviously moved on. Same
    // immutable-omit lifecycle the original inline handlers used.
    const clearFieldError = (key: string) => {
        setFieldErrors((prev) => {
            if (!prev[key]) return prev;
            const { [key]: _omit, ...rest } = prev;
            return rest;
        });
    };

    // Whether the current start/end pair rolls past midnight — surfaced as a
    // small, reassuring "next day" chip so tired users trust the entry.
    const overnight = isOvernightShift(startTime, endTime);

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            <StatusBar style="light" />

            {/* Sheet dismiss affordance — drag handle */}
            <View style={styles.handleWrap} pointerEvents="none">
                <View style={[styles.handle, { backgroundColor: colors.border.light }]} />
            </View>

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default, backgroundColor: colors.background.primary }]}>
                <TouchableOpacity
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    onPress={() => router.back()}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={[styles.iconBtn, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}
                >
                    <Ionicons name="close" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.h3, { color: colors.text.primary }]}>Log Shift</Text>
                {/* Quiet header Save — the lime CTA in the thumb zone is the primary
                    action; this stays as a low-emphasis text affordance. Handler,
                    disabled/busy state and a11y contract are preserved exactly. */}
                <TouchableOpacity
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={mutation.isPending ? 'Saving shift' : 'Save shift'}
                    accessibilityState={{ disabled: mutation.isPending, busy: mutation.isPending }}
                    onPress={handleSave}
                    disabled={mutation.isPending}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.headerSave}
                >
                    {mutation.isPending ? (
                        <ActivityIndicator size="small" color={colors.text.secondary} />
                    ) : (
                        <Text
                            style={[
                                typography.subhead,
                                { color: hasErrors ? colors.text.tertiary : colors.text.secondary },
                            ]}
                        >
                            Save
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                    contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing['4xl'] }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <Animated.Text
                        entering={FadeInDown.duration(360)}
                        style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['2xl'], lineHeight: 22 }]}
                    >
                        Enter your upcoming or completed shift to align circadian recommendations.
                    </Animated.Text>

                    {/* ── Schedule ─────────────────────────────────────────── */}
                    <Animated.View entering={FadeInDown.delay(40).duration(360)}>
                        <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.md }]}>SCHEDULE</Text>

                        <DateTimeField
                            label="Shift Date"
                            mode="date"
                            value={shiftDate}
                            onChange={(v) => {
                                setShiftDate(v);
                                clearFieldError('shiftDate');
                            }}
                            onNow={() => {
                                setShiftDate(nowDateString());
                                clearFieldError('shiftDate');
                            }}
                            error={fieldErrors.shiftDate}
                        />
                        {/* DateTimeField owns the error text + a11y alert internally; the
                            screen only reserves the inter-field gap (token, on-grid). */}
                        <View style={{ height: spacing.lg }} />

                        {/* Times */}
                        <View style={styles.row}>
                            <View style={{ flex: 1 }}>
                                <DateTimeField
                                    label="Start Time"
                                    mode="time"
                                    value={startTime}
                                    onChange={(v) => {
                                        setStartTime(v);
                                        clearFieldError('startTime');
                                    }}
                                    onNow={() => {
                                        setStartTime(nowTimeString());
                                        clearFieldError('startTime');
                                    }}
                                    error={fieldErrors.startTime}
                                />
                                {/* Error text + a11y alert rendered by DateTimeField itself. */}
                            </View>
                            <View style={{ flex: 1, marginLeft: spacing.md }}>
                                <DateTimeField
                                    label="End Time"
                                    mode="time"
                                    value={endTime}
                                    onChange={(v) => {
                                        setEndTime(v);
                                        clearFieldError('endTime');
                                    }}
                                    onNow={() => {
                                        setEndTime(nowTimeString());
                                        clearFieldError('endTime');
                                    }}
                                    error={fieldErrors.endTime}
                                />
                                {/* Error text + a11y alert rendered by DateTimeField itself. */}
                            </View>
                        </View>

                        {/* Overnight reassurance chip */}
                        {overnight ? (
                            <View style={[styles.overnightChip, { backgroundColor: withAlpha(colors.accent.purple, 0.12), borderColor: withAlpha(colors.accent.purple, 0.25) }]}>
                                <Ionicons name="moon-outline" size={13} color={colors.accent.purple} />
                                <Text style={[typography.caption, { color: colors.accent.purple, marginLeft: 6 }]}>
                                    Overnight shift — ends next day
                                </Text>
                            </View>
                        ) : null}
                    </Animated.View>

                    {/* ── Shift Type ───────────────────────────────────────── */}
                    <Animated.View entering={FadeInDown.delay(90).duration(360)}>
                        <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.md, marginTop: spacing['2xl'] }]}>SHIFT TYPE</Text>
                        <View style={styles.typeGrid}>
                            {SHIFT_TYPES.map(type => {
                                const selected = shiftType === type.value;
                                return (
                                    <ShiftTypeCard
                                        key={type.value}
                                        label={type.label}
                                        icon={type.icon}
                                        hint={type.hint}
                                        tint={colors.accent[type.tintKey]}
                                        selected={selected}
                                        accessibilityLabel={type.label}
                                        onPress={() => {
                                            setShiftType(type.value);
                                            clearFieldError('shiftType');
                                        }}
                                    />
                                );
                            })}
                        </View>
                        {fieldErrors.shiftType ? (
                            <Text
                                accessibilityRole="alert"
                                accessibilityLiveRegion="polite"
                                style={[typography.caption, { color: colors.accent.red, marginTop: spacing.sm }]}
                            >
                                {fieldErrors.shiftType}
                            </Text>
                        ) : null}
                    </Animated.View>

                    {/* ── Details ──────────────────────────────────────────── */}
                    <Animated.View entering={FadeInDown.delay(140).duration(360)}>
                        <Text style={[typography.overline, { color: colors.text.tertiary, marginBottom: spacing.md, marginTop: spacing['2xl'] }]}>DETAILS</Text>

                        {/* Rest Day (Day Off) */}
                        <View style={[styles.detailRow, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                            <View style={[styles.detailIcon, { backgroundColor: withAlpha(colors.accent.cyan, 0.12) }]}>
                                <Ionicons name="bed-outline" size={18} color={colors.accent.cyan} />
                            </View>
                            <View style={{ flex: 1, marginLeft: spacing.md }}>
                                <Text style={[typography.subhead, { color: colors.text.primary }]}>Rest Day</Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>Mark this as a day off</Text>
                            </View>
                            <Switch
                                value={isDayOff}
                                onValueChange={setIsDayOff}
                                accessibilityRole="switch"
                                accessibilityLabel="Rest day (day off)"
                                accessibilityState={{ checked: isDayOff }}
                                trackColor={{ false: colors.border.default, true: colors.accent.cyan }}
                                thumbColor={colors.text.primary}
                            />
                        </View>

                        {/* Commute */}
                        <View style={[styles.detailRow, { backgroundColor: colors.background.secondary, borderColor: fieldErrors.commuteMinutes ? colors.accent.red : colors.border.default, marginTop: spacing.md }]}>
                            <View style={[styles.detailIcon, { backgroundColor: withAlpha(colors.accent.blue, 0.12) }]}>
                                <Ionicons name="car-outline" size={18} color={colors.accent.blue} />
                            </View>
                            <View style={{ flex: 1, marginLeft: spacing.md }}>
                                <Text style={[typography.subhead, { color: colors.text.primary }]}>Commute</Text>
                                <Text style={[typography.caption, { color: colors.text.tertiary }]}>One-way travel time</Text>
                            </View>
                            <View style={styles.commuteValue}>
                                <TextInput
                                    accessibilityLabel="Commute time in minutes"
                                    style={[styles.commuteInput, { color: colors.text.primary }]}
                                    value={commuteMinutes}
                                    onChangeText={(v) => {
                                        setCommuteMinutes(v);
                                        clearFieldError('commuteMinutes');
                                    }}
                                    keyboardType="number-pad"
                                    placeholder="30"
                                    placeholderTextColor={colors.text.tertiary}
                                    maxLength={3}
                                    inputAccessoryViewID={Platform.OS === 'ios' ? COMMUTE_ACCESSORY_ID : undefined}
                                />
                                <Text style={[typography.caption, { color: colors.text.tertiary, marginLeft: 4 }]}>min</Text>
                            </View>
                        </View>
                        {fieldErrors.commuteMinutes ? (
                            <Text
                                accessibilityRole="alert"
                                accessibilityLiveRegion="polite"
                                style={[typography.caption, { color: colors.accent.red, marginTop: spacing.sm }]}
                            >
                                {fieldErrors.commuteMinutes}
                            </Text>
                        ) : null}
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* ── Thumb-zone primary CTA ───────────────────────────────── */}
            <View
                style={[
                    styles.ctaBar,
                    {
                        backgroundColor: colors.background.primary,
                        borderTopColor: colors.border.default,
                        paddingBottom: Math.max(insets.bottom, spacing.lg),
                    },
                ]}
            >
                {/* CTA stays tappable while there are field errors — a re-tap re-runs
                    validation (handleSave repopulates fieldErrors and returns), re-surfacing
                    a server-set error (e.g. shiftType) the user can't otherwise clear without
                    re-touching that field. Only the in-flight request disables it. */}
                <Button
                    title="Save Shift"
                    onPress={handleSave}
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={mutation.isPending}
                    disabled={mutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={mutation.isPending ? 'Saving shift' : 'Save shift'}
                    accessibilityState={{ disabled: mutation.isPending, busy: mutation.isPending }}
                />
            </View>

            {/* iOS "Done" bar for the number-pad Commute field (no native dismiss key). */}
            {Platform.OS === 'ios' ? (
                <InputAccessoryView nativeID={COMMUTE_ACCESSORY_ID}>
                    <View
                        style={[
                            styles.accessoryBar,
                            { backgroundColor: colors.background.secondary, borderTopColor: colors.border.default },
                        ]}
                    >
                        <TouchableOpacity
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel="Done editing commute"
                            onPress={() => Keyboard.dismiss()}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={styles.accessoryDone}
                        >
                            <Text style={[typography.subhead, { color: colors.accent.cyan }]}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </InputAccessoryView>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    handleWrap: {
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 4,
    },
    handle: {
        width: 40,
        height: 5,
        borderRadius: 3,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.xl,
        paddingVertical: space.md,
        borderBottomWidth: 1,
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: br.xl,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerSave: {
        minWidth: 40,
        minHeight: 40,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    row: {
        flexDirection: 'row',
    },
    overnightChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        marginTop: space.md,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
    },
    typeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: space.md,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: br.lg,
        paddingHorizontal: 14,
        paddingVertical: space.md,
        minHeight: 64,
    },
    detailIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    commuteValue: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    commuteInput: {
        fontFamily: themeTypography.statSmall.fontFamily,
        fontSize: 24,
        minWidth: 44,
        textAlign: 'right',
        paddingVertical: 0,
    },
    ctaBar: {
        paddingHorizontal: space.xl,
        paddingTop: space.md,
        borderTopWidth: 1,
    },
    accessoryBar: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingHorizontal: space.lg,
        borderTopWidth: 1,
        minHeight: 44,
    },
    accessoryDone: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
});
