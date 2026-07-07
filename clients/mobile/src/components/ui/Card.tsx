import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { borderRadius as br, spacing } from '@/theme/spacing';

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated' | 'glass';
  padding?: keyof typeof spacing;
  noPadding?: boolean;
}

export function Card({
  variant = 'default',
  padding = 'lg',
  noPadding = false,
  style,
  children,
  ...props
}: CardProps) {
  const { colors } = useTheme();
  const padValue = noPadding ? 0 : spacing[padding];

  if (variant === 'glass') {
    return (
      <LinearGradient
        colors={colors.gradients.card}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.card,
          {
            padding: padValue,
            borderColor: colors.border.default,
          },
          style,
        ]}
        {...props}
      >
        {/* Faint top highlight for a frosted-glass sheen */}
        <LinearGradient
          colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.sheen}
          pointerEvents="none"
        />
        {children}
      </LinearGradient>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          padding: padValue,
          backgroundColor:
            variant === 'elevated'
              ? colors.background.tertiary
              : colors.background.secondary,
          borderColor: colors.border.default,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: br.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
  },
});
