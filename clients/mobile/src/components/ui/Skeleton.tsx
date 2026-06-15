import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle, DimensionValue, StyleProp } from 'react-native';
import { useTheme } from '@/theme';
import { borderRadius as br, spacing } from '@/theme/spacing';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Aurora shimmer/pulse loading placeholder.
 * Animates opacity between ~0.4 and ~1 on the elevated surface color so
 * skeletons read as "soft glass blocks" while content loads.
 */
function SkeletonComponent({ width = '100%', height = 16, radius = br.md, style }: SkeletonProps) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width: width as DimensionValue,
          height,
          borderRadius: radius,
          backgroundColor: colors.background.tertiary,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

/**
 * Memoized: primitive size/radius props plus an optional `style`. Skeleton
 * grids often render many instances while content loads.
 */
export const Skeleton = React.memo(SkeletonComponent);

interface SkeletonCardProps {
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Convenience rounded block for card-shaped loading states.
 */
function SkeletonCardComponent({ height = 96, radius = br.xl, style }: SkeletonCardProps) {
  return <Skeleton width="100%" height={height} radius={radius} style={[styles.card, style]} />;
}

/** Memoized: numeric props plus an optional `style`. */
export const SkeletonCard = React.memo(SkeletonCardComponent);

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
});
