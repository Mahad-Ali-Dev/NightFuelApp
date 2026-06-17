import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { create as createShift } from '@/api/shifts';
import { Button, DateTimeField, nowDateString, nowTimeString } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';
import { typography as themeTypography } from '@/theme/typography';
import { format } from 'date-fns';
import { getErrorMessage } from '@/utils/validation';
import {
    validateLogShiftForm,
    isOvernightShift,
    fieldErrorsFromAxiosError,
} from '@/lib/logFormSchemas';

const SHIFT_TYPES = [
    { value: 'FIXED_NIGHT', label: 'Fixed Night' },
    { value: 'ROTATING', label: 'Rotating' },
    { value: 'SPLIT', label: 'Split Shift' },
    { value: 'IRREGULAR', label: 'Irregular' },
    { value: 'TWELVE_HOUR', label: '12-Hour Shift' }
];

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

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default, backgroundColor: colors.background.secondary }]}>
                <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={28} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Log Shift</Text>
                <TouchableOpacity
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={mutation.isPending ? 'Saving shift' : 'Save shift'}
                    accessibilityState={{ disabled: mutation.isPending || hasErrors, busy: mutation.isPending }}
                    onPress={handleSave}
                    disabled={mutation.isPending || hasErrors}
                >
                    {mutation.isPending ? (
                        <ActivityIndicator size="small" color={colors.accent.cyan} />
                    ) : (
                        <Text
                            style={[
                                typography.heading,
                                {
                                    color: hasErrors ? colors.text.tertiary : colors.accent.cyan,
                                    fontSize: 16,
                                },
                            ]}
                        >
                            Save
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                    <Text style={[typography.body, { color: colors.text.secondary, marginBottom: 24, lineHeight: 22 }]}>
                        Enter your upcoming or completed shift to align circadian recommendations.
                    </Text>

                    {/* Date Section */}
                    <DateTimeField
                        label="Shift Date"
                        mode="date"
                        value={shiftDate}
                        onChange={(v) => {
                            setShiftDate(v);
                            if (fieldErrors.shiftDate) {
                                setFieldErrors((p) => {
                                    const { shiftDate: _omit, ...rest } = p;
                                    return rest;
                                });
                            }
                        }}
                        onNow={() => {
                            setShiftDate(nowDateString());
                            if (fieldErrors.shiftDate) {
                                setFieldErrors((p) => {
                                    const { shiftDate: _omit, ...rest } = p;
                                    return rest;
                                });
                            }
                        }}
                        error={fieldErrors.shiftDate}
                    />
                    {fieldErrors.shiftDate ? (
                        <Text
                            accessibilityRole="alert"
                            style={{ color: colors.accent.red, marginTop: 4, marginBottom: 16, fontSize: 12 }}
                        >
                            {fieldErrors.shiftDate}
                        </Text>
                    ) : (
                        <View style={{ height: 20 }} />
                    )}

                    {/* Times Section */}
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <DateTimeField
                                label="Start Time"
                                mode="time"
                                value={startTime}
                                onChange={(v) => {
                                    setStartTime(v);
                                    if (fieldErrors.startTime) {
                                        setFieldErrors((p) => {
                                            const { startTime: _omit, ...rest } = p;
                                            return rest;
                                        });
                                    }
                                }}
                                onNow={() => {
                                    setStartTime(nowTimeString());
                                    if (fieldErrors.startTime) {
                                        setFieldErrors((p) => {
                                            const { startTime: _omit, ...rest } = p;
                                            return rest;
                                        });
                                    }
                                }}
                                error={fieldErrors.startTime}
                            />
                            {fieldErrors.startTime ? (
                                <Text
                                    accessibilityRole="alert"
                                    style={{ color: colors.accent.red, marginTop: 4, fontSize: 12 }}
                                >
                                    {fieldErrors.startTime}
                                </Text>
                            ) : null}
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <DateTimeField
                                label="End Time"
                                mode="time"
                                value={endTime}
                                onChange={(v) => {
                                    setEndTime(v);
                                    if (fieldErrors.endTime) {
                                        setFieldErrors((p) => {
                                            const { endTime: _omit, ...rest } = p;
                                            return rest;
                                        });
                                    }
                                }}
                                onNow={() => {
                                    setEndTime(nowTimeString());
                                    if (fieldErrors.endTime) {
                                        setFieldErrors((p) => {
                                            const { endTime: _omit, ...rest } = p;
                                            return rest;
                                        });
                                    }
                                }}
                                error={fieldErrors.endTime}
                            />
                            {fieldErrors.endTime ? (
                                <Text
                                    accessibilityRole="alert"
                                    style={{ color: colors.accent.red, marginTop: 4, fontSize: 12 }}
                                >
                                    {fieldErrors.endTime}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    {/* Shift Type */}
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: 12, marginTop: 24, fontSize: 16 }]}>Shift Type</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {SHIFT_TYPES.map(type => {
                            const selected = shiftType === type.value;
                            return (
                                <TouchableOpacity
                                    key={type.value}
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityLabel={type.label}
                                    accessibilityState={{ selected }}
                                    style={[
                                        styles.typeBtn,
                                        {
                                            backgroundColor: selected ? withAlpha(colors.accent.cyan, 0.2) : colors.background.secondary,
                                            borderColor: selected ? colors.accent.cyan : colors.border.default,
                                        },
                                        selected && shadows.glow(colors.accent.cyan),
                                    ]}
                                    onPress={() => {
                                        setShiftType(type.value);
                                        if (fieldErrors.shiftType) {
                                            setFieldErrors((p) => {
                                                const { shiftType: _omit, ...rest } = p;
                                                return rest;
                                            });
                                        }
                                    }}
                                >
                                    <Text style={[
                                        typography.caption,
                                        { color: selected ? colors.accent.cyan : colors.text.secondary, fontWeight: selected ? '700' : '500' }
                                    ]}>{type.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    {fieldErrors.shiftType ? (
                        <Text
                            accessibilityRole="alert"
                            style={{ color: colors.accent.red, marginTop: 6, fontSize: 12 }}
                        >
                            {fieldErrors.shiftType}
                        </Text>
                    ) : null}

                    {/* Day Off Switch */}
                    <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 20 }]}>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 16 }]}>Rest Day (Day Off)</Text>
                        <Switch
                            value={isDayOff}
                            onValueChange={setIsDayOff}
                            trackColor={{ false: colors.border.default, true: colors.accent.cyan }}
                            thumbColor={colors.text.primary}
                        />
                    </View>

                    {/* Commute */}
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: 12, fontSize: 16 }]}>Commute Time (Minutes)</Text>
                    <View
                        style={[
                            styles.inputBox,
                            {
                                backgroundColor: colors.background.secondary,
                                borderColor: fieldErrors.commuteMinutes ? colors.accent.red : colors.border.default,
                            },
                        ]}
                    >
                        <Ionicons name="car-outline" size={20} color={colors.text.secondary} />
                        <TextInput
                            style={[styles.textInput, { color: colors.text.primary }]}
                            value={commuteMinutes}
                            onChangeText={(v) => {
                                setCommuteMinutes(v);
                                if (fieldErrors.commuteMinutes) {
                                    setFieldErrors((p) => {
                                        const { commuteMinutes: _omit, ...rest } = p;
                                        return rest;
                                    });
                                }
                            }}
                            keyboardType="number-pad"
                            placeholder="30"
                            placeholderTextColor={colors.text.tertiary}
                        />
                    </View>
                    {fieldErrors.commuteMinutes ? (
                        <Text
                            accessibilityRole="alert"
                            style={{ color: colors.accent.red, marginTop: 4, fontSize: 12 }}
                        >
                            {fieldErrors.commuteMinutes}
                        </Text>
                    ) : null}

                    <Button
                        title="Save Shift"
                        onPress={handleSave}
                        variant="primary"
                        loading={mutation.isPending}
                        disabled={hasErrors}
                        style={{ marginTop: 40 }}
                        accessibilityRole="button"
                        accessibilityLabel={mutation.isPending ? 'Saving shift' : 'Save shift'}
                        accessibilityState={{ disabled: hasErrors || mutation.isPending, busy: mutation.isPending }}
                    />
                </ScrollView>
            </KeyboardAvoidingView>
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
        paddingVertical: 12,
        borderBottomWidth: 1,
        elevation: 2,
    },
    row: {
        flexDirection: 'row',
    },
    inputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 52,
    },
    textInput: {
        flex: 1,
        marginLeft: 8,
        fontFamily: themeTypography.body.fontFamily,
        fontSize: 16,
        paddingVertical: 10,
    },
    typeBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
    }
});
