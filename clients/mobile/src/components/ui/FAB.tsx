import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { shadows } from '@/theme/shadows';

interface FABProps {
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'coral' | 'purple';
  size?: number;
  onPress: () => void;
  style?: ViewStyle;
}

export function FAB({
  icon = 'add',
  variant = 'coral',
  size = 56,
  onPress,
  style,
}: FABProps) {
  const { colors } = useTheme();

  const gradientColors =
    variant === 'purple'
      ? [colors.accent.purple, colors.accent.purpleDark] as const
      : [colors.accent.coral, colors.accent.coralDark] as const;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        { width: size, height: size, borderRadius: size / 2 },
        shadows.lg,
        pressed && { transform: [{ scale: 0.92 }] },
        style,
      ]}
    >
      <LinearGradient
        colors={gradientColors}
        style={[styles.gradient, { borderRadius: size / 2 }] as any}
      >
        <Ionicons name={icon} size={size * 0.45} color="#FFFFFF" />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    zIndex: 100,
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
