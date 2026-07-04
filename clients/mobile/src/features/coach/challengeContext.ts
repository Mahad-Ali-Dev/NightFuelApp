/**
 * Themed-challenge personalization loader — the one place that turns live user
 * data into the `SplitContext` the (pure) plan.ts splits consume.
 *
 * Only the two personalized challenges need it:
 *   - Night-Shift Reset ('circadian') → the user's sleep window (getPreferences).
 *   - Cycle Sync ('cycle-sync')        → per-day menstrual phase (getCycleForecast).
 *
 * BEST-EFFORT by design: every look-up is wrapped so any failure (offline,
 * tracking off, no window set) resolves to `undefined` — plan.ts then falls back
 * to its canonical defaults, so a challenge always builds. Non-personalized
 * templates skip the network entirely (they return `undefined` immediately).
 */
import { getPreferences } from '@/api/profile';
import { getCycleForecast, type CyclePhase as ApiCyclePhase, type ForecastDay } from '@/api/cycle';
import { toUTCDayKey } from '@nightfuel/dates';
import type { MenstrualPhase } from './types';
import type { ChallengeTemplate } from './challengeTemplates';

/** The already-resolved personalization plan.ts's splits accept (a SplitContext
 * minus the `split` discriminator, which comes from CoachInputs). */
export interface SplitPersonalization {
  sleepWindow?: { start: string; end: string } | null;
  cyclePhases?: (MenstrualPhase | undefined)[] | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Server phase enum (UPPERCASE, incl. UNKNOWN) → client phase (lowercase). */
const PHASE_MAP: Record<ApiCyclePhase, MenstrualPhase | undefined> = {
  MENSTRUAL: 'menstrual',
  FOLLICULAR: 'follicular',
  OVULATORY: 'ovulatory',
  LUTEAL: 'luteal',
  UNKNOWN: undefined,
};

/**
 * Map a cycle forecast to a per-day phase array aligned to the challenge days:
 * index `i` = the phase for challenge day i+1 (calendar `today + i`). Forecast
 * dates are UTC date-only, so we match on UTC day keys.
 *
 * Returns `null` when the forecast yields NO real phase (tracking off / all
 * UNKNOWN) so the caller drops personalization and plan.ts uses its default
 * progression. Otherwise every slot is filled: real phases where known, else
 * carried forward from the nearest known phase (a rare gap never leaves a hole).
 *
 * PURE — `today` is injected — so it is deterministic and unit-testable.
 */
export function mapForecastToPhases(
  days: Pick<ForecastDay, 'date' | 'phase'>[],
  duration: number,
  today: Date = new Date(),
): (MenstrualPhase | undefined)[] | null {
  const byKey = new Map<string, ApiCyclePhase>();
  for (const d of days) byKey.set(d.date, d.phase);

  const perDay: (MenstrualPhase | undefined)[] = [];
  for (let i = 0; i < duration; i++) {
    const key = toUTCDayKey(new Date(today.getTime() + i * DAY_MS));
    const api = byKey.get(key);
    perDay.push(api ? PHASE_MAP[api] : undefined);
  }

  const firstReal = perDay.find((p): p is MenstrualPhase => p !== undefined);
  if (!firstReal) return null; // nothing tracked → let plan.ts default

  // Fill gaps by carrying the last known phase forward (and seed leading gaps
  // with the first known phase), so downstream indexing is total.
  let last: MenstrualPhase = firstReal;
  return perDay.map((p) => (p ? (last = p) : last));
}

/**
 * Resolve the personalization for a challenge template. Returns `undefined` (no
 * context) for non-personalized templates and on any failure — the caller then
 * builds the plan on plan.ts's defaults.
 */
export async function loadSplitContext(
  template: ChallengeTemplate,
  today: Date = new Date(),
): Promise<SplitPersonalization | undefined> {
  try {
    if (template.split === 'circadian') {
      const prefs = await getPreferences();
      const start = prefs.sleepWindowStart;
      const end = prefs.sleepWindowEnd;
      return start && end ? { sleepWindow: { start, end } } : undefined;
    }
    if (template.split === 'cycle-sync') {
      // Half-window around today; widen for long plans so day N is still covered.
      const forecast = await getCycleForecast(template.duration > 20 ? 2 : 1);
      const cyclePhases = mapForecastToPhases(forecast.days, template.duration, today);
      return cyclePhases ? { cyclePhases } : undefined;
    }
  } catch {
    return undefined; // best-effort: any error → plan.ts defaults
  }
  return undefined;
}
