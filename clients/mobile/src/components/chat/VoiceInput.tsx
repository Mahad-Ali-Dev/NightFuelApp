import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface VoiceInputProps {
    onRecordStart?: () => void;
    onRecordEnd?: () => void;
}

export function VoiceInput({ onRecordStart, onRecordEnd }: VoiceInputProps) {
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
            style={[styles.btn, isRecording && styles.btnRecording]}
            onPress={toggleRecording}
            activeOpacity={0.7}
        >
            <Ionicons name={isRecording ? 'stop-circle' : 'mic'} size={22} color={isRecording ? '#FF4444' : colors.text.secondary} />
            {isRecording && (
                <View style={styles.recordingIndicator}>
                    <View style={styles.dot} />
                    <Text style={styles.recordingText}>Recording...</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background.secondary, alignItems: 'center', justifyContent: 'center' },
    btnRecording: { backgroundColor: '#FF444420', width: 'auto', paddingHorizontal: 16, flexDirection: 'row', gap: 8 },
    recordingIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF4444' },
    recordingText: { color: '#FF4444', fontSize: 12, fontWeight: '700' },
});
