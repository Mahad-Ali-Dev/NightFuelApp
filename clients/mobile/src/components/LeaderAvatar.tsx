import React from 'react';
import { Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

interface LeaderAvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  borderColor?: string;
  style?: ViewStyle;
}

/**
 * Leaderboard-scoped avatar.
 *
 * The shared <Avatar> primitive renders its photo-less fallback as WHITE
 * initials over a lime gradient — the one color pairing the Zeitra brand
 * forbids ("never white on lime"). It's highly visible on this screen (every
 * photo-less athlete on the podium + pack rows), so this local wrapper fixes it
 * here without editing the shared primitive:
 *
 *   • photo present  → delegate verbatim to <Avatar> (identical image rendering)
 *   • photo missing  → a softened lime → coralDark gradient with INK initials
 *                      (text.inverse #0A0C12), the brand-correct ink-on-lime.
 *
 * Keeps the Avatar prop surface (uri / name / size / borderColor / style) so it
 * is a drop-in. Memoized for list reuse, like the primitive it shadows.
 */
function LeaderAvatarComponent({ uri, name, size = 40, borderColor, style }: LeaderAvatarProps) {
  const { colors } = useTheme();

  // With a photo there's no lime fill and no initials — defer to the primitive
  // so cached image rendering / transitions stay byte-identical.
  if (uri) {
    return <Avatar uri={uri} name={name} size={size} borderColor={borderColor} style={style} />;
  }

  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <LinearGradient
      colors={colors.gradients.coral}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: borderColor ? 2 : 0,
          borderColor: borderColor ?? 'transparent',
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.initials,
          { fontSize: size * 0.38, color: colors.text.inverse, textShadowColor: withAlpha(colors.text.inverse, 0.12) },
        ]}
        allowFontScaling={false}
      >
        {initials}
      </Text>
    </LinearGradient>
  );
}

/**
 * Memoized: `uri`/`name`/`borderColor` are strings and `size` is a number —
 * the same shallow-compare contract as the shared Avatar, so recycled
 * leaderboard rows skip unchanged avatars.
 */
export const LeaderAvatar = React.memo(LeaderAvatarComponent);

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    // INK on lime (text.inverse), never white — the brand-correct pairing.
    fontWeight: '700',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});
