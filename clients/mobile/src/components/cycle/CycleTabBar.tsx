import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { useCycleAccents } from '@/theme/useCycleAccents';
import { withAlpha } from '@/theme/utils';

/** The four cycle sub-screens. Kept as a union so the parent's tab state and this
 *  bar can never drift out of sync. */
export type CycleTab = 'today' | 'calendar' | 'insights' | 'log';

interface TabDef {
    key: CycleTab;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
}

// Order matches the approved design: Today | Calendar | Insights | Log.
const TABS: readonly TabDef[] = [
    { key: 'today', label: 'Today', icon: 'sunny-outline' },
    { key: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
    { key: 'insights', label: 'Insights', icon: 'sparkles-outline' },
    { key: 'log', label: 'Log', icon: 'add-circle-outline' },
] as const;

export interface CycleTabBarProps {
    active: CycleTab;
    onChange: (tab: CycleTab) => void;
}

/**
 * Segmented tab bar for the Cycle screen (Flo/Clue-grade). A single rounded
 * "track" (theme card surface + hairline border) holds four equal segments; the
 * ACTIVE segment is a coral pill with dark ink text/icon, inactive segments are
 * transparent with muted text. Coral is the theme-aware period accent from
 * useCycleAccents (so it darkens for AA contrast on light themes); the ink label
 * uses colors.text.inverse so it reads on the coral fill in both schemes.
 *
 * Pure/presentational — owns no tab state; the parent drives `active` and gets
 * taps via `onChange`.
 */
export function CycleTabBar({ active, onChange }: CycleTabBarProps) {
    const { colors, typography } = useTheme();
    const { coral: CORAL } = useCycleAccents();

    return (
        <View
            accessibilityRole="tablist"
            style={[
                styles.track,
                {
                    backgroundColor: colors.background.secondary,
                    borderColor: colors.border.default,
                },
            ]}
        >
            {TABS.map((tab) => {
                const selected = tab.key === active;
                // Ink on the coral fill when active; muted text when not.
                const fg = selected ? colors.text.inverse : colors.text.secondary;
                return (
                    <Pressable
                        key={tab.key}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        accessibilityLabel={tab.label}
                        hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                        onPress={() => onChange(tab.key)}
                        style={({ pressed }) => [
                            styles.segment,
                            selected
                                ? { backgroundColor: CORAL }
                                : { backgroundColor: 'transparent' },
                            pressed && !selected
                                ? { backgroundColor: withAlpha(CORAL, 0.1) }
                                : null,
                            pressed && selected ? { opacity: 0.92 } : null,
                        ]}
                    >
                        <Ionicons name={tab.icon} size={16} color={fg} />
                        <Text
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.3}
                            style={[
                                typography.captionMedium,
                                styles.label,
                                { color: fg, fontWeight: selected ? '700' : '600' },
                            ]}
                        >
                            {tab.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    track: {
        flexDirection: 'row',
        alignItems: 'stretch',
        borderRadius: 16,
        borderWidth: 1,
        padding: 4,
        gap: 4,
    },
    segment: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        minHeight: 40,
        paddingVertical: 9,
        paddingHorizontal: 4,
        borderRadius: 12,
    },
    label: { letterSpacing: 0.2 },
});
