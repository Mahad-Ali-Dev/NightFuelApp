/**
 * useEntrainmentScore — the data hook that feeds the (pure) <EntrainmentCard />.
 *
 * The card itself owns NO fetching (see EntrainmentCard.tsx). This hook is the
 * single seam that turns the two server reads into the card's two props:
 *
 *   - `score` : the GENUINE circadian entrainment score (0–100) sourced from the
 *               circadian model (`getModel().entrainmentScore`, which is now
 *               derived for real from the /v1/circadian/profile melatonin-onset
 *               vs shift-end alignment — see src/api/circadian.ts). It is
 *               `null` whenever there is no shift, the model hasn't resolved, or
 *               the model carries no derivable score — the honest, default-safe
 *               path that renders ENTRAINMENT_ADVICE.none.
 *   - `shift` : the active shift's `{ startTime, endTime }` when one is present,
 *               else `undefined`. The card derives its live Wind-down window hint
 *               from this via deriveWindowsFromShift.
 *
 * This deliberately mirrors the query wiring on the circadian screen
 * (app/(tabs)/circadian.tsx): the same `['current-shift']` / `['circadian-model']`
 * query keys and the `enabled: !!currentShift` gate, so the two consumers share
 * react-query cache entries rather than double-fetching.
 *
 * Rules applied (see ~/.claude/skills/react-native-skills/rules/):
 *   - state-ground-truth.md  → we store NO derived state. `score`/`shift` are
 *                              COMPUTED from the query results on each render
 *                              (the queries are the ground truth); nothing is
 *                              copied into useState.
 *   - react-state-fallback.md → the honest fallback is `null`/`undefined` via
 *                              `??`, reactive to the underlying queries rather
 *                              than synced once.
 *
 * Safety: every read is guarded so a hook/query error (or a malformed model)
 * yields `{ score: null, shift: undefined }` and NEVER throws — the card's
 * contract depends on a non-throwing source.
 */
import { useQuery } from '@tanstack/react-query';
import { getCurrent as getCurrentShift } from '@/api/shifts';
import { getModel } from '@/api/circadian';

export interface EntrainmentScoreResult {
  /** Genuine entrainment score (0–100), or `null` when not derivable. */
  score: number | null;
  /** Active shift window for the card's hint, or `undefined` when none. */
  shift: { startTime: string | Date; endTime: string | Date } | undefined;
}

/** Coerce an unknown model score into a finite number in [0, 100], else null. */
function normalizeScore(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.min(100, Math.max(0, raw));
}

/**
 * Fetch the active shift + circadian model and project them onto the card's
 * `{ score, shift }` props. Pure projection over the query results (no state);
 * always returns a well-formed, non-throwing result.
 */
export function useEntrainmentScore(): EntrainmentScoreResult {
  const shiftQuery = useQuery({
    queryKey: ['current-shift'],
    queryFn: getCurrentShift,
  });

  const currentShift = shiftQuery.data ?? null;

  const modelQuery = useQuery({
    queryKey: ['circadian-model'],
    queryFn: getModel,
    // Only compute a model once a shift exists — getModel() throws without one.
    enabled: !!currentShift,
    staleTime: 10 * 60 * 1000, // mirror useCircadian: the model changes rarely.
  });

  // Wrap the projection so a malformed model/shift can never throw out of the
  // hook — a bad read degrades to the honest null/undefined defaults.
  try {
    // The model is the SOURCE of the real score. `?? null` is the honest
    // default — no shift / not-yet-loaded / no derivable score all map to null,
    // which the card renders as ENTRAINMENT_ADVICE.none. Note we read the model
    // score directly: the entrainment.ts helper exposes the advice/window math
    // but no score-derivation function, so the genuine score lives on the model
    // (src/api/circadian.ts deriveEntrainmentScore), not the analytics proxy.
    //
    // TIMEZONE-NAIVE: this score is computed in a tz-NAIVE local-clock frame —
    // the model aligns the engine's melatoninOnset against the shift end as
    // minutes-since-LOCAL-midnight (src/api/circadian.ts shiftEndMinutes uses
    // d.getHours()/getMinutes()), and no timezone is carried through getModel().
    // We pass the value through UNCHANGED here; carrying a real timezone is
    // DEFERRED / out of scope. EntrainmentCard surfaces the honest "approx."
    // affordance so this estimate is never presented as tz-precise.
    const score = normalizeScore(modelQuery.data?.entrainmentScore);

    const shift =
      currentShift &&
      typeof (currentShift as any).startTime === 'string' &&
      typeof (currentShift as any).endTime === 'string'
        ? {
            startTime: (currentShift as any).startTime as string,
            endTime: (currentShift as any).endTime as string,
          }
        : undefined;

    return { score, shift };
  } catch {
    return { score: null, shift: undefined };
  }
}

export default useEntrainmentScore;
