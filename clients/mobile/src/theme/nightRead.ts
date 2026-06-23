// Zeitra Design System — "Night Read" theme variant
// Deep-red-only palette for late-night reading. Aurora's bright coral / cyan
// accents disrupt melatonin for users checking the app at 3am, undermining the
// circadian thesis. This variant collapses every accent to dim red on a
// near-black background so the UI is legible without spiking the user awake.
//
// Shape parity with `colors` from ./colors is enforced by nightRead.test.ts:
// every key on resolveTheme('aurora') must also exist on resolveTheme('nightRead').
//
// NOTE: This file is intentionally NOT imported anywhere yet. The Settings
// toggle that consumes it lands in a follow-up sprint so this change stays
// disjoint from concurrent sprint-7 Settings work. Aurora is unchanged.

import { colors as auroraColors } from './colors';

export const nightReadColors = {
  // Core backgrounds — near-black, warm undertone (red-shifted instead of cool)
  background: {
    primary: '#0A0000',    // Deep near-black with red bias
    secondary: '#140404',  // Card surface
    tertiary: '#1C0808',   // Elevated surface
    quaternary: '#260C0C', // Higher elevation
  },

  // Borders & dividers — dim red hairlines
  border: {
    default: '#2A0A0A',
    light: '#3A1414',
    focus: '#8C1A1A',
  },

  // Accent colors — every accent collapses to dim red. UI elements that want a
  // contrasting hue still get red, just darker, so visual hierarchy survives
  // without any wavelength bright enough to disrupt sleep.
  accent: {
    coral: '#8C1A1A',      // Primary CTA, brand (was bright coral)
    coralLight: '#A02020',
    coralDark: '#701414',
    // Brand-accurate lime aliases — mirror coral* (in Aurora, lime === coral).
    // Red-shifted to the same dim red here; present for shape parity (colors.ts).
    lime: '#8C1A1A',
    limeLight: '#A02020',
    limeDark: '#701414',
    pink: '#8C1A1A',       // Aurora gradient partner — flattened to red
    cyan: '#8C1A1A',       // Success/progress — aliased to red per spec
    cyanLight: '#A02020',
    cyanDark: '#701414',
    blue: '#5C2A2A',       // Informational — desaturated red-brown
    blueLight: '#704040',
    purple: '#3A1010',     // AI & Coach — deep red
    purpleLight: '#4F1818',
    purpleDark: '#2A0A0A',
    red: '#8C1A1A',        // Danger
    redLight: '#A02020',
    amber: '#5C2A0F',      // Caution — burnt umber
    amberLight: '#704018',
    emerald: '#2A1414',    // Positive/active — very dark red-brown
    orange: '#5C2A0F',     // Warm highlights — burnt umber
  },

  // Text colors — warm muted reds, no white (white at 3am is the problem)
  text: {
    primary: '#E8B5B5',
    secondary: '#A47878',
    tertiary: '#6B4444',
    accent: '#8C1A1A',
    inverse: '#0A0000',
  },

  // Semantic colors — all red-family so a success toast doesn't flash green
  success: '#8C1A1A',
  error: '#8C1A1A',
  warning: '#5C2A0F',
  info: '#5C2A2A',

  // Gradient stops — single-color arrays so brand gradients flatten to a
  // single dim-red wash. Type is a 2-tuple for parity with Aurora's `as const`
  // gradient pairs (LinearGradient consumers expect at least 2 stops).
  gradients: {
    coral: ['#8C1A1A', '#8C1A1A'] as const,
    // Mirrors Aurora's `gradients.coralCta` (the shared coral→pink CTA fill) so
    // shape-parity holds when the Night Read flag is ON; flattened to the same
    // dim red as `coral` per this variant's single-wavelength convention.
    coralCta: ['#8C1A1A', '#8C1A1A'] as const,
    // lime / limeCta — brand-accurate aliases of coral / coralCta (Aurora's lime
    // gradients === the coral ones). Flattened to the same dim red here.
    lime: ['#8C1A1A', '#8C1A1A'] as const,
    limeCta: ['#8C1A1A', '#8C1A1A'] as const,
    cyan: ['#8C1A1A', '#8C1A1A'] as const,
    purple: ['#3A1010', '#3A1010'] as const,
    dark: ['#140404', '#0A0000'] as const,
    card: ['rgba(20,4,4,0.72)', 'rgba(10,0,0,0.88)'] as const,
  },
} as const;

/**
 * Resolve the active theme colors by variant name.
 *
 * Aurora returns the live colors from ./colors (no copy, no edits to Aurora)
 * so any future tweak to Aurora flows through automatically. NightRead returns
 * the constant above.
 *
 * The return type is `typeof nightReadColors` because nightRead is the stricter
 * subset shape (no `light` sub-tree); Aurora is structurally compatible with
 * this shape on the keys nightRead exposes.
 */
export function resolveTheme(
  variant: 'aurora' | 'nightRead'
): typeof nightReadColors {
  if (variant === 'nightRead') {
    return nightReadColors;
  }
  // Aurora branch — re-export the live Aurora colors. Cast is safe: nightRead's
  // shape is a structural subset of Aurora's `colors` export, and consumers of
  // resolveTheme only read keys that exist on both.
  return auroraColors as unknown as typeof nightReadColors;
}
