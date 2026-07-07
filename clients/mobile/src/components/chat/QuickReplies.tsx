/**
 * QuickReplies — a horizontally-scrolling row of suggested-reply chips for the
 * chat composer. Theme-driven (Aurora tokens via useTheme) and a11y-labelled;
 * each chip is a >=44px-tall touch target.
 *
 * One hoisted onPress per render (keyed by reply text) would re-create a closure
 * per chip — but this is a small, static row (not a virtualized list), so a
 * per-chip arrow is acceptable here; the heavier list-callback rule applies to
 * FlatList rows, not a short ScrollView of chips.
 */
import React from 'react';
import { ScrollView, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

interface QuickRepliesProps {
    replies: string[];
    onSelect: (reply: string) => void;
}

export function QuickReplies({ replies, onSelect }: QuickRepliesProps) {
    const { colors, typography } = useTheme();
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            {replies.map((reply) => (
                <TouchableOpacity
                    key={reply}
                    style={[styles.chip, { backgroundColor: colors.background.secondary, borderColor: withAlpha(colors.accent.purple, 0.4) }]}
                    onPress={() => onSelect(reply)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Quick reply: ${reply}`}
                >
                    <Text style={[typography.captionMedium, { color: colors.accent.purpleLight, fontWeight: '600' }]}>{reply}</Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
    chip: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
});
