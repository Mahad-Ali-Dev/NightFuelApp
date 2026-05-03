import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { create as createShift } from '@/api/shifts';
import { Button } from '@/components/ui';
import { withAlpha } from '@/theme/utils';
import { format } from 'date-fns';
import { getErrorMessage } from '@/utils/validation';

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

    const mutation = useMutation({
        mutationFn: async () => {
            const startStr = `${shiftDate}T${startTime}:00.000`;
            // Handle overnight shift logical end date
            let endDate = shiftDate;
            if (startTime > endTime) {
                const nextDay = new Date(shiftDate);
                nextDay.setDate(nextDay.getDate() + 1);
                endDate = format(nextDay, 'yyyy-MM-dd');
            }
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
            Alert.alert('Error', getErrorMessage(err));
        }
    });

    const handleSave = () => mutation.mutate();

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border.default, backgroundColor: colors.background.secondary }]}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={28} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.heading, { color: colors.text.primary, fontSize: 18 }]}>Log Shift</Text>
                <TouchableOpacity onPress={handleSave} disabled={mutation.isPending}>
                    {mutation.isPending ? (
                        <ActivityIndicator size="small" color={colors.accent.cyan} />
                    ) : (
                        <Text style={[typography.heading, { color: colors.accent.cyan, fontSize: 16 }]}>Save</Text>
                    )}
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                    <Text style={[typography.body, { color: colors.text.secondary, marginBottom: 24, lineHeight: 22 }]}>
                        Enter your upcoming or completed shift to align circadian recommendations.
                    </Text>

                    {/* Date Section */}
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: 12, fontSize: 16 }]}>Shift Date</Text>
                    <View style={[styles.inputBox, { backgroundColor: colors.background.secondary, borderColor: colors.border.default, marginBottom: 20 }]}>
                        <Ionicons name="calendar-outline" size={20} color={colors.text.secondary} />
                        <TextInput
                            style={[styles.textInput, { color: colors.text.primary }]}
                            value={shiftDate}
                            onChangeText={setShiftDate}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={colors.text.tertiary}
                        />
                    </View>

                    {/* Times Section */}
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={[typography.heading, { color: colors.text.primary, marginBottom: 12, fontSize: 16 }]}>Start Time</Text>
                            <View style={[styles.inputBox, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                                <Ionicons name="time-outline" size={20} color={colors.text.secondary} />
                                <TextInput
                                    style={[styles.textInput, { color: colors.text.primary }]}
                                    value={startTime}
                                    onChangeText={setStartTime}
                                    placeholder="HH:MM"
                                    placeholderTextColor={colors.text.tertiary}
                                />
                            </View>
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={[typography.heading, { color: colors.text.primary, marginBottom: 12, fontSize: 16 }]}>End Time</Text>
                            <View style={[styles.inputBox, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                                <Ionicons name="time-outline" size={20} color={colors.text.secondary} />
                                <TextInput
                                    style={[styles.textInput, { color: colors.text.primary }]}
                                    value={endTime}
                                    onChangeText={setEndTime}
                                    placeholder="HH:MM"
                                    placeholderTextColor={colors.text.tertiary}
                                />
                            </View>
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
                                    style={[
                                        styles.typeBtn,
                                        {
                                            backgroundColor: selected ? withAlpha(colors.accent.cyan, 0.2) : colors.background.secondary,
                                            borderColor: selected ? colors.accent.cyan : colors.border.default,
                                        }
                                    ]}
                                    onPress={() => setShiftType(type.value)}
                                >
                                    <Text style={[
                                        typography.caption,
                                        { color: selected ? colors.accent.cyan : colors.text.secondary, fontWeight: selected ? '700' : '500' }
                                    ]}>{type.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Day Off Switch */}
                    <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 20 }]}>
                        <Text style={[typography.heading, { color: colors.text.primary, fontSize: 16 }]}>Rest Day (Day Off)</Text>
                        <Switch
                            value={isDayOff}
                            onValueChange={setIsDayOff}
                            trackColor={{ false: colors.border.default, true: colors.accent.cyan }}
                            thumbColor="#fff"
                        />
                    </View>

                    {/* Commute */}
                    <Text style={[typography.heading, { color: colors.text.primary, marginBottom: 12, fontSize: 16 }]}>Commute Time (Minutes)</Text>
                    <View style={[styles.inputBox, { backgroundColor: colors.background.secondary, borderColor: colors.border.default }]}>
                        <Ionicons name="car-outline" size={20} color={colors.text.secondary} />
                        <TextInput
                            style={[styles.textInput, { color: colors.text.primary }]}
                            value={commuteMinutes}
                            onChangeText={setCommuteMinutes}
                            keyboardType="number-pad"
                            placeholder="30"
                            placeholderTextColor={colors.text.tertiary}
                        />
                    </View>

                    <Button
                        title="Save Shift"
                        onPress={handleSave}
                        variant="primary"
                        loading={mutation.isPending}
                        style={{ marginTop: 40 }}
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
        fontFamily: 'Inter',
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
