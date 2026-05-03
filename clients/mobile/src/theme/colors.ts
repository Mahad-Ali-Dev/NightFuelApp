// NightFuel Design System — Color Palette
// Derived from 49 Stitch-generated UI screens

export const colors = {
  // Core backgrounds
  background: {
    primary: '#0D1117',    // Deep navy black
    secondary: '#161B22',  // Card surface
    tertiary: '#1C2333',   // Elevated surface
    quaternary: '#21262D', // Higher elevation
  },

  // Borders & dividers
  border: {
    default: '#2D3748',    // Subtle borders
    light: '#373E4A',      // Lighter border
    focus: '#FF6B35',      // Focus ring
  },

  // Accent colors
  accent: {
    coral: '#FF6B35',      // Primary CTA, brand
    coralLight: '#FF8A5C',
    coralDark: '#E55A25',
    cyan: '#00D4AA',       // Success, progress
    cyanLight: '#33DDBB',
    cyanDark: '#00B894',
    blue: '#4FC3F7',       // Informational
    blueLight: '#81D4FA',
    purple: '#7C4DFF',     // AI & Coach
    purpleLight: '#9E7BFF',
    purpleDark: '#6233CC',
    red: '#FF4444',        // Danger, warnings
    redLight: '#FF6B6B',
    amber: '#FFB300',      // Caution
    amberLight: '#FFC940',
    emerald: '#10B981',    // Positive/active states
    orange: '#F97316',     // Warm highlights
  },

  // Text colors
  text: {
    primary: '#FFFFFF',
    secondary: '#8B949E',
    tertiary: '#484F58',
    accent: '#FF6B35',
    inverse: '#0D1117',
  },

  // Semantic colors
  success: '#00D4AA',
  error: '#FF4444',
  warning: '#FFB300',
  info: '#4FC3F7',

  // Gradient stops
  gradients: {
    coral: ['#FF6B35', '#FF4444'] as const,
    cyan: ['#00D4AA', '#4FC3F7'] as const,
    purple: ['#7C4DFF', '#B47CFF'] as const,
    dark: ['#161B22', '#0D1117'] as const,
    card: ['rgba(22,27,34,0.8)', 'rgba(13,17,23,0.9)'] as const,
  },

  // Light mode overrides
  light: {
    background: {
      primary: '#F0F2F5',
      secondary: '#FFFFFF',
      tertiary: '#F7F8FA',
      quaternary: '#E8ECF0',
    },
    border: {
      default: '#D0D7DE',
      light: '#E1E7ED',
      focus: '#FF6B35',
    },
    text: {
      primary: '#1B1F23',
      secondary: '#57606A',
      tertiary: '#8B949E',
      accent: '#FF6B35',
      inverse: '#FFFFFF',
    },
  },
} as const;

export type ColorScheme = 'dark' | 'light';
