/**
 * VoiceInput — a mic toggle for the chat composer. `isRecording` is genuine
 * ground truth (a real on/off state, not a derived visual — per state-ground-
 * truth), so it stays in useState. Theme-driven (Aurora tokens) with an a11y
 * role/label/state and a >=44px touch target.
 */
import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

interface VoiceInputProps {
    onRecordStart?: () => void;
    onRecordEnd?: () => void;
}

export function VoiceInput({ onRecordStart, onRecordEnd }: VoiceInputProps) {
    const { colors, typography } = useTheme();
    const [isRecording, setIsRecording] = useState(false);

    const toggleRecording = () => {
        if (isRecording) {
            setIsRecording(false);
            onRecordEnd?.();
        } else {
            setIsRecording(true);
            onRecordStart?.();
        }
    };

    return (
        <TouchableOpacity
            style={[
                styles.btn,
                { backgroundColor: colors.background.secondary },
                isRecording && [styles.btnRecording, { backgroundColor: withAlpha(colors.error, 0.16) }],
            ]}
            onPress={toggleRecording}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Record a voice message'}
            accessibilityState={{ selected: isRecording }}
        >
            <Ionicons name={isRecording ? 'stop-circle' : 'mic'} size={22} color={isRecording ? colors.error : colors.text.secondary} />
            {isRecording && (
                <View style={styles.recordingIndicator}>
                    <View style={[styles.dot, { backgroundColor: colors.error }]} />
                    <Text style={[typography.caption, { color: colors.error, fontWeight: '700' }]}>Recording…</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    btnRecording: { width: 'auto', paddingHorizontal: 16, flexDirection: 'row', gap: 8 },
    recordingIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
});
