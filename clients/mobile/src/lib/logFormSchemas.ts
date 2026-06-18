/**
 * logFormSchemas.ts
 *
 * Pure, dependency-free, framework-agnostic validators for the log-shift and
 * log-sleep modal forms. Used by:
 *   - app/(modals)/log-shift.tsx
 *   - app/(modals)/log-sleep.tsx
 *
 * Design notes
 * ────────────
 * We deliberately do NOT depend on `zod`. `zod` is hoisted into the repo's root
 * `node_modules` as a transitive of @nightfuel/types, but it is NOT a declared
 * dependency of `@nightfuel/mobile`. Importing it from the mobile workspace
 * would silently work today and silently break the next time someone runs
 * `expo install --fix` or hoisting changes. The work-item explicitly permits a
 * hand-rolled validator instead — and that is what we do here.
 *
 * The validator API mirrors zod's `safeParse` shape closely enough that a
 * future swap to a real zod schema would be a one-line replacement in the
 * modal: `schema.safeParse(input)` ↔ `validateLogShiftForm(input)`.
 *
 *   { ok: true,  value: T }
 *   { ok: false, fieldErrors: Record<string, string> }
 *
 * Each `fieldErrors` value is already-human-friendly copy — modal code can
 * render it directly under the relevant TextInput without any extra mapping.
 * `humanizeFieldError(path, message)` is exported for callers that need to
 * map server-side Zod field paths (returned by the API as `field` strings) to
 * the same friendly copy.
 *
 * Pure functions, no React, no I/O — fully unit-testable. See
 * __tests__/lib/logFormSchemas.test.ts.
 */

// ── Date / time primitives ────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Returns true when `s` matches `YYYY-MM-DD` AND parses to a real calendar
 * date (e.g. rejects 2026-02-30 and 2026-13-01, which the regex alone would
 * allow). The check round-trips through UTC fields to avoid timezone shifts.
 */
export function isValidCalendarDate(s: string): boolean {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map((n) => Number(n));
  if (m === undefined || d === undefined || y === undefined) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d
  );
}

/** True when `s` matches `HH:MM` 24-hour wall-clock (00:00 – 23:59). */
export function isValidWallTime(s: string): boolean {
  return typeof s === 'string' && TIME_RE.test(s);
}

/**
 * Max number of whole calendar days a logged date may sit in the future before
 * we treat it as a data-entry mistake. The DateTimeField pickers already clamp
 * normal entry, so this is a programmatic / edge guard only. A small tolerance
 * (rather than zero) lets a worker pre-log an upcoming shift or a sleep that
 * ends tomorrow without being blocked, while still catching obviously wrong
 * values like a year typo (2026 → 2062).
 */
export const MAX_FUTURE_DAYS = 2;

/**
 * Whole-day distance from `from` to `to`, both `YYYY-MM-DD`, measured in UTC so
 * it never drifts by a day across timezones (matches `isValidCalendarDate`,
 * which also round-trips through UTC). Positive when `to` is after `from`.
 *
 * Returns `null` when either input is not a real calendar date — callers should
 * have already validated format/calendar-ness and can treat `null` as "skip the
 * distance check, the format error already covers it".
 */
export function daysFromUtc(from: string, to: string): number | null {
  if (!isValidCalendarDate(from) || !isValidCalendarDate(to)) return null;
  const toUtc = (s: string): number => {
    const [y, m, d] = s.split('-').map((n) => Number(n));
    return Date.UTC(y as number, (m as number) - 1, d as number);
  };
  const MS_PER_DAY = 86_400_000;
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

/**
 * True when calendar-date `day` (YYYY-MM-DD) is more than `MAX_FUTURE_DAYS`
 * whole days after the `now` reference. Pure: the caller supplies `now`, so the
 * function never reads the clock itself. A non-calendar `day` returns `false`
 * (the dedicated format check owns that error).
 */
export function isImplausibleFutureDate(day: string, now: Date): boolean {
  if (!isValidCalendarDate(day)) return false;
  // Compare against `now`'s UTC calendar day. We only care about whole-day
  // distance, so collapse `now` to its YYYY-MM-DD first.
  const nowDay = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const distance = daysFromUtc(nowDay, day);
  return distance !== null && distance > MAX_FUTURE_DAYS;
}

/**
 * Pure helper for the "is the shift overnight?" decision used by the shift
 * modal to roll the end date forward. The convention matches the existing
 * mutationFn: when start > end as plain strings (lexicographic comparison
 * works because both are HH:MM zero-padded), the shift crosses midnight.
 *
 * Inputs must already be valid HH:MM — pass the parsed value, not raw user
 * input. Equal start and end is NOT overnight (it's a zero-length shift).
 */
export function isOvernightShift(startTime: string, endTime: string): boolean {
  return startTime > endTime;
}

// ── Result type ───────────────────────────────────────────────────────────────

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; fieldErrors: Record<string, string> };

// ── Friendly-copy mapper ──────────────────────────────────────────────────────

/**
 * Map (fieldPath, raw error code) → end-user-friendly copy. Used both by the
 * client-side validators below AND by the modal's onError handler when the
 * server returns a `ValidationError` with `details[]` entries — keeping the
 * mapping in one place means a server-side 400 surfaces the same wording as
 * a pre-submit client failure.
 */
export function humanizeFieldError(path: string, message: string): string {
  // Specific known cases the server may emit
  switch (path) {
    case 'shiftDate':
    case 'startDay':
    case 'endDay':
      // A range / future / ordering message wins over the generic format copy
      // when the caller provided one (e.g. the future-date and end-before-start
      // guards below, or a server-side equivalent).
      if (/before|after|range|order|future|cannot|can't/i.test(message)) {
        return message;
      }
      return 'Enter a real date (YYYY-MM-DD)';
    case 'startTime':
    case 'endTime':
      // Time-range message wins over format if the caller provided it
      if (/before|after|range|order|future|cannot|can't/i.test(message)) {
        return message;
      }
      return 'Enter a time as HH:MM (24-hour)';
    case 'commuteMinutes':
      return 'Commute must be 0-180 minutes';
    case 'quality':
      return 'Quality must be between 1 and 10';
    case 'disturbances':
      return 'Wake-ups must be between 0 and 50';
    case 'notes':
      return 'Notes are limited to 1000 characters';
    case 'shiftType':
      return 'Pick a shift type';
    default:
      return message || 'Invalid value';
  }
}

// ── Log Shift validator ───────────────────────────────────────────────────────

export interface LogShiftFormInput {
  shiftDate: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  isDayOff: boolean;
  commuteMinutes: string; // free-text from TextInput
}

export interface LogShiftFormValue {
  shiftDate: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  isDayOff: boolean;
  commuteMinutes: number;
}

const SHIFT_TYPES = new Set([
  'FIXED_NIGHT',
  'ROTATING',
  'SPLIT',
  'IRREGULAR',
  'TWELVE_HOUR',
]);

/** Field-error copy for the additive shift guards (kept as constants so tests
 * can assert against them without re-typing the wording). */
export const SHIFT_FUTURE_DATE_MSG = "Shift date can't be that far in the future";
export const SHIFT_END_ORDER_MSG = 'Shift end must be after start (or overnight)';
export const SHIFT_ZERO_LENGTH_MSG = 'Shift start and end cannot be the same';

/**
 * Upper bound on a single shift's wall-clock duration, in hours.
 *
 * DELIBERATE-UNREACHABLE / FUTURE-PROOFING — read before "simplifying" this:
 * A shift is logged against a SINGLE `shiftDate`. The overnight convention
 * (`isOvernightShift` = start > end) rolls an end that is at-or-before the start
 * forward by exactly +24h, so the rolled span for every valid HH:MM pair is
 * mathematically capped strictly BELOW 24h — the maximal overnight (e.g.
 * 00:01 → 00:00) is 23h59m. The only way to reach a 24h span is start === end,
 * and the zero-length guard above rejects that first (claiming `endTime` so this
 * branch is skipped). Therefore, FOR A SINGLE-shiftDate SHIFT,
 * `durationMins > MAX_SHIFT_HOURS * 60` can never fire — it is currently dead.
 *
 * We KEEP the branch (rather than delete it) on purpose: `SHIFT_TOO_LONG_MSG` /
 * `MAX_SHIFT_HOURS` are exported and may be imported elsewhere, and the bound is
 * the single source of truth if the overnight convention is ever refined (e.g. a
 * multi-day or explicit-end-date shift, where a >24h rolled span WOULD become
 * reachable). It documents and enforces the rule cheaply without changing any
 * currently-reachable behaviour.
 *
 * (The sibling `MAX_SLEEP_HOURS` bound below is NOT in the same boat — a sleep
 * session spans an explicit start/end DAY pair, so a wrong end day makes a >24h
 * span genuinely reachable. That one is live and load-bearing.)
 */
export const MAX_SHIFT_HOURS = 24;
export const SHIFT_TOO_LONG_MSG = 'A shift cannot be longer than 24 hours';

export function validateLogShiftForm(
  input: LogShiftFormInput,
  options?: { now?: Date },
): ValidationResult<LogShiftFormValue> {
  const fieldErrors: Record<string, string> = {};
  // Pure-with-injectable-clock: callers (and tests) may pin `now`; when omitted
  // we read the wall clock exactly once here. The comparison itself lives in
  // `isImplausibleFutureDate`, which only ever sees the supplied reference.
  const now = options?.now ?? new Date();

  if (!isValidCalendarDate(input.shiftDate)) {
    fieldErrors.shiftDate = humanizeFieldError('shiftDate', '');
  }
  if (!isValidWallTime(input.startTime)) {
    fieldErrors.startTime = humanizeFieldError('startTime', '');
  }
  if (!isValidWallTime(input.endTime)) {
    fieldErrors.endTime = humanizeFieldError('endTime', '');
  }
  if (!SHIFT_TYPES.has(input.shiftType)) {
    fieldErrors.shiftType = humanizeFieldError('shiftType', '');
  }

  // Implausible future date — only when the date itself parsed cleanly, so the
  // format error (above) is never masked by this one.
  if (!fieldErrors.shiftDate && isImplausibleFutureDate(input.shiftDate, now)) {
    fieldErrors.shiftDate = humanizeFieldError('shiftDate', SHIFT_FUTURE_DATE_MSG);
  }

  // Start/end ordering — only meaningful once both times are valid HH:MM.
  // A night-shift worker's end may legitimately be *before* the start
  // (overnight, e.g. 19:00 → 07:00): `isOvernightShift` flags that and we allow
  // it. The two cases we reject:
  //   • end === start            → zero-length shift, never legitimate
  //   • end <  start, not overnight → impossible on a single day
  // Since `isOvernightShift` is defined as start > end, every `end < start`
  // already counts as overnight, so the equal case is the only same-day
  // ordering error that survives. We still gate on `isOvernightShift` (rather
  // than collapsing to an equality test) so the rule reads as written and stays
  // correct if the overnight convention is ever refined.
  if (!fieldErrors.startTime && !fieldErrors.endTime) {
    const overnight = isOvernightShift(input.startTime, input.endTime);
    if (!overnight && input.endTime <= input.startTime) {
      const msg =
        input.endTime === input.startTime
          ? SHIFT_ZERO_LENGTH_MSG
          : SHIFT_END_ORDER_MSG;
      fieldErrors.endTime = humanizeFieldError('endTime', msg);
    }

    // Upper duration bound — honour the overnight roll (treat an overnight end
    // as +24h) so the rolled span is what gets bounded. Only meaningful when no
    // higher-priority ordering/zero-length error already claimed endTime, so
    // those messages always win.
    //
    // DELIBERATELY UNREACHABLE for a single-shiftDate shift (see MAX_SHIFT_HOURS
    // above): the overnight roll caps every valid HH:MM pair's span strictly
    // below 24h (the maximal overnight, 00:01 → 00:00, is 23h59m), and the only
    // 24h span (start === end) is already rejected by the zero-length guard. So
    // `durationMins > MAX_SHIFT_HOURS * 60` cannot fire here today; the branch is
    // kept as the single source of truth for the rule and as future-proofing for
    // a refined overnight convention (e.g. an explicit end-date / multi-day
    // shift) where a >24h span would become reachable. Keeps 19:00 → 07:00 (12h)
    // and 07:00 → 15:00 (8h) valid.
    if (!fieldErrors.endTime) {
      const [startH, startM] = input.startTime.split(':').map((n) => Number(n));
      const [endH, endM] = input.endTime.split(':').map((n) => Number(n));
      const startMins = (startH as number) * 60 + (startM as number);
      const endMins =
        (endH as number) * 60 + (endM as number) + (overnight ? 1440 : 0);
      const durationMins = endMins - startMins;
      if (durationMins > MAX_SHIFT_HOURS * 60) {
        fieldErrors.endTime = humanizeFieldError('endTime', SHIFT_TOO_LONG_MSG);
      }
    }
  }

  // Commute: must be an integer 0-180. Empty string is treated as 0 because
  // the screen explicitly shows the user a "30" placeholder and the previous
  // behaviour fell back to 0 when parseInt returned NaN.
  const trimmed = (input.commuteMinutes ?? '').trim();
  let commuteMinutes = 0;
  if (trimmed !== '') {
    if (!/^\d+$/.test(trimmed)) {
      fieldErrors.commuteMinutes = humanizeFieldError('commuteMinutes', '');
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 180) {
        fieldErrors.commuteMinutes = humanizeFieldError('commuteMinutes', '');
      } else {
        commuteMinutes = n;
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    value: {
      shiftDate: input.shiftDate,
      startTime: input.startTime,
      endTime: input.endTime,
      shiftType: input.shiftType,
      isDayOff: !!input.isDayOff,
      commuteMinutes,
    },
  };
}

// ── Log Sleep validator ───────────────────────────────────────────────────────

export interface LogSleepFormInput {
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
  quality: number;
  disturbances: number;
  notes: string;
}

export interface LogSleepFormValue {
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
  quality: number;
  disturbances: number;
  notes: string;
}

/** Field-error copy for the additive sleep guards (constants so tests assert
 * against them without duplicating the wording). */
export const SLEEP_FUTURE_DAY_MSG = "Sleep day can't be in the future";
export const SLEEP_FUTURE_END_MSG = "Sleep can't end in the future";

/**
 * Upper bound on a single sleep session's duration, in hours. A normal
 * overnight session (e.g. 23:00 → 07:00, ~8h) is well under this; a 24h+ span
 * (e.g. start-day to two days later) is an absurd input — typically a wrong
 * start/end day — and is rejected before it can reach the API. Applied only
 * after the zero-length and future-wake guards, so their more specific
 * messages always win on the shared endTime field.
 */
export const MAX_SLEEP_HOURS = 24;
export const SLEEP_TOO_LONG_MSG = 'A sleep session cannot be longer than 24 hours';

export function validateLogSleepForm(
  input: LogSleepFormInput,
  options?: { now?: Date },
): ValidationResult<LogSleepFormValue> {
  const fieldErrors: Record<string, string> = {};
  // Pure-with-injectable-clock (see validateLogShiftForm): tests pin `now`;
  // production reads the wall clock once here.
  const now = options?.now ?? new Date();

  if (!isValidCalendarDate(input.startDay)) {
    fieldErrors.startDay = humanizeFieldError('startDay', '');
  }
  if (!isValidCalendarDate(input.endDay)) {
    fieldErrors.endDay = humanizeFieldError('endDay', '');
  }
  if (!isValidWallTime(input.startTime)) {
    fieldErrors.startTime = humanizeFieldError('startTime', '');
  }
  if (!isValidWallTime(input.endTime)) {
    fieldErrors.endTime = humanizeFieldError('endTime', '');
  }

  if (
    typeof input.quality !== 'number' ||
    !Number.isInteger(input.quality) ||
    input.quality < 1 ||
    input.quality > 10
  ) {
    fieldErrors.quality = humanizeFieldError('quality', '');
  }
  if (
    typeof input.disturbances !== 'number' ||
    !Number.isInteger(input.disturbances) ||
    input.disturbances < 0 ||
    input.disturbances > 50
  ) {
    fieldErrors.disturbances = humanizeFieldError('disturbances', '');
  }
  if (typeof input.notes !== 'string' || input.notes.length > 1000) {
    fieldErrors.notes = humanizeFieldError('notes', '');
  }

  // Implausible future days — each gated on its own format being clean so the
  // format error is never masked. You can't have slept on a day that is well in
  // the future. (Tolerance = MAX_FUTURE_DAYS; an end-tomorrow overnight session
  // logged at the day boundary stays within it.)
  if (!fieldErrors.startDay && isImplausibleFutureDate(input.startDay, now)) {
    fieldErrors.startDay = humanizeFieldError('startDay', SLEEP_FUTURE_DAY_MSG);
  }
  if (!fieldErrors.endDay && isImplausibleFutureDate(input.endDay, now)) {
    fieldErrors.endDay = humanizeFieldError('endDay', SLEEP_FUTURE_DAY_MSG);
  }

  // Range check: only meaningful once both day+time pairs are individually
  // valid. The existing screen rolls "end <= start on the same day" forward by
  // 24h (overnight sleep), so the only ambiguous case is start === end — that
  // is a zero-length session, never legitimate, and gets a dedicated message.
  const noFieldFormatErrors =
    !fieldErrors.startDay &&
    !fieldErrors.endDay &&
    !fieldErrors.startTime &&
    !fieldErrors.endTime;

  if (noFieldFormatErrors) {
    const start = new Date(`${input.startDay}T${input.startTime}:00`);
    const end = new Date(`${input.endDay}T${input.endTime}:00`);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      // Same wall-clock instant on the same day is invalid even with the
      // overnight roll-forward, since rolling 0 → 24h would silently invent a
      // 24-hour sleep.
      if (start.getTime() === end.getTime()) {
        fieldErrors.endTime = 'Sleep start must be before sleep end';
      }
      // If endDay is BEFORE startDay (different days), it is a clear data
      // entry mistake — overnight only rolls within the same day pair.
      if (input.endDay < input.startDay) {
        fieldErrors.endDay = 'Sleep end day cannot be before sleep start day';
      }

      // Future wake-time guard. Mirror the screen's overnight roll-forward to
      // recover the *effective* end day: an end at/earlier-than start on the
      // SAME day means the session crossed midnight, so the real wake-up is the
      // next calendar day. Reject only when that effective end day is well past
      // `now` (MAX_FUTURE_DAYS tolerance) — a sleep that genuinely ended in the
      // future is a data-entry mistake, but normal "woke up this morning"
      // logging stays comfortably inside the tolerance.
      let effectiveEndDay = input.endDay;
      const rollsOvernight =
        input.endDay === input.startDay && input.endTime <= input.startTime;
      if (rollsOvernight) {
        const rolled = daysFromUtc('1970-01-01', input.endDay);
        if (rolled !== null) {
          effectiveEndDay = new Date((rolled + 1) * 86_400_000)
            .toISOString()
            .slice(0, 10);
        }
      }
      if (
        !fieldErrors.endTime &&
        !fieldErrors.endDay &&
        isImplausibleFutureDate(effectiveEndDay, now)
      ) {
        fieldErrors.endTime = humanizeFieldError('endTime', SLEEP_FUTURE_END_MSG);
      }

      // Upper duration bound. Use the SAME effectiveEndDay roll-forward the file
      // already derives above so the span we measure matches what the screen
      // actually persists (an overnight 23:00 → 07:00 is ~8h, not -16h). Only
      // fires when no higher-priority endTime error (zero-length / future) is
      // already set, so those more specific messages always win. Keeps the
      // default overnight 23:00 → 07:00 (8h) valid; rejects an absurd multi-day
      // span (e.g. a wrong end day landing ~31h out).
      if (!fieldErrors.endTime) {
        const effectiveEnd = new Date(`${effectiveEndDay}T${input.endTime}:00`);
        if (!isNaN(effectiveEnd.getTime())) {
          const durationMs = effectiveEnd.getTime() - start.getTime();
          if (durationMs > MAX_SLEEP_HOURS * 3_600_000) {
            fieldErrors.endTime = humanizeFieldError('endTime', SLEEP_TOO_LONG_MSG);
          }
        }
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    value: {
      startDay: input.startDay,
      startTime: input.startTime,
      endDay: input.endDay,
      endTime: input.endTime,
      quality: input.quality,
      disturbances: input.disturbances,
      notes: input.notes,
    },
  };
}

// ── Server-error → fieldErrors adapter ────────────────────────────────────────

/**
 * Best-effort: turn an axios error from a Zod-backed 400 response into the
 * same `Record<string, string>` shape as the local validators. The backend
 * convention (see services/<svc>/src/middleware/error.ts) is:
 *
 *   400 { error: 'ValidationError', details: [{ path: ['field', ...], message }, ...] }
 *
 * Anything that doesn't fit that shape returns null so the caller can fall
 * back to its existing Alert path.
 */
export function fieldErrorsFromAxiosError(
  err: unknown,
): Record<string, string> | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as {
    response?: {
      status?: number;
      data?: {
        error?: string;
        details?: Array<{ path?: unknown; message?: string }>;
      };
    };
  };
  const resp = e.response;
  if (!resp || resp.status !== 400) return null;
  const data = resp.data;
  if (!data || data.error !== 'ValidationError') return null;
  if (!Array.isArray(data.details) || data.details.length === 0) return null;

  const map: Record<string, string> = {};
  for (const d of data.details) {
    if (!d) continue;
    const path = Array.isArray(d.path) ? d.path.join('.') : String(d.path ?? '');
    const segments = path.split('.').filter((s) => s.length > 0);
    const leaf = segments[segments.length - 1] ?? path;
    if (!leaf) continue;
    map[leaf] = humanizeFieldError(leaf, d.message ?? '');
  }
  return Object.keys(map).length > 0 ? map : null;
}
