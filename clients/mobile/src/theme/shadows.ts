import { Platform, ViewStyle } from 'react-native';

// Zeitra Design System — Elevation Shadows

export const shadows = {
  sm: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.16,
      shadowRadius: 2,
    },
    android: {
      elevation: 2,
    },
  })!,

  md: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },
    android: {
      elevation: 4,
    },
  })!,

  lg: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.24,
      shadowRadius: 8,
    },
    android: {
      elevation: 8,
    },
  })!,

  xl: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.32,
      shadowRadius: 16,
    },
    android: {
      elevation: 12,
    },
  })!,

  glow: (color: string): ViewStyle =>
    Platform.select<ViewStyle>({
      ios: {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    })!,
} as const;
