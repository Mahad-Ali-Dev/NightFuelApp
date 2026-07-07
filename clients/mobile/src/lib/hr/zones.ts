/**
 * hr/zones.ts — heart-rate training zones + age→max-HR math.
 *
 * The SINGLE source of truth for HR zones, shared by every heart-rate surface
 * (the BLE live screen `app/(performance)/heart-rate.tsx` and the camera-PPG
 * measurement screen). Previously this lived inline in the BLE screen; it is
 * hoisted here so both screens classify a BPM identically and there is one place
 * to tune the bands.
 *
 * Pure + dependency-free at runtime (the only import is a TYPE), so it is safe to
 * import anywhere and is exercised directly on the jest gate.
 */
import type { ThemeColors } from '@/theme';

/** A heart-rate zone as a fraction-of-max band + presentation metadata. */
export interface Zone {
  key: string;
  label: string;
  sub: string;
  /** Inclusive lower / exclusive upper bound as a fraction of max HR. */
  lo: number;
  hi: number;
}

/** Default age when the profile carries no usable date of birth. */
export const DEFAULT_AGE = 30;

// Standard %-of-max HR training bands. "Resting" here is the sub-Fat-burn band
// (< 50% max) so every possible BPM maps to exactly one zone. The top band's
// `hi` sits above 1.0 so anything at/over max HR still lands in Peak.
export const ZONE_DEFS: Zone[] = [
  { key: 'resting', label: 'Resting', sub: 'Recovering', lo: 0, hi: 0.5 },
  { key: 'fat', label: 'Fat-burn', sub: 'Light · 50–70%', lo: 0.5, hi: 0.7 },
  { key: 'cardio', label: 'Cardio', sub: 'Moderate · 70–85%', lo: 0.7, hi: 0.85 },
  { key: 'peak', label: 'Peak', sub: 'Hard · 85%+', lo: 0.85, hi: 1.5 },
];

/**
 * Derive age (years) from a YYYY-MM-DD (or ISO) date of birth. Returns null when
 * absent/unparseable/out-of-range so the caller can fall back to a sane default
 * rather than compute a nonsense max HR.
 */
export function ageFromDob(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 5 && age <= 120 ? age : null;
}

/** Age-predicted maximum heart rate (the classic 220 − age estimate). */
export function maxHrForAge(age: number): number {
  return 220 - age;
}

/** The BPM at a given fraction of max HR (for rendering a band's range). */
export function bpmAtFraction(frac: number, maxHr: number): number {
  return Math.round(frac * maxHr);
}

/**
 * Which zone a BPM falls in, given the user's max HR. Returns the top zone for
 * anything at/over max, and null only when bpm is null/non-finite.
 */
export function zoneForBpm(bpm: number | null | undefined, maxHr: number): Zone | null {
  if (bpm == null || !Number.isFinite(bpm) || maxHr <= 0) return null;
  const frac = bpm / maxHr;
  return ZONE_DEFS.find((z) => frac >= z.lo && frac < z.hi) ?? ZONE_DEFS[ZONE_DEFS.length - 1] ?? null;
}

/**
 * One functional hue per zone (calm→hot). Reserves lime for the app's primary
 * CTA; callers tint the hero/active row with the active zone's colour. Takes the
 * resolved theme `colors` so it follows the active palette.
 */
export function zoneColor(colors: ThemeColors, key: string): string {
  switch (key) {
    case 'resting':
      return colors.accent.blue;
    case 'fat':
      return colors.accent.cyan;
    case 'cardio':
      return colors.accent.amber;
    case 'peak':
      return colors.accent.red;
    default:
      return colors.text.secondary;
  }
}
