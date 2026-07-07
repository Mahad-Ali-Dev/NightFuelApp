import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { ProgressBar } from '@/components/ui/ProgressBar';

interface OnboardingStepHeaderProps {
    /** Screen title shown centered (e.g. "AI Setup"). */
    title: string;
    /** 1-based current step within the visible flow. */
    step: number;
    /** Total number of visible steps. */
    total: number;
    /** Progress as a 0–1 fraction (drives the bar + the % readout). */
    fraction: number;
    /** Back control handler. */
    onBack: () => void;
}

/**
 * OnboardingStepHeader — a self-contained replica of the shared onboarding
 * layout header (back control + authoritative "STEP X OF N" counter + live
 * percentage + brand ProgressBar), for onboarding routes that are NOT
 * registered in the (onboarding) _layout Stack and therefore don't inherit it
 * (ai-optimization, environment). Mirrors the exact look the layout renders so
 * the flow stays visually consistent, and respects the top safe-area inset so
 * the counter never sits under the status bar.
 *
 * Local + purely presentational; the caller derives step/total/fraction from
 * the SAME shared `getOnboardingStep` util the layout uses so the numbers can't
 * drift from the rest of the flow.
 */
export function OnboardingStepHeader({
    title,
    step,
    total,
    fraction,
    onBack,
}: OnboardingStepHeaderProps) {
    const { colors, typography } = useTheme();
    const insets = useSafeAreaInsets();

    const safeStep = Math.min(step, total);
    const percent = Math.round(fraction * 100);

    return (
        <View
            style={[
                styles.header,
                {
                    backgroundColor: colors.background.primary,
                    paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 50 : 20),
                },
            ]}
        >
            <View style={styles.headerTop}>
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    activeOpacity={0.85}
                    onPress={onBack}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={[
                        styles.backButton,
                        {
                            backgroundColor: colors.background.secondary,
                            borderColor: colors.border.default,
                        },
                    ]}
                >
                    <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={[typography.subhead, { color: colors.text.primary }]}>{title}</Text>
                <View style={{ width: 36 }} />
            </View>
            <View style={styles.progressContainer}>
                <View style={styles.progressTextRow}>
                    <Text
                        style={[
                            typography.overline,
                            { color: colors.text.secondary, fontVariant: ['tabular-nums'] },
                        ]}
                    >
                        STEP {safeStep} OF {total}
                    </Text>
                    <Text
                        style={[
                            typography.overline,
                            { color: colors.accent.coral, fontVariant: ['tabular-nums'] },
                        ]}
                    >
                        {percent}%
                    </Text>
                </View>
                <ProgressBar
                    progress={percent}
                    color={colors.accent.coral}
                    trackColor={withAlpha(colors.accent.coralDark, 0.24)}
                    height={4}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressContainer: {
        gap: 8,
    },
    progressTextRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
});
