/**
 * Day-split engine — the "what trains on which day" half of the hybrid plan.
 *
 * Each goal has a repeating training CYCLE (a real program repeats its split each
 * week). `buildDaySplit` lays that cycle across the chosen duration (3/7/15/30),
 * producing the gated day skeletons. Phase 2's selector then fills each day's
 * `focus` with real exercises + meals from the catalog.
 *
 * These curated cycles are the deterministic baseline; the LLM hand-off (Phase 2)
 * can REPLACE `buildDaySplit` with a model-designed split while keeping the same
 * DaySkeleton shape, so nothing downstream changes.
 */
import type { CoachGoal, DayCover, DaySkeleton, MenstrualPhase, PlanDuration, PlanSplit } from './types';

interface DayTemplate {
  title: string;
  /** Muscle-group / modality keys the selector maps to catalog filters. */
  focus: string[];
  /** Tabler icon key for the day tile. */
  icon: string;
  /** Cover-image key (→ day-<cover>.jpg via covers.ts). */
  cover: DayCover;
}

const SPLITS: Record<CoachGoal, DayTemplate[]> = {
  'muscle-gain': [
    { title: 'Chest & triceps', focus: ['chest', 'triceps'], icon: 'barbell', cover: 'chest' },
    { title: 'Back & biceps', focus: ['back', 'biceps'], icon: 'barbell', cover: 'back' },
    { title: 'Legs & core', focus: ['legs', 'core'], icon: 'run', cover: 'legs' },
    { title: 'Shoulders & abs', focus: ['shoulders', 'core'], icon: 'barbell', cover: 'shoulders' },
    { title: 'Active recovery', focus: [], icon: 'stretching', cover: 'recovery' },
  ],
  'fat-loss': [
    { title: 'Full body', focus: ['fullbody'], icon: 'barbell', cover: 'fullbody' },
    { title: 'Cardio burn', focus: ['cardio'], icon: 'run', cover: 'cardio' },
    { title: 'HIIT & core', focus: ['core', 'cardio'], icon: 'bolt', cover: 'core' },
    { title: 'Lower body', focus: ['legs'], icon: 'run', cover: 'legs' },
    { title: 'Active recovery', focus: [], icon: 'stretching', cover: 'recovery' },
  ],
  endurance: [
    { title: 'Cardio base', focus: ['cardio'], icon: 'run', cover: 'cardio' },
    { title: 'Full body', focus: ['fullbody'], icon: 'barbell', cover: 'fullbody' },
    { title: 'Tempo & core', focus: ['core', 'cardio'], icon: 'bolt', cover: 'core' },
    { title: 'Cross-train', focus: ['fullbody'], icon: 'barbell', cover: 'fullbody' },
    { title: 'Active recovery', focus: [], icon: 'stretching', cover: 'recovery' },
  ],
  maintain: [
    { title: 'Upper body', focus: ['chest', 'back', 'shoulders', 'arms'], icon: 'barbell', cover: 'chest' },
    { title: 'Lower body', focus: ['legs', 'core'], icon: 'run', cover: 'legs' },
    { title: 'Cardio & core', focus: ['cardio', 'core'], icon: 'bolt', cover: 'cardio' },
    { title: 'Full body', focus: ['fullbody'], icon: 'barbell', cover: 'fullbody' },
    { title: 'Active recovery', focus: [], icon: 'stretching', cover: 'recovery' },
  ],
};

/** True when a day is a rest / active-recovery day (no resistance focus). */
export const isRestDay = (focus: string[]): boolean => focus.length === 0;

/**
 * Optional context that switches `buildDaySplit` onto a themed split and feeds it
 * already-resolved personalization. Absent (or `split` undefined) → the goal-based
 * baseline runs unchanged. plan.ts stays PURE: it only reads what it is handed
 * here — the live look-ups live in challengeContext.ts.
 */
export interface SplitContext {
  /** Which themed split to build (see PlanSplit). */
  split?: PlanSplit;
  /** User's sleep window (HH:MM) for the circadian split's timing anchors.
   * Null/absent → a canonical night-shift window is assumed. */
  sleepWindow?: { start: string; end: string } | null;
  /** Per-day menstrual phase for the cycle-sync split — `cyclePhases[i]` is the
   * phase for day i+1. Null/absent (or a hole) → the default progression. */
  cyclePhases?: (MenstrualPhase | undefined)[] | null;
}

/**
 * Lay a training cycle across `duration` days (1-based). A themed `ctx.split`
 * routes to a dedicated builder; otherwise the goal's repeating cycle is tiled
 * exactly as before (2-arg callers and every existing goal are byte-identical).
 * The repeat is intentional — a real weekly program recurs.
 */
export function buildDaySplit(goal: CoachGoal, duration: PlanDuration, ctx?: SplitContext): DaySkeleton[] {
  if (ctx?.split === 'circadian') return buildCircadianSplit(duration, ctx);
  if (ctx?.split === 'cycle-sync') return buildCycleSyncSplit(duration, ctx);
  const cycle = SPLITS[goal];
  return Array.from({ length: duration }, (_, i) => {
    const t = cycle[i % cycle.length]!;
    return { day: i + 1, title: t.title, focus: [...t.focus], icon: t.icon, cover: t.cover };
  });
}

// ── Circadian split (Night-Shift Reset) ────────────────────────────────────────
// A short reset cycle for shift workers carrying sleep debt: moderate training
// load, and — the actual differentiator — every day's `note` anchors WHEN to
// train and eat to the user's sleep window (so food doesn't wreck daytime sleep
// and training lands in the pre-shift alert window). Timing is pure HH:MM math.

/** Assumed day-sleep window when the user hasn't set one (a night worker sleeping
 * mornings). Keeps the split useful before Preferences are filled in. */
const DEFAULT_NIGHT_SLEEP = { start: '08:00', end: '16:00' } as const;

const CIRCADIAN_CYCLE: { title: string; focus: string[]; icon: string; cover: DayCover; slot: 'pre' | 'mid' | 'sleep' }[] = [
  { title: 'Pre-shift strength', focus: ['fullbody'], icon: 'barbell', cover: 'fullbody', slot: 'pre' },
  { title: 'Mid-shift cardio & core', focus: ['cardio', 'core'], icon: 'run', cover: 'cardio', slot: 'mid' },
  { title: 'Pre-shift upper body', focus: ['chest', 'back', 'shoulders'], icon: 'barbell', cover: 'chest', slot: 'pre' },
  { title: 'Recovery & anchor sleep', focus: [], icon: 'stretching', cover: 'recovery', slot: 'sleep' },
];

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validate a sleep window to two HH:MM strings, or null if malformed/absent. */
function normalizeWindow(w?: { start: string; end: string } | null): { start: string; end: string } | null {
  const start = (w?.start ?? '').trim();
  const end = (w?.end ?? '').trim();
  return HHMM_RE.test(start) && HHMM_RE.test(end) ? { start, end } : null;
}

/** Add `deltaMin` minutes to an HH:MM clock time, wrapping within a 24h day. */
function shiftClock(hhmm: string, deltaMin: number): string {
  const parts = hhmm.split(':');
  const total = ((((Number(parts[0]) * 60 + Number(parts[1]) + deltaMin) % 1440) + 1440) % 1440);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function circadianNote(slot: 'pre' | 'mid' | 'sleep', win: { start: string; end: string }): string {
  const wake = win.end;                          // sleep ends ⇒ you wake
  const mealBy = shiftClock(wake, 120);          // main meal within ~2h of waking
  const lastMeal = shiftClock(win.start, -180);  // stop eating ~3h before sleep
  const caffeine = shiftClock(win.start, -480);  // caffeine cutoff ~8h before sleep
  if (slot === 'pre')
    return `Train soon after you wake (${wake}) — you're sharpest before your shift · main meal by ${mealBy} · lighter food after ${lastMeal}`;
  if (slot === 'mid')
    return `Zone-2 to beat the 3am dip · last full meal by ${lastMeal}, snacks only after so food won't disrupt your ${win.start} sleep`;
  return `Rest & protect your daytime sleep ${win.start}–${win.end} · no caffeine after ${caffeine} · dim light and wind down before bed`;
}

/** Circadian-aligned split (Night-Shift Reset): training + meal timing anchored
 * to the user's sleep window, falling back to a canonical night-shift window. */
export function buildCircadianSplit(duration: number, ctx?: SplitContext): DaySkeleton[] {
  const win = normalizeWindow(ctx?.sleepWindow);
  const usingDefault = win === null;
  const w = win ?? DEFAULT_NIGHT_SLEEP;
  return Array.from({ length: duration }, (_, i) => {
    const t = CIRCADIAN_CYCLE[i % CIRCADIAN_CYCLE.length]!;
    let note = circadianNote(t.slot, w);
    if (usingDefault && i === 0) note += ' · set your sleep window in Preferences to tailor these times';
    return { day: i + 1, title: t.title, focus: [...t.focus], icon: t.icon, cover: t.cover, note };
  });
}

// ── Cycle-sync split (Cycle Sync) ──────────────────────────────────────────────
// Push in the high-energy phases, ease in the low-energy ones. The direction is
// REUSED from the decision engine's per-phase modifiers
// (services/decision-engine/src/engine.ts → CYCLE_VOLUME_MODIFIER: MENSTRUAL /
// LUTEAL 0.9 = ease, FOLLICULAR / OVULATORY 1.0 = push). That backend service
// isn't importable here, so we express the SAME direction as a day split (which
// days train hard vs recover) and keep this table as the single client mirror.

/** Phase → whether the day pushes hard or eases off (the reused direction). */
export const PHASE_INTENSITY: Record<MenstrualPhase, 'push' | 'ease'> = {
  follicular: 'push',
  ovulatory: 'push',
  menstrual: 'ease',
  luteal: 'ease',
};

type PhaseDay = { title: string; focus: string[]; icon: string; cover: DayCover };

/** A small per-phase rotation so consecutive same-phase days vary. PUSH phases
 * always carry a resistance / full-body focus; EASE phases never do (rest / core /
 * steady cardio only) — that invariant is what makes the split phase-aware. */
const PHASE_TEMPLATES: Record<MenstrualPhase, PhaseDay[]> = {
  follicular: [
    { title: 'Follicular · Strength', focus: ['chest', 'back'], icon: 'barbell', cover: 'chest' },
    { title: 'Follicular · Lower body', focus: ['legs', 'core'], icon: 'run', cover: 'legs' },
    { title: 'Follicular · Full body', focus: ['fullbody'], icon: 'barbell', cover: 'fullbody' },
  ],
  ovulatory: [
    { title: 'Ovulatory · Power', focus: ['fullbody'], icon: 'bolt', cover: 'fullbody' },
    { title: 'Ovulatory · Peak strength', focus: ['legs', 'shoulders'], icon: 'barbell', cover: 'shoulders' },
  ],
  luteal: [
    { title: 'Luteal · Steady cardio', focus: ['cardio', 'core'], icon: 'run', cover: 'cardio' },
    { title: 'Luteal · Core & mobility', focus: ['core'], icon: 'stretching', cover: 'core' },
    { title: 'Luteal · Recovery', focus: [], icon: 'stretching', cover: 'recovery' },
  ],
  menstrual: [
    { title: 'Menstrual · Recovery', focus: [], icon: 'stretching', cover: 'recovery' },
    { title: 'Menstrual · Gentle mobility', focus: ['core'], icon: 'stretching', cover: 'recovery' },
  ],
};

const PHASE_NOTE: Record<MenstrualPhase, string> = {
  follicular: 'Follicular phase — energy is rising. Push strength now; this is your best window to add load.',
  ovulatory: 'Ovulatory peak — strength and power run highest. Go hard, then ease as you head into the luteal phase.',
  luteal: 'Luteal phase — ease back. Premenstrual fatigue is normal; keep it steady and protect your sleep.',
  menstrual: 'Menstrual phase — ease right off. Gentle movement while energy is low; recovery counts as training.',
};

/** Illustrative push→ease week used when we don't know the user's real phases
 * (cycle tracking off / not enough data). Still demonstrates the concept. */
const DEFAULT_CYCLE_PROGRESSION: MenstrualPhase[] = [
  'follicular', 'follicular', 'ovulatory', 'ovulatory', 'luteal', 'luteal', 'menstrual',
];

/** Menstrual-phase-synced split (Cycle Sync): eases volume in menstrual/luteal,
 * pushes in follicular/ovulatory, per the reused decision-engine direction. */
export function buildCycleSyncSplit(duration: number, ctx?: SplitContext): DaySkeleton[] {
  const phases = ctx?.cyclePhases && ctx.cyclePhases.length > 0 ? ctx.cyclePhases : null;
  const usingDefault = phases === null;
  const seen: Record<MenstrualPhase, number> = { menstrual: 0, follicular: 0, ovulatory: 0, luteal: 0 };
  return Array.from({ length: duration }, (_, i) => {
    const phase: MenstrualPhase = phases?.[i] ?? DEFAULT_CYCLE_PROGRESSION[i % DEFAULT_CYCLE_PROGRESSION.length]!;
    const rotation = PHASE_TEMPLATES[phase];
    const t = rotation[seen[phase] % rotation.length]!;
    seen[phase] += 1;
    let note = PHASE_NOTE[phase];
    if (usingDefault && i === 0) note += ' · based on a typical cycle — log your period to sync this to you';
    return { day: i + 1, title: t.title, focus: [...t.focus], icon: t.icon, cover: t.cover, note };
  });
}
