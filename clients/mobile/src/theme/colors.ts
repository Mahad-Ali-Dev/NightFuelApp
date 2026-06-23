// Zeitra Design System — Color Palette
// "Aurora" — premium dark glass. Deep cool near-black surfaces over an electric
// LIME brand accent, refined low-contrast glass borders. Keys are stable (screens
// depend on them); only the values changed from the original GitHub-dark palette.
//
// NAMING NOTE: the legacy keys accent.coral / coralLight / coralDark and
// gradients.coral / coralCta predate the Aurora→Zeitra rebrand and now resolve to
// LIME (#A8CC3C / #93B82E), NOT coral — no coral pixel is rendered anywhere. New
// code should prefer the brand-accurate aliases accent.lime / accent.limeLight /
// accent.limeDark and gradients.lime / gradients.limeCta (defined below, same
// hex). The coral* keys are retained only so existing screens keep compiling.

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
    focus: '#A8CC3C',      // Focus ring
  },

  // Accent colors
  accent: {
    // Brand-accurate LIME aliases — prefer these in new code. Same hex as the
    // legacy coral* keys below (which despite the name resolve to lime).
    lime: '#A8CC3C',       // Primary CTA + key indicators (the 10% accent)
    limeLight: '#C5E06B',
    limeDark: '#93B82E',
    coral: '#A8CC3C',      // LEGACY alias of accent.lime — resolves to lime, not coral
    coralLight: '#C5E06B', // LEGACY alias of accent.limeLight
    coralDark: '#93B82E',  // LEGACY alias of accent.limeDark
    pink: '#93B82E',       // Aurora gradient partner / highlights
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
    tertiary: '#7B8497',  // AA-lifted: 5.2:1 on background.primary (#0A0C12); was #5A6373 (3.23:1, failed AA)
    accent: '#A8CC3C',
    inverse: '#0A0C12',
  },

  // Semantic colors
  success: '#00D4AA',
  error: '#FF4444',
  warning: '#FFB300',
  info: '#4FC3F7',

  // Gradient stops
  gradients: {
    // Zeitra lime brand-hero gradient (lime → deeper lime). `lime`/`limeCta` are
    // the brand-accurate names; `coral`/`coralCta` are LEGACY aliases of the same
    // arrays, kept so existing consumers keep compiling.
    lime: ['#A8CC3C', '#93B82E'] as const,
    coral: ['#A8CC3C', '#93B82E'] as const,   // LEGACY alias of gradients.lime
    // The Zeitra lime CTA fill: starts at the bright lime #A8CC3C (= accent.lime)
    // and deepens to #93B82E (= accent.limeDark). Labels/icons on this fill are
    // INK (#0A0C12), NEVER white — ink-on-lime is the high-contrast brand recipe.
    // Shared so the Dashboard "Log Meal" and the Training Start/active CTAs render
    // a byte-identical fill from one token.
    limeCta: ['#A8CC3C', '#93B82E'] as const, // = [accent.lime, accent.limeDark]
    coralCta: ['#A8CC3C', '#93B82E'] as const, // LEGACY alias of gradients.limeCta
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
      focus: '#A8CC3C',
    },
    text: {
      primary: '#16181D',
      secondary: '#57606A',
      tertiary: '#8B949E',
      accent: '#A8CC3C',
      inverse: '#FFFFFF',
    },
  },
} as const;

export type ColorScheme = 'dark' | 'light';
