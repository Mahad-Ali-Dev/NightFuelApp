import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { borderRadius as br } from '@/theme/spacing';

interface ProgressBarProps {
  progress: number; // 0–100
  color?: string;
  gradientColors?: readonly [string, string];
  height?: number;
  trackColor?: string;
  style?: ViewStyle;
}

function ProgressBarComponent({
  progress,
  color,
  gradientColors,
  height = 6,
  trackColor,
  style,
}: ProgressBarProps) {
  const { colors } = useTheme();
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <View
      style={[
        styles.track,
        {
          height,
          backgroundColor: trackColor ?? colors.border.default,
          borderRadius: height / 2,
        },
        style,
      ]}
    >
      {gradientColors ? (
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.fill,
            { width: `${clamped}%`, borderRadius: height / 2 },
          ]}
        />
      ) : (
        <View
          style={[
            styles.fill,
            {
              width: `${clamped}%`,
              backgroundColor: color ?? colors.accent.coral,
              borderRadius: height / 2,
            },
          ]}
        />
      )}
    </View>
  );
}

/**
 * Memoized: `progress`/`height` are numbers and colors are strings. The
 * optional `gradientColors`/`style` may be inline (just no skip then) — safe.
 */
export const ProgressBar = React.memo(ProgressBarComponent);

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
