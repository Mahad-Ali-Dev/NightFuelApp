import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  PressableProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { borderRadius as br, spacing } from '@/theme/spacing';

interface ButtonProps extends PressableProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const { colors } = useTheme();

  const sizeStyles = SIZE_MAP[size];
  const isDisabled = disabled || loading;

  const content = (
    <>
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' || variant === 'ghost' ? colors.accent.coral : '#FFF'}
          size="small"
          style={{ marginRight: spacing.sm }}
        />
      ) : icon ? (
        <>{icon}</>
      ) : null}
      <Text
        style={[
          styles.text,
          sizeStyles.text,
          variant === 'outline' && { color: colors.accent.coral },
          variant === 'ghost' && { color: colors.text.secondary },
          variant === 'danger' && { color: '#FFF' },
          (variant === 'primary' || variant === 'secondary') && { color: '#FFF' },
          isDisabled && { opacity: 0.5 },
        ]}
      >
        {title}
      </Text>
      {iconRight && <>{iconRight}</>}
    </>
  );

  if (variant === 'primary') {
    return (
      <Pressable
        disabled={isDisabled}
        style={[fullWidth && styles.fullWidth, style as ViewStyle]}
        {...props}
      >
        {({ pressed }) => (
          <LinearGradient
            colors={[colors.accent.coral, colors.accent.coralDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.button,
              sizeStyles.button,
              fullWidth && styles.fullWidth,
              pressed && { opacity: 0.85 },
              isDisabled && { opacity: 0.5 },
            ]}
          >
            {content}
          </LinearGradient>
        )}
      </Pressable>
    );
  }

  const bgMap: Record<string, string> = {
    secondary: colors.background.tertiary,
    outline: 'transparent',
    ghost: 'transparent',
    danger: colors.accent.red,
  };

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        sizeStyles.button,
        {
          backgroundColor: bgMap[variant] ?? colors.background.tertiary,
          borderWidth: variant === 'outline' ? 1.5 : 0,
          borderColor: variant === 'outline' ? colors.accent.coral : undefined,
        },
        fullWidth && styles.fullWidth,
        pressed && { opacity: 0.8 },
        isDisabled && { opacity: 0.5 },
        style as ViewStyle,
      ]}
      {...props}
    >
      {content}
    </Pressable>
  );
}

const SIZE_MAP = {
  sm: {
    button: { height: 36, paddingHorizontal: spacing.md, borderRadius: br.md } as ViewStyle,
    text: { fontSize: 13 } as TextStyle,
  },
  md: {
    button: { height: 48, paddingHorizontal: spacing.xl, borderRadius: br.lg } as ViewStyle,
    text: { fontSize: 15 } as TextStyle,
  },
  lg: {
    button: { height: 56, paddingHorizontal: spacing['2xl'], borderRadius: br.xl } as ViewStyle,
    text: { fontSize: 17 } as TextStyle,
  },
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    fontWeight: '600',
    color: '#FFFFFF',
  },
  fullWidth: {
    width: '100%',
  },
});
