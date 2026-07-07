/**
 * GoalRecommendationRail — a horizontal, snapping "recommended goals" carousel
 * for the onboarding Goals step (Zeitra brand).
 *
 * Local-only helper. Renders a "Popular with shift workers" rail of compact,
 * lime-accented GlassCard tiles. It is a SECOND entry point into the exact same
 * `selectedGoal` state the 2-up grid drives — tapping a rail card selects (or, on
 * re-tap, clears) the goal, and the active card lifts to the lime `accent.coral`
 * hairline ring + glow + ink-on-lime icon medallion so the chosen goal reads the
 * same in either surface.
 *
 * Pure presentation: owns no data. The screen passes the goal list, the current
 * selection and an `onSelect(value)` callback (which already encodes the
 * tap-to-toggle behaviour), so every handler/testID stays on the screen.
 *
 * Snapping mechanics follow the app convention (see circadian.tsx): a module-
 * scope card width sized so the next card peeks, `decelerationRate="fast"`,
 * `snapToInterval = CARD_W + gap`, `snapToAlignment="start"`.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  FlatList,
  ListRenderItemInfo,
  Image,
  type ImageSourcePropType,
} from 'react-native';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '@/components/ui';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

export interface GoalRailItem {
  value: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * Optional premium PNG tile rendered inside the icon medallion instead of the
   * Ionicon glyph. When provided it wins over `icon` (which stays required so
   * the card keeps a guaranteed glyph fallback); `resizeMode="contain"` keeps
   * the transparent tile crisp within the medallion.
   */
  image?: ImageSourcePropType;
}

export interface GoalRecommendationRailProps {
  /** Section eyebrow, e.g. "POPULAR WITH SHIFT WORKERS". */
  title: string;
  items: GoalRailItem[];
  /** Currently-selected goal value (or null) — shared with the grid below. */
  selectedValue: string | null;
  /** Fires with the tapped item's value; the screen owns the toggle semantics. */
  onSelect: (value: string) => void;
  /** Horizontal padding for the rail's content edges (from the spacing scale). */
  edgePadding: number;
  testID?: string;
}

// Width of a recommended-goal card. ~64% of the viewport (capped) so the next
// card peeks — signalling swipeability — and snapToInterval lands cleanly.
// Module scope = computed once, no per-render Dimensions read.
const RAIL_CARD_W = Math.round(Math.min(Dimensions.get('window').width * 0.64, 240));
const RAIL_GAP = 12;

function RailCard({
  item,
  selected,
  onPress,
}: {
  item: GoalRailItem;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, typography, spacing, borderRadius, shadows } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.96, { duration: 110 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 140 });
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${item.label}. ${item.description}`}
      style={{ width: RAIL_CARD_W }}
    >
      <Animated.View style={animatedStyle}>
        <GlassCard
          radius={borderRadius.xl}
          glow={selected ? colors.accent.coral : undefined}
          style={[
            styles.card,
            {
              // Constant border width — only the colour changes on selection so
              // the card never grows / nudges its neighbours in the rail.
              borderColor: selected
                ? colors.accent.coral
                : withAlpha(colors.text.primary, 0.1),
              borderWidth: 1.5,
            },
          ]}
        >
          <View style={{ padding: spacing.lg }}>
            <View style={styles.cardTopRow}>
              <View
                style={[
                  styles.iconMedallion,
                  {
                    backgroundColor: selected
                      ? colors.accent.coral
                      : withAlpha(colors.accent.coral, 0.14),
                    borderColor: selected
                      ? 'transparent'
                      : withAlpha(colors.accent.coral, 0.28),
                  },
                  selected ? shadows.glow(colors.accent.coral) : null,
                ]}
              >
                {item.image ? (
                  <Image source={item.image} style={styles.iconImage} resizeMode="contain" />
                ) : (
                  <Ionicons
                    name={item.icon}
                    size={22}
                    color={selected ? colors.text.inverse : colors.accent.coral}
                  />
                )}
              </View>
              {selected && (
                <View
                  style={[styles.checkBadge, { backgroundColor: colors.accent.coral }]}
                >
                  <Ionicons name="checkmark" size={14} color={colors.text.inverse} />
                </View>
              )}
            </View>
            <Text
              style={[
                typography.subtitle,
                { color: colors.text.primary, marginTop: spacing.md },
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            <Text
              style={[
                typography.caption,
                { color: colors.text.secondary, marginTop: spacing.xxs },
              ]}
              numberOfLines={2}
            >
              {item.description}
            </Text>
          </View>
        </GlassCard>
      </Animated.View>
    </Pressable>
  );
}

export function GoalRecommendationRail({
  title,
  items,
  selectedValue,
  onSelect,
  edgePadding,
  testID,
}: GoalRecommendationRailProps) {
  const { colors, typography, spacing } = useTheme();

  const renderItem = ({ item }: ListRenderItemInfo<GoalRailItem>) => (
    <RailCard
      item={item}
      selected={selectedValue === item.value}
      onPress={() => onSelect(item.value)}
    />
  );

  return (
    <Animated.View
      entering={FadeInDown.delay(90).duration(440)}
      style={{ marginBottom: spacing['2xl'] }}
      testID={testID}
    >
      <View style={[styles.headerRow, { paddingHorizontal: edgePadding }]}>
        <Ionicons name="sparkles" size={14} color={colors.accent.coral} />
        <Text style={[typography.overline, { color: colors.accent.coral }]}>
          {title}
        </Text>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(it) => it.value}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        pagingEnabled
        snapToInterval={RAIL_CARD_W + RAIL_GAP}
        snapToAlignment="start"
        ItemSeparatorComponent={() => <View style={{ width: RAIL_GAP }} />}
        contentContainerStyle={{ paddingHorizontal: edgePadding }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  card: {
    minHeight: 132,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  iconMedallion: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Roughly fills the 44pt medallion slot (with a little inset) so the premium
  // tile reads at the same visual weight the Ionicon glyph (size 22) did.
  iconImage: {
    width: 30,
    height: 30,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
