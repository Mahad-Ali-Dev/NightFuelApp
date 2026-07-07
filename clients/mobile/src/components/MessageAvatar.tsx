/**
 * MessageAvatar — a local, brand-safe avatar treatment for the inbox rows.
 *
 * Why this exists (and isn't the shared `Avatar`): the shared primitive renders
 * its no-photo fallback as WHITE initials on a lime gradient fill
 * (src/components/ui/Avatar.tsx:65,83). Zeitra's brand explicitly forbids
 * white-on-lime, and a fresh social graph has no avatarUrl on most rows — so the
 * inbox, which leans on an avatar per row, would be splashed with the forbidden
 * combo. This screen-local wrapper keeps us out of the shared primitive while
 * fixing the contrast:
 *
 *   • Real photo (https URL present) → delegate to the shared `Avatar` so we
 *     reuse its expo-image caching/transition and the exact ring contract.
 *   • No photo (the common case) → a DARK-GLASS fill with LIME initials
 *     (accent.coral === the Zeitra lime value) — lime-on-dark, never white-on-lime.
 *
 * The `name` / `size` / `borderColor` props mirror `Avatar` so the row renderer
 * stays a one-for-one swap. Purely presentational; no data/handlers here.
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';
import { Avatar } from '@/components/ui';

interface MessageAvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  borderColor?: string;
  style?: ViewStyle;
}

function MessageAvatarComponent({ uri, name, size = 52, borderColor, style }: MessageAvatarProps) {
  const { colors } = useTheme();

  // Real photo → reuse the shared primitive (caching, transition, ring).
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

  // No photo → dark-glass tile with lime initials. Lime-on-dark satisfies the
  // brand rule; the faint lime tint keeps a person-y warmth without a lime fill.
  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: withAlpha(colors.accent.coral, 0.12),
          borderWidth: borderColor ? 2 : 1,
          borderColor: borderColor ?? withAlpha(colors.text.primary, 0.08),
        },
        style,
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.38, color: colors.accent.coral }]}>
        {initials}
      </Text>
    </View>
  );
}

/** Memoized — strings/number props; avatars repeat per row in the inbox list. */
export const MessageAvatar = React.memo(MessageAvatarComponent);

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '700',
  },
});
