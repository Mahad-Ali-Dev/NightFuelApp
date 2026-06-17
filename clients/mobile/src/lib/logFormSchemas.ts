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
      return 'Enter a real date (YYYY-MM-DD)';
    case 'startTime':
    case 'endTime':
      // Time-range message wins over format if the caller provided it
      if (/before|after|range|order/i.test(message)) return message;
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

export function validateLogShiftForm(
  input: LogShiftFormInput,
): ValidationResult<LogShiftFormValue> {
  const fieldErrors: Record<string, string> = {};

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

export function validateLogSleepForm(
  input: LogSleepFormInput,
): ValidationResult<LogSleepFormValue> {
  const fieldErrors: Record<string, string> = {};

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
