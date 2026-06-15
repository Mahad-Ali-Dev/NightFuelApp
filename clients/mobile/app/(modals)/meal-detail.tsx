import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/theme/utils';
import { shadows } from '@/theme/shadows';

export default function MealDetailScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Mock Image Header */}
            <View style={styles.imageHeader}>
                <LinearGradient
                    colors={[colors.background.tertiary, colors.background.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back"
                    style={[styles.backBtn, { top: Math.max(insets.top, 20), backgroundColor: withAlpha(colors.background.primary, 0.55), borderColor: colors.border.default }]}
                    onPress={() => router.back()}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Save"
                    style={[styles.saveBtn, { top: Math.max(insets.top, 20), backgroundColor: withAlpha(colors.background.primary, 0.55), borderColor: colors.border.default }]}
                >
                    <Ionicons name="bookmark-outline" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <View style={shadows.glow(colors.accent.coral)}>
                    <Ionicons name="restaurant-outline" size={80} color={colors.accent.coral} style={{ opacity: 0.85 }} />
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: withAlpha(colors.accent.cyan, 0.14), borderColor: withAlpha(colors.accent.cyan, 0.28) }]}>
                        <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: '700' }]}>HIGH PROTEIN</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: withAlpha(colors.accent.coral, 0.14), borderColor: withAlpha(colors.accent.coral, 0.28) }]}>
                        <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: '700' }]}>LOW GI</Text>
                    </View>
                </View>

                <Text style={[typography.display, { color: colors.text.primary, fontSize: 32, marginVertical: spacing.sm }]}>
                    Grilled Salmon & Quinoa Bowl
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary }]}>
                    Perfect pre-shift dinner providing sustained energy release without the insulin spike.
                </Text>

                <Card variant="glass" style={styles.macroRow}>
                    <View style={styles.macroBox}>
                        <Text style={[typography.statSmall, { color: colors.text.primary }]}>650</Text>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 2 }]}>KCAL</Text>
                    </View>
                    <View style={[styles.macroDivider, { backgroundColor: colors.border.default }]} />
                    <View style={styles.macroBox}>
                        <Text style={[typography.statSmall, { color: colors.text.primary }]}>45<Text style={[typography.statTiny, { color: colors.text.secondary }]}>g</Text></Text>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 2 }]}>PRO</Text>
                    </View>
                    <View style={[styles.macroDivider, { backgroundColor: colors.border.default }]} />
                    <View style={styles.macroBox}>
                        <Text style={[typography.statSmall, { color: colors.text.primary }]}>55<Text style={[typography.statTiny, { color: colors.text.secondary }]}>g</Text></Text>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 2 }]}>CARB</Text>
                    </View>
                    <View style={[styles.macroDivider, { backgroundColor: colors.border.default }]} />
                    <View style={styles.macroBox}>
                        <Text style={[typography.statSmall, { color: colors.text.primary }]}>25<Text style={[typography.statTiny, { color: colors.text.secondary }]}>g</Text></Text>
                        <Text style={[typography.overline, { color: colors.text.secondary, marginTop: 2 }]}>FAT</Text>
                    </View>
                </Card>

                <Text style={[typography.heading, { color: colors.text.primary, marginTop: spacing.xl, marginBottom: spacing.md }]}>
                    Ingredients
                </Text>
                {[
                    '6 oz Wild-caught Salmon (Raw)',
                    '1/2 cup Quinoa (Dry)',
                    '100g Asparagus',
                    '1 tbsp Olive Oil',
                    'Lemon juice & herbs',
                ].map((ing, i) => (
                    <View key={i} style={styles.ingRow}>
                        <Ionicons name="ellipse" size={8} color={colors.accent.cyan} style={{ marginRight: 12 }} />
                        <Text style={[typography.body, { color: colors.text.secondary }]}>{ing}</Text>
                    </View>
                ))}

                <Text style={[typography.heading, { color: colors.text.primary, marginTop: spacing.xl, marginBottom: spacing.md }]}>
                    Instructions
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary, lineHeight: 24 }]}>
                    1. Preheat oven to 400°F (200°C).{'\n'}
                    2. Rinse quinoa and boil in 1 cup water for 15 mins.{'\n'}
                    3. Place salmon and asparagus on a baking sheet. Drizzle with olive oil, salt, and pepper.{'\n'}
                    4. Bake for 12-15 minutes until salmon flakes easily.{'\n'}
                    5. Assemble bowl and squeeze fresh lemon juice over the top.
                </Text>

            </ScrollView>

            {/* Floating Action */}
            <View style={[styles.fabContainer, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: withAlpha(colors.background.primary, 0.95), borderTopColor: colors.border.default }]}>
                <Button
                    title="Log Meal"
                    icon={<Ionicons name="add" size={20} color={colors.text.primary} />}
                    fullWidth
                    onPress={() => router.back()}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    imageHeader: {
        height: 250,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    backBtn: {
        position: 'absolute',
        left: 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    saveBtn: {
        position: 'absolute',
        right: 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    badgeRow: {
        flexDirection: 'row',
        gap: 8,
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
    },
    macroRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 24,
    },
    macroBox: {
        alignItems: 'center',
        flex: 1,
    },
    macroDivider: {
        width: 1,
        height: 30,
    },
    ingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    fabContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingTop: 16,
        borderTopWidth: 1,
    }
});
