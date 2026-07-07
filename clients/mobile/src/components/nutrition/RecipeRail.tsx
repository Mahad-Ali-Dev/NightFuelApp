import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme, typography } from '@/theme';
import { getRecipes } from '@/api/meals';
import { RecipeCard } from '@/components/NutritionCards';

const FALLBACK = require('../../../assets/images/recipe-fallback.png');

/**
 * A horizontal "fresh recipes" rail used on the Home + Meals screens: a section
 * header with a "View all" link to the full recipes library, then up to 8
 * snapping RecipeCards. Self-fetching (getRecipes) so it drops into any screen;
 * renders nothing while empty so it never leaves a bare header.
 */
export function RecipeRail({ title = 'Fresh recipes', tag, limit = 8 }: { title?: string; tag?: string; limit?: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { data } = useQuery({
    queryKey: ['recipe-rail', tag ?? 'all'],
    queryFn: () => getRecipes(tag, limit),
    staleTime: 5 * 60 * 1000,
  });
  const recipes = (data ?? []).slice(0, limit) as any[];
  if (recipes.length === 0) return null;

  return (
    <View style={{ marginTop: 18 }}>
      <View style={st.head}>
        <Text style={[typography.subtitle, { color: colors.text.primary, fontSize: 16 }]}>{title}</Text>
        <TouchableOpacity
          onPress={() => router.push('/(meals)/recipes' as any)}
          accessibilityRole="button"
          accessibilityLabel="View all recipes"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={st.viewAll}
        >
          <Text style={[typography.caption, { color: colors.text.secondary, fontSize: 12.5 }]}>View all</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {recipes.map((r, i) => (
          <RecipeCard
            key={r.id ?? i}
            title={r.title}
            calories={r.calories}
            protein={r.protein}
            minutes={(r.prepTimeMins || 0) + (r.cookTimeMins || 0)}
            img={r.image ? { uri: r.image } : FALLBACK}
            accent={colors.accent.coral}
            index={i}
            onPress={() => router.push({ pathname: '/(meals)/recipes', params: { openRecipe: r.id } } as any)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
