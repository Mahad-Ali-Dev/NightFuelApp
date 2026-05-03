import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ChatBubbleProps {
    text: string;
    isOwn: boolean;
    timestamp: string;
    senderName?: string;
}

export function ChatBubble({ text, isOwn, timestamp, senderName }: ChatBubbleProps) {
    return (
        <View style={[styles.row, isOwn ? styles.ownRow : styles.otherRow]}>
            <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
                {senderName && !isOwn && <Text style={styles.sender}>{senderName}</Text>}
                <Text style={[styles.text, isOwn ? styles.ownText : styles.otherText]}>{text}</Text>
                <Text style={[styles.time, isOwn ? styles.ownTime : styles.otherTime]}>{timestamp}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { marginBottom: 12 },
    ownRow: { alignItems: 'flex-end' },
    otherRow: { alignItems: 'flex-start' },
    bubble: { maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
    ownBubble: { backgroundColor: '#7C4DFF', borderBottomRightRadius: 6 },
    otherBubble: { backgroundColor: '#161B22', borderBottomLeftRadius: 6, borderWidth: 1, borderColor: '#21262D' },
    sender: { color: '#FF6B35', fontSize: 11, fontWeight: '700', marginBottom: 4 },
    text: { fontSize: 15, lineHeight: 22 },
    ownText: { color: '#FFFFFF' },
    otherText: { color: '#C9D1D9' },
    time: { fontSize: 10, marginTop: 6, alignSelf: 'flex-end' },
    ownTime: { color: '#FFFFFF80' },
    otherTime: { color: '#8B949E' },
});
