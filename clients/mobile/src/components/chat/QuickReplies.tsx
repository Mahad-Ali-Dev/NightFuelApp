import React from 'react';
import { ScrollView, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@/theme';

interface QuickRepliesProps {
    replies: string[];
    onSelect: (reply: string) => void;
}

export function QuickReplies({ replies, onSelect }: QuickRepliesProps) {
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
            {replies.map((reply) => (
                <TouchableOpacity key={reply} style={styles.chip} onPress={() => onSelect(reply)} activeOpacity={0.7}>
                    <Text style={styles.chipText}>{reply}</Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
    chip: { backgroundColor: colors.background.secondary, borderWidth: 1, borderColor: '#7C4DFF50', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
    chipText: { color: '#7C4DFF', fontSize: 13, fontWeight: '600' },
});
