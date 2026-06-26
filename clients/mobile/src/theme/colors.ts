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

// ─────────────────────────────────────────────────────────────────────────────
// Theme variants — a 9-palette color system. DESIGN/LAYOUT IS IDENTICAL across
// every variant; only color *tokens* swap. This is purely additive: the existing
// `colors` export, the dark/light schemes and the Night Read flow are untouched.
//
// Each variant is a full `ThemeVariantColors` object — the exact shape consumed
// by `useTheme()` (background / border / text / accent / success / error /
// warning / info / gradients / brand). The `accent.*` sub-palette keeps EVERY
// Aurora key (cyan/blue/purple/red/amber/emerald/orange/pink) so no screen that
// reads e.g. `colors.accent.red` (the Log Out button) ever crashes; only the
// brand-driving keys (lime/limeLight/limeDark + the coral* legacy aliases) and
// text/background/border swap per theme. The PRIMARY brand accent is the value
// historically named `accent.coral` (the CTA / active-state color).
//
// `gradients.coralCta` (and its `limeCta` brand alias) is rebuilt per theme as
// [accent, ~12% darker accent] so the shared CTA fill (CtaButton, "Log Meal",
// Training start) renders in the variant's brand color. Other decorative
// gradients (cyan/purple/dark/card) reuse sensible per-mode bases.
//
// Theme #1 `midnight-lime` MUST equal the existing Aurora dark palette
// unchanged — it is the default and keeps the current look byte-for-byte. It is
// asserted equal to `getThemeColors('dark')` by the theme tests.
// ─────────────────────────────────────────────────────────────────────────────

/** The exact object shape every variant must provide (matches `ThemeColors`). */
export type ThemeVariantColors = {
  background: { primary: string; secondary: string; tertiary: string; quaternary: string };
  border: { default: string; light: string; focus: string };
  // Same KEY set as the Aurora `colors.accent` palette, but string-valued: each
  // variant recomputes the brand-driving keys (lime*/coral*), so the literal hex
  // types from `as const` would reject the wider computed strings. Consumers only
  // ever read these as strings, so widening to `string` is safe.
  accent: Record<keyof typeof colors.accent, string>;
  text: { primary: string; secondary: string; tertiary: string; accent: string; inverse: string };
  success: string;
  error: string;
  warning: string;
  info: string;
  gradients: {
    lime: readonly [string, string];
    coral: readonly [string, string];
    limeCta: readonly [string, string];
    coralCta: readonly [string, string];
    cyan: readonly [string, string];
    purple: readonly [string, string];
    dark: readonly [string, string];
    card: readonly [string, string];
  };
  /** Convenience brand alias (= the PRIMARY accent, historically `accent.coral`). */
  brand: string;
};

/** Darken a #RRGGBB hex by a fraction (0..1). Used to derive CTA gradient ends. */
function darkenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  const h = (c: number) => f(c).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Lighten a #RRGGBB hex toward white by a fraction (0..1). Derives `accentLight`. */
function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (255 - c) * amount)));
  const h = (c: number) => f(c).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Per-variant overrides; everything else is derived to keep callers identical. */
interface VariantSpec {
  bg: string;
  surface: string;
  border: string;
  accent: string; // PRIMARY brand accent (→ accent.coral / accent.lime + CTA)
  ink: string;    // text shown ON the accent (→ text.inverse)
  text: string;   // → text.primary
  muted: string;  // → text.secondary
  isDark: boolean;
}

/**
 * Build a full `ThemeVariantColors` from a small spec. The accent sub-palette
 * preserves every Aurora hue (so `accent.cyan` etc. never go missing) and only
 * the brand-driving keys (lime/limeLight/limeDark + coral* legacy aliases) take
 * the variant's accent. success/error/warning/info reuse the existing dark/light
 * semantic bases so a success toast never reads off-brand.
 */
function buildVariant(spec: VariantSpec): ThemeVariantColors {
  const { bg, surface, border, accent, ink, text, muted, isDark } = spec;
  // Tertiary surface: nudge the card surface slightly toward (dark) lighter or
  // (light) darker so elevated surfaces read distinct from the card surface.
  const tertiary = isDark ? lightenHex(surface, 0.06) : darkenHex(surface, 0.03);
  const quaternary = isDark ? lightenHex(surface, 0.12) : darkenHex(surface, 0.06);
  const accentLight = lightenHex(accent, 0.25);
  const accentDark = darkenHex(accent, 0.12);
  const borderLight = isDark ? lightenHex(border, 0.18) : darkenHex(border, 0.06);
  const tertiaryText = isDark ? lightenHex(muted, -0.18) /* slightly dimmer */ : lightenHex(muted, 0.18);
  // success/error/warning/info: keep the existing Aurora bases for dark variants
  // and the light-mode-friendly equivalents for light variants. These are hue
  // semantics, not brand, so they stay constant across same-mode variants.
  const semantic = {
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    info: colors.info,
  };
  return {
    background: { primary: bg, secondary: surface, tertiary, quaternary },
    border: { default: border, light: borderLight, focus: accent },
    accent: {
      ...colors.accent,
      lime: accent,
      limeLight: accentLight,
      limeDark: accentDark,
      coral: accent,
      coralLight: accentLight,
      coralDark: accentDark,
    },
    text: {
      primary: text,
      secondary: muted,
      tertiary: tertiaryText,
      accent,
      inverse: ink,
    },
    ...semantic,
    gradients: {
      lime: [accent, accentDark] as const,
      coral: [accent, accentDark] as const,
      limeCta: [accent, accentDark] as const,
      coralCta: [accent, accentDark] as const,
      cyan: colors.gradients.cyan,
      purple: colors.gradients.purple,
      dark: [surface, bg] as const,
      card: isDark
        ? ([`rgba(255,255,255,0.04)`, `rgba(255,255,255,0.015)`] as const)
        : ([`rgba(0,0,0,0.02)`, `rgba(0,0,0,0.006)`] as const),
    },
    brand: accent,
  };
}

/**
 * Theme #1 — `midnight-lime`. Built to be byte-identical to the live Aurora dark
 * palette (`getThemeColors('dark')`), NOT via `buildVariant`, so the default look
 * is preserved exactly and the equality invariant in the theme tests holds.
 */
const midnightLime: ThemeVariantColors = {
  background: colors.background,
  border: colors.border,
  accent: colors.accent,
  text: colors.text,
  success: colors.success,
  error: colors.error,
  warning: colors.warning,
  info: colors.info,
  gradients: colors.gradients,
  brand: colors.accent.coral,
};

/** A picker-friendly identifier for every shipped variant. */
export type ThemeVariantId =
  | 'midnight-lime'
  | 'ember'
  | 'aurora-violet'
  | 'daylight'
  | 'mist'
  | 'mono'
  | 'pearl'
  | 'blush'
  | 'rose';

/**
 * The 9 variants, keyed by id. Theme #1 is the unchanged Aurora dark palette;
 * the other 8 swap core tokens per the design spec while keeping the shape.
 */
export const themeVariants: Record<ThemeVariantId, ThemeVariantColors> = {
  'midnight-lime': midnightLime,
  ember: buildVariant({
    bg: '#110D09', surface: '#1C1610', border: '#312820',
    accent: '#FF9A3C', ink: '#2A1502', text: '#F6F2EB', muted: '#9E9185', isDark: true,
  }),
  'aurora-violet': buildVariant({
    bg: '#0B0B15', surface: '#16161F', border: '#272636',
    accent: '#9D7CFF', ink: '#160D2E', text: '#F1F1FA', muted: '#8C8AA0', isDark: true,
  }),
  daylight: buildVariant({
    bg: '#F4F7EE', surface: '#FFFFFF', border: '#E5E9DD',
    accent: '#5DA425', ink: '#FFFFFF', text: '#161A1E', muted: '#69707E', isDark: false,
  }),
  mist: buildVariant({
    bg: '#F2F5FB', surface: '#FFFFFF', border: '#E2E7F0',
    accent: '#5560E6', ink: '#FFFFFF', text: '#181D27', muted: '#69707E', isDark: false,
  }),
  mono: buildVariant({
    bg: '#0A0A0B', surface: '#161618', border: '#29292E',
    accent: '#FFFFFF', ink: '#0A0A0B', text: '#FFFFFF', muted: '#8A8A92', isDark: true,
  }),
  pearl: buildVariant({
    bg: '#F4F4F6', surface: '#FFFFFF', border: '#E4E4E9',
    accent: '#1A1A1E', ink: '#FFFFFF', text: '#16161A', muted: '#76767E', isDark: false,
  }),
  blush: buildVariant({
    bg: '#FBF2F5', surface: '#FFFFFF', border: '#F2DCE4',
    accent: '#EC6F9E', ink: '#FFFFFF', text: '#2A1D24', muted: '#9D8089', isDark: false,
  }),
  rose: buildVariant({
    bg: '#140E12', surface: '#1F141A', border: '#332231',
    accent: '#FF8FB8', ink: '#2A0D1C', text: '#F8EEF3', muted: '#A38A95', isDark: true,
  }),
};

/** Lightweight descriptor list for the Settings picker UI (no full palettes). */
export interface ThemeVariantMeta {
  id: ThemeVariantId;
  name: string;
  isDark: boolean;
  accent: string;
  bg: string;
}

export const themeVariantList: ThemeVariantMeta[] = [
  { id: 'midnight-lime', name: 'Midnight Lime', isDark: true, accent: '#A8CC3C', bg: '#0A0C12' },
  { id: 'ember', name: 'Ember', isDark: true, accent: '#FF9A3C', bg: '#110D09' },
  { id: 'aurora-violet', name: 'Aurora', isDark: true, accent: '#9D7CFF', bg: '#0B0B15' },
  { id: 'daylight', name: 'Daylight', isDark: false, accent: '#5DA425', bg: '#F4F7EE' },
  { id: 'mist', name: 'Mist', isDark: false, accent: '#5560E6', bg: '#F2F5FB' },
  { id: 'mono', name: 'Mono', isDark: true, accent: '#FFFFFF', bg: '#0A0A0B' },
  { id: 'pearl', name: 'Pearl', isDark: false, accent: '#1A1A1E', bg: '#F4F4F6' },
  { id: 'blush', name: 'Blush', isDark: false, accent: '#EC6F9E', bg: '#FBF2F5' },
  { id: 'rose', name: 'Rosé', isDark: true, accent: '#FF8FB8', bg: '#140E12' },
];

/** Default variant id — the unchanged Aurora dark look. */
export const DEFAULT_THEME_VARIANT: ThemeVariantId = 'midnight-lime';

/** Resolve a variant by id, falling back to the default for any unknown id. */
export function getThemeVariantColors(id: string): ThemeVariantColors {
  return themeVariants[id as ThemeVariantId] ?? themeVariants[DEFAULT_THEME_VARIANT];
}
