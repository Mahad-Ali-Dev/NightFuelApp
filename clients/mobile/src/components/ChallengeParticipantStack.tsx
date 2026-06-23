/**
 * ChallengeParticipantStack — a small overlapping cluster of avatars that puts a
 * HUMAN face on a challenge's `participants` count (the brief: people are
 * avatars, not a bare number).
 *
 * The Challenge wire shape carries only a participant *count* (no roster), so we
 * render up to `max` generic gradient Avatars (the shared Avatar primitive's
 * face-less fallback) overlapped left-to-right, then a "+N" pill when the count
 * exceeds what we show. This reads as "a crowd is in this" without inventing
 * fake identities. When the real roster ships, swap the synthesized avatars for
 * mapped `uri`s — the layout is unchanged.
 *
 * Lives under src/components/ so the Challenges screen can compose it without
 * touching any shared primitive or the theme. Visual-only; no data hooks.
 */
import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { Avatar } from '@/components/ui';

interface ChallengeParticipantStackProps {
  /** Total participants in the challenge (from the wire `participants` count). */
  count: number;
  /** Max avatars to render before collapsing into a "+N" pill. Default 4. */
  max?: number;
  /** Avatar diameter. Default 26. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

function ChallengeParticipantStackComponent({
  count,
  max = 4,
  size = 26,
  style,
}: ChallengeParticipantStackProps) {
  const { colors } = useTheme();

  // How many face chips to draw, and whether an overflow pill is needed.
  const shown = Math.max(0, Math.min(count, max));
  const overflow = Math.max(0, count - shown);
  const overlap = Math.round(size * 0.34);

  if (count <= 0) return null;

  return (
    <View style={[styles.row, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.cluster}>
        {Array.from({ length: shown }).map((_, i) => (
          <View
            key={i}
            style={{
              marginLeft: i === 0 ? 0 : -overlap,
              zIndex: shown - i,
            }}
          >
            <Avatar size={size} borderColor={colors.background.secondary} />
          </View>
        ))}

        {overflow > 0 ? (
          <View
            style={[
              styles.overflow,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                marginLeft: -overlap,
                backgroundColor: colors.background.tertiary,
                borderColor: colors.background.secondary,
              },
            ]}
          >
            <Text
              style={[
                styles.overflowText,
                { color: colors.text.secondary, fontSize: size * 0.36 },
              ]}
            >
              +{overflow > 99 ? '99' : overflow}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export const ChallengeParticipantStack = React.memo(ChallengeParticipantStackComponent);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  cluster: { flexDirection: 'row', alignItems: 'center' },
  overflow: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  overflowText: {
    fontWeight: '700',
  },
});
