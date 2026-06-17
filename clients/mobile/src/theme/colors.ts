// NightFuel Design System — Color Palette
// "Aurora" — premium dark glass. Deep cool near-black surfaces, coral→pink brand
// gradient, refined low-contrast glass borders. Keys are stable (screens depend on
// them); only the values changed from the original GitHub-dark palette.

export const colors = {
  // Core backgrounds — deep, cool, premium (was GitHub-gray #0D1117)
  background: {
    primary: '#0A0C12',    // Deep near-black, cool undertone
    secondary: '#13161F',  // Card surface
    tertiary: '#1B2030',   // Elevated surface
    quaternary: '#242B3D', // Higher elevation
  },

  // Borders & dividers — subtle "glass" hairlines
  border: {
    default: '#222838',    // Subtle borders
    light: '#2F3650',      // Lighter border
    focus: '#FF6B35',      // Focus ring
  },

  // Accent colors
  accent: {
    coral: '#FF6B35',      // Primary CTA, brand
    coralLight: '#FF8A5C',
    coralDark: '#E55A25',
    pink: '#FF4D8D',       // Aurora gradient partner / highlights
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
    secondary: '#9BA3B4',  // brighter for better contrast on the deeper bg
    tertiary: '#5A6373',
    accent: '#FF6B35',
    inverse: '#0A0C12',
  },

  // Semantic colors
  success: '#00D4AA',
  error: '#FF4444',
  warning: '#FFB300',
  info: '#4FC3F7',

  // Gradient stops
  gradients: {
    coral: ['#FF7A45', '#FF4D8D'] as const,   // premium coral→pink (brand hero)
    // AA-lifted coral→pink CTA fill. Starts at the DARKER coral (coralDark
    // #E55A25) — NOT the brand hero's light #FF7A45 — so white labels/icons on
    // the fill clear AA contrast. Shared so the Dashboard "Log Meal" and the
    // Training Start/active CTAs render a byte-identical fill from one token
    // (retires the per-screen CTA_GRADIENT copies the two tabs duplicated).
    coralCta: ['#E55A25', '#FF4D8D'] as const, // = [accent.coralDark, accent.pink]
    cyan: ['#00D4AA', '#4FC3F7'] as const,
    purple: ['#7C4DFF', '#B47CFF'] as const,
    dark: ['#13161F', '#0A0C12'] as const,
    card: ['rgba(25,29,40,0.72)', 'rgba(12,14,20,0.88)'] as const,
  },

  // Light mode overrides
  light: {
    background: {
      primary: '#F4F5F7',
      secondary: '#FFFFFF',
      tertiary: '#F7F8FA',
      quaternary: '#E8ECF0',
    },
    border: {
      default: '#E2E5EA',
      light: '#EDEFF2',
      focus: '#FF6B35',
    },
    text: {
      primary: '#16181D',
      secondary: '#57606A',
      tertiary: '#8B949E',
      accent: '#FF6B35',
      inverse: '#FFFFFF',
    },
  },
} as const;

export type ColorScheme = 'dark' | 'light';
