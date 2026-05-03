import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { withAlpha } from '@/theme/utils';
import { colors as themeColors } from '@/theme/colors';

export default function MealDetailScreen() {
    const { colors, typography, spacing } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
            {/* Mock Image Header */}
            <View style={styles.imageHeader}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background.tertiary }]} />
                <TouchableOpacity
                    style={[styles.backBtn, { top: Math.max(insets.top, 20) }]}
                    onPress={() => router.back()}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.saveBtn, { top: Math.max(insets.top, 20) }]}
                >
                    <Ionicons name="bookmark-outline" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Ionicons name="restaurant-outline" size={80} color={colors.text.secondary} style={{ opacity: 0.5 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}>
                <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: `${colors.accent.cyan}20` }]}>
                        <Text style={[typography.caption, { color: colors.accent.cyan, fontWeight: '700' }]}>HIGH PROTEIN</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: `${colors.accent.coral}20` }]}>
                        <Text style={[typography.caption, { color: colors.accent.coral, fontWeight: '700' }]}>LOW GI</Text>
                    </View>
                </View>

                <Text style={[typography.display, { color: colors.text.primary, fontSize: 32, marginVertical: spacing.sm }]}>
                    Grilled Salmon & Quinoa Bowl
                </Text>
                <Text style={[typography.body, { color: colors.text.secondary }]}>
                    Perfect pre-shift dinner providing sustained energy release without the insulin spike.
                </Text>

                <View style={[styles.macroRow, { backgroundColor: colors.background.secondary }]}>
                    <View style={styles.macroBox}>
                        <Text style={[typography.heading, { color: colors.text.primary }]}>650</Text>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>KCAL</Text>
                    </View>
                    <View style={[styles.macroDivider, { backgroundColor: colors.border.default }]} />
                    <View style={styles.macroBox}>
                        <Text style={[typography.heading, { color: colors.text.primary }]}>45g</Text>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>PRO</Text>
                    </View>
                    <View style={[styles.macroDivider, { backgroundColor: colors.border.default }]} />
                    <View style={styles.macroBox}>
                        <Text style={[typography.heading, { color: colors.text.primary }]}>55g</Text>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>CARB</Text>
                    </View>
                    <View style={[styles.macroDivider, { backgroundColor: colors.border.default }]} />
                    <View style={styles.macroBox}>
                        <Text style={[typography.heading, { color: colors.text.primary }]}>25g</Text>
                        <Text style={[typography.caption, { color: colors.text.tertiary }]}>FAT</Text>
                    </View>
                </View>

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
                    icon={<Ionicons name="add" size={20} color={themeColors.text.primary} />}
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
        backgroundColor: 'rgba(0,0,0,0.5)',
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
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    badgeRow: {
        flexDirection: 'row',
        gap: 8,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    macroRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 16,
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
