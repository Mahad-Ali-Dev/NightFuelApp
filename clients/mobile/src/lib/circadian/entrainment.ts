/**
 * entrainment.ts
 *
 * Small, pure, dependency-free circadian-entrainment helpers.
 *
 * These two functions mirror logic that currently lives INLINE in the circadian
 * screen (app/(tabs)/circadian.tsx):
 *
 *   1. `entrainmentAdvice(score)` — the advice copy shown under the entrainment
 *      score gauge. The screen renders this as a ternary on `entrainmentScore`
 *      (>=80 → "good alignment", a finite score <80 → "room for improvement",
 *      `null` → "log more shifts"). This module returns the EXACT same three
 *      strings so a future sprint can swap the inline ternary for a call here
 *      with zero copy drift.
 *
 *   2. `deriveWindowsFromShift({ startTime, endTime })` — the biological-window
 *      *fallback* estimate the screen uses when no AI `circadianModel` is
 *      available. It mirrors the screen's `profileMetrics` else-branch:
 *
 *        melatoninStart = endTime   + 1h
 *        caffeineCutoff = endTime   − 6h
 *        insulinStart   = startTime
 *        peakTemp       = startTime
 *
 * Both functions are deliberately standalone and PURE:
 *   - no top-level `Date.now()` / `fetch` / I/O,
 *   - no React / native / UI imports,
 *   - deterministic for fixed inputs.
 *
 * The window math is absolute-instant `Date` arithmetic (getTime + hour
 * offsets), so an overnight shift whose `endTime` is on the next calendar day
 * (end < start in wall-clock terms) is handled naturally — the ISO timestamps
 * already encode the correct day and the offsets just add hours.
 *
 * The screen formats those instants with `toLocaleTimeString([], { hour:
 * '2-digit', minute: '2-digit' })`, which is locale/timezone-dependent. To keep
 * THIS module deterministic, the caller passes the `locale` and `timeZone` (and
 * may pass `timeOptions`) — exactly the "pass any clock/locale as params" rule.
 * We return BOTH the raw `Date` instants AND the formatted clock strings so a
 * consumer can render the strings directly or re-derive its own formatting.
 *
 * IMPORTANT: this module does NOT import or modify circadian.tsx — that screen
 * is owned elsewhere. Wiring the screen to import these helpers is a later
 * sprint; this is the additive, separately-importable, unit-tested foundation.
 */

const HOUR_MS = 3_600_000;

/**
 * Hour offsets relative to the shift's start/end instants, mirroring the
 * `profileMetrics` fallback branch in circadian.tsx. Exported so a test (or a
 * future consumer) can assert/reuse the exact deltas rather than hard-coding
 * magic numbers in two places.
 */
export const WINDOW_OFFSETS = {
  /** Melatonin onset estimate: 1h after the shift ends (endTime + 1h). */
  melatoninAfterEnd: 1,
  /** Caffeine cutoff estimate: 6h before the shift ends (endTime − 6h). */
  caffeineBeforeEnd: -6,
  /** Insulin-sensitivity window opens at clock-in (startTime). */
  insulinAfterStart: 0,
  /** Core-temperature peak estimate anchored at clock-in (startTime). */
  peakTempAfterStart: 0,
} as const;

/** The exact advice strings rendered by the circadian screen's score gauge. */
export const ENTRAINMENT_ADVICE = {
  /** Shown when a finite score is >= GOOD_ALIGNMENT_THRESHOLD. */
  good: 'Good alignment. Try getting 15m of sunlight upon waking to improve this score.',
  /** Shown when a finite score is below the threshold. */
  improve: 'Room for improvement. Focus on consistent sleep/wake times.',
  /** Shown when there is no score yet (`null`). */
  none: 'Log more shifts to calculate your score.',
} as const;

/** Scores at/above this count as "good alignment". Mirrors the `>= 80` check. */
export const GOOD_ALIGNMENT_THRESHOLD = 80;

/**
 * Return the entrainment-score advice copy for a given score.
 *
 * Mirrors the inline ternary in circadian.tsx exactly:
 *   - `score != null && score >= 80` → good-alignment copy
 *   - `score != null` (i.e. a finite score < 80) → room-for-improvement copy
 *   - `null` → log-more-shifts copy
 *
 * Pure and deterministic: same input → same string, no I/O.
 *
 * @param score the entrainment score (0–100), or `null` when not yet computed
 */
export function entrainmentAdvice(score: number | null): string {
  if (score != null && score >= GOOD_ALIGNMENT_THRESHOLD) {
    return ENTRAINMENT_ADVICE.good;
  }
  if (score != null) {
    return ENTRAINMENT_ADVICE.improve;
  }
  return ENTRAINMENT_ADVICE.none;
}

/** A shift's start/end, accepted as an ISO-8601 string OR a `Date`. */
export interface ShiftWindowInput {
  /** Shift start instant — ISO-8601 string (e.g. "2026-06-13T22:00:00.000Z") or Date. */
  startTime: string | Date;
  /** Shift end instant — ISO-8601 string or Date. May be on the next calendar day. */
  endTime: string | Date;
}

/** Options controlling how the derived instants are formatted to clock strings. */
export interface DeriveWindowsOptions {
  /**
   * BCP-47 locale (or locale list) passed to `toLocaleTimeString`. Defaults to
   * `'en-US'`. The screen passes `[]` (device default); callers that need
   * deterministic output should pass an explicit locale.
   */
  locale?: string | string[];
  /**
   * Time-zone formatting options. Defaults to `{ hour: '2-digit', minute:
   * '2-digit' }` to match circadian.tsx. Pass `timeZone` (e.g. `'UTC'`) here for
   * deterministic, machine-independent formatting.
   */
  timeOptions?: Intl.DateTimeFormatOptions;
}

/** The four biological-window anchors, as both raw instants and clock strings. */
export interface DerivedWindows {
  /** Estimated melatonin onset = endTime + 1h. */
  melatoninStart: string;
  /** Estimated caffeine cutoff = endTime − 6h. */
  caffeineCutoff: string;
  /** Insulin-sensitivity window opens at startTime. */
  insulinStart: string;
  /** Core-temperature peak anchored at startTime. */
  peakTemp: string;
  /** The raw absolute instants behind each formatted field (for re-formatting). */
  instants: {
    melatoninStart: Date;
    caffeineCutoff: Date;
    insulinStart: Date;
    peakTemp: Date;
  };
}

/** Default formatting options — match circadian.tsx's `{ hour, minute }` shape. */
const DEFAULT_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
};

/** Add a whole-hour offset to a base instant, returning a fresh Date. */
function offsetHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * HOUR_MS);
}

/**
 * Coerce an ISO string or Date into a valid Date, or throw on anything
 * unparseable. Mirrors the defensive posture in shiftTransition.ts: reject
 * malformed input loudly rather than letting an `Invalid Date` silently
 * propagate NaN/"Invalid Date" into the rendered window strings.
 */
function parseInstant(value: string | Date, field: keyof ShiftWindowInput): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`deriveWindowsFromShift: invalid ${field} Date`);
    }
    return new Date(value.getTime());
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`deriveWindowsFromShift: missing ${field}`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`deriveWindowsFromShift: invalid ${field} "${value}"`);
  }
  return d;
}

/**
 * Derive the biological-window fallback estimate from a shift's start/end.
 *
 * Mirrors the `profileMetrics` else-branch in circadian.tsx:
 *   melatoninStart = endTime   + 1h
 *   caffeineCutoff = endTime   − 6h
 *   insulinStart   = startTime
 *   peakTemp       = startTime
 *
 * Pure: the instants depend ONLY on the shift timestamps (no `Date.now()`), so
 * repeated calls yield equal instants. The formatted strings additionally
 * depend on the supplied `locale`/`timeOptions` — pass `timeZone: 'UTC'` (and an
 * explicit locale) for fully deterministic, machine-independent output.
 *
 * @param shift the shift's `startTime` / `endTime` (ISO string or Date)
 * @param options optional `locale` and `timeOptions` for clock-string formatting
 * @throws if either timestamp is missing or unparseable
 */
export function deriveWindowsFromShift(
  shift: ShiftWindowInput,
  options: DeriveWindowsOptions = {},
): DerivedWindows {
  const start = parseInstant(shift.startTime, 'startTime');
  const end = parseInstant(shift.endTime, 'endTime');

  const melatoninStart = offsetHours(end, WINDOW_OFFSETS.melatoninAfterEnd);
  const caffeineCutoff = offsetHours(end, WINDOW_OFFSETS.caffeineBeforeEnd);
  const insulinStart = offsetHours(start, WINDOW_OFFSETS.insulinAfterStart);
  const peakTemp = offsetHours(start, WINDOW_OFFSETS.peakTempAfterStart);

  const locale = options.locale ?? 'en-US';
  const timeOptions = options.timeOptions ?? DEFAULT_TIME_OPTIONS;
  const fmt = (d: Date): string => d.toLocaleTimeString(locale, timeOptions);

  return {
    melatoninStart: fmt(melatoninStart),
    caffeineCutoff: fmt(caffeineCutoff),
    insulinStart: fmt(insulinStart),
    peakTemp: fmt(peakTemp),
    instants: {
      melatoninStart,
      caffeineCutoff,
      insulinStart,
      peakTemp,
    },
  };
}

// ---------------------------------------------------------------------------
// Entrainment-score derivation (the genuine score SOURCE for item 3's hook)
// ---------------------------------------------------------------------------
//
// Background: the live circadian model already derives a real entrainment score
// inside src/api/circadian.ts (a PRIVATE `deriveEntrainmentScore` that maps the
// circular clock gap between the engine's melatonin onset and the shift's end
// onto 0–100). That score is surfaced as `CircadianModel.entrainmentScore` and
// consumed via `useEntrainmentScore`. This module now exposes the SAME math as a
// standalone, separately-importable, unit-tested pure function so a hook/screen
// can derive a score from already-extracted model signals without reaching for
// the API layer (and without scattering circadian math into a component).
//
// The formula is intentionally byte-for-byte the api-layer one so the two can
// never drift: 0h gap → 100, linear decay to a floor at ~6h of melatonin/
// shift-end drift, clamped to [0, 100].
//
// Rules applied:
//   • state-ground-truth.md — the score is a DERIVED value, never stored state.
//     This function computes it on demand from the ground-truth signals
//     (melatonin onset vs shift end); callers must NOT cache a stale number as
//     "state". Everything else is derived from the minimal truth.
//   • js-hoist-intl.md — all thresholds/constants live at module scope
//     (allocation-free); the function does no Intl/Date/RegExp/object allocation
//     on the hot path beyond the unavoidable arithmetic.

/** Minutes in a full 24h clock dial — the modulus for circular gap math. */
const MINUTES_PER_DAY = 1440;

/**
 * Melatonin-onset / shift-end drift (in minutes) at which the alignment score
 * decays to its floor (0). ~6h, identical to the api-layer derivation so the
 * standalone helper and `CircadianModel.entrainmentScore` agree exactly.
 */
const ENTRAINMENT_HALF_LIFE_MIN = 360;

/** The clamped bounds of a valid entrainment score. */
const SCORE_MIN = 0;
const SCORE_MAX = 100;

/** Matches a `"HH:MM"` / `"H:MM"` 24h clock string (no seconds). */
const CLOCK_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * The circadian-model signals the entrainment score is derived from. Both are
 * accepted as either a local 24h clock string (`"HH:MM"`) or a number of
 * minutes-since-(local)-midnight in `[0, 1440)`, so a caller can pass the
 * engine's raw `melatoninOnset` string straight through, or pre-computed
 * minutes — whichever it already holds. A missing signal is `null`/`undefined`.
 */
export interface EntrainmentSignals {
  /**
   * Estimated melatonin onset — the engine places this close to the END of a
   * well-entrained shift worker's shift. `"HH:MM"` clock string or minutes.
   */
  melatoninOnset?: string | number | null;
  /**
   * The shift's end clock time. `"HH:MM"` string or minutes-since-midnight.
   * For a well-anchored body clock, melatonin onset falls near this instant.
   */
  shiftEnd?: string | number | null;
}

/**
 * Coerce a clock signal (`"HH:MM"` string or minutes-since-midnight number)
 * into minutes-since-midnight in `[0, 1440)`, or `null` when the value is
 * missing / malformed / out of range / NaN. Pure and never throws.
 */
function signalToMinutes(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') {
    // Reject NaN/±Infinity and out-of-dial values; accept any in-range minute.
    if (!Number.isFinite(value) || value < 0 || value >= MINUTES_PER_DAY) return null;
    return value;
  }
  if (typeof value !== 'string') return null;
  const m = CLOCK_RE.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Smallest absolute gap (in minutes) between two clock times on a 24h dial. */
function circularGapMinutes(a: number, b: number): number {
  const raw = Math.abs(a - b) % MINUTES_PER_DAY;
  return Math.min(raw, MINUTES_PER_DAY - raw);
}

/**
 * Derive a circadian entrainment/alignment score (0–100) from the model's
 * melatonin-onset and shift-end signals, or `null` when the inputs are
 * insufficient to compute an honest value.
 *
 * Biology / intent (mirrors src/api/circadian.ts's private derivation, so the
 * standalone score and `CircadianModel.entrainmentScore` never diverge): for a
 * well-entrained shift worker, melatonin onset should fall close to the END of
 * the shift. The tighter that gap, the better the body clock is anchored. We
 * map the circular clock gap between `melatoninOnset` and `shiftEnd` onto
 * 0–100: a 0h gap → 100, decaying linearly to 0 by ~6h of drift.
 *
 * Contract (all enforced, all tested):
 *   • PURE / dependency-free — no `Date.now()`, no I/O, no React/native imports;
 *     deterministic for fixed inputs (same input → identical number).
 *   • Returns `null` (NEVER throws) on missing/partial/malformed/NaN input —
 *     only computes a number when BOTH signals parse to a valid clock minute.
 *   • Result is always a finite integer clamped to [0, 100].
 *
 * @param input the melatonin-onset and shift-end signals (string `"HH:MM"` or
 *   minutes-since-midnight); `null`/`undefined`/`{}` all yield `null`.
 * @returns the entrainment score in [0, 100], or `null` when inputs are
 *   insufficient. A score `>= GOOD_ALIGNMENT_THRESHOLD` is "good alignment".
 */
export function deriveEntrainmentScore(input: EntrainmentSignals | null | undefined): number | null {
  if (input == null) return null;

  const onset = signalToMinutes(input.melatoninOnset);
  const end = signalToMinutes(input.shiftEnd);
  if (onset == null || end == null) return null;

  const gap = circularGapMinutes(onset, end);
  const score = Math.round(SCORE_MAX * Math.max(0, 1 - gap / ENTRAINMENT_HALF_LIFE_MIN));
  // Math already bounds the result, but clamp explicitly so the [0, 100]
  // guarantee is local to this return and not dependent on the formula above.
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, score));
}
