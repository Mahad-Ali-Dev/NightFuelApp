import type { SymptomDischarge, SymptomActivity, SymptomFlow } from '@/api/cycle';

/**
 * Period P1 — the categorized symptom library the day-logger renders. Keys are
 * short, stable slugs persisted in CycleSymptomLog.symptoms (a text[]); labels +
 * icons are UI-only. Kept out of the API module so the catalog can grow without
 * touching the request/response contract. Mirrors the breadth of Flo / Period
 * Calendar (physical / mood / digestion / skin) so logging feels complete.
 *
 * NOTE: discharge, flow, activity and mood/energy scales are SEPARATE single-
 * selects (own columns) — this multi-select list is the qualitative "how did the
 * body feel" tags.
 */

/** One selectable symptom. `icon` is an Ionicons (outline) glyph name. */
export interface SymptomDef {
  key: string;
  label: string;
  icon: string;
}

export interface SymptomCategory {
  key: string;
  title: string;
  items: SymptomDef[];
}

export const SYMPTOM_CATEGORIES: SymptomCategory[] = [
  {
    key: 'physical',
    title: 'Physical',
    items: [
      { key: 'cramps', label: 'Cramps', icon: 'flash-outline' },
      { key: 'headache', label: 'Headache', icon: 'sad-outline' },
      { key: 'backache', label: 'Backache', icon: 'body-outline' },
      { key: 'tender_breasts', label: 'Tender breasts', icon: 'heart-outline' },
      { key: 'bloating', label: 'Bloating', icon: 'ellipse-outline' },
      { key: 'fatigue', label: 'Fatigue', icon: 'bed-outline' },
      { key: 'nausea', label: 'Nausea', icon: 'medkit-outline' },
      { key: 'dizziness', label: 'Dizziness', icon: 'sync-outline' },
      { key: 'joint_pain', label: 'Joint pain', icon: 'walk-outline' },
    ],
  },
  {
    key: 'mood',
    title: 'Mood',
    items: [
      { key: 'happy', label: 'Happy', icon: 'happy-outline' },
      { key: 'calm', label: 'Calm', icon: 'leaf-outline' },
      { key: 'sensitive', label: 'Sensitive', icon: 'rainy-outline' },
      { key: 'anxious', label: 'Anxious', icon: 'thunderstorm-outline' },
      { key: 'irritable', label: 'Irritable', icon: 'flame-outline' },
      { key: 'low', label: 'Low', icon: 'cloud-outline' },
      { key: 'energetic', label: 'Energetic', icon: 'sunny-outline' },
    ],
  },
  {
    key: 'digestion',
    title: 'Digestion',
    items: [
      { key: 'constipation', label: 'Constipation', icon: 'remove-circle-outline' },
      { key: 'diarrhea', label: 'Diarrhoea', icon: 'water-outline' },
      { key: 'gassy', label: 'Gassy', icon: 'balloon-outline' },
      { key: 'cravings', label: 'Cravings', icon: 'fast-food-outline' },
      { key: 'increased_appetite', label: 'More hungry', icon: 'restaurant-outline' },
    ],
  },
  {
    key: 'skin',
    title: 'Skin',
    items: [
      { key: 'acne', label: 'Acne', icon: 'ellipse-outline' },
      { key: 'oily_skin', label: 'Oily skin', icon: 'water-outline' },
      { key: 'dry_skin', label: 'Dry skin', icon: 'snow-outline' },
    ],
  },
  {
    key: 'sleep',
    title: 'Sleep',
    items: [
      { key: 'insomnia', label: 'Insomnia', icon: 'moon-outline' },
      { key: 'restful', label: 'Slept well', icon: 'bed-outline' },
      { key: 'night_sweats', label: 'Night sweats', icon: 'thermometer-outline' },
    ],
  },
];

/** Flat label lookup for rendering already-logged keys (history / summaries). */
export const SYMPTOM_LABELS: Record<string, string> = SYMPTOM_CATEGORIES.reduce(
  (acc, cat) => {
    for (const it of cat.items) acc[it.key] = it.label;
    return acc;
  },
  {} as Record<string, string>,
);

/** Every valid symptom key — used to sanitize an incoming set before display. */
export const ALL_SYMPTOM_KEYS: ReadonlySet<string> = new Set(Object.keys(SYMPTOM_LABELS));

// ── Single-select option lists (own columns, not the symptoms[] array) ─────────

export const FLOW_OPTIONS: Array<{ v: SymptomFlow; label: string }> = [
  { v: 'SPOTTING', label: 'Spotting' },
  { v: 'LIGHT', label: 'Light' },
  { v: 'MEDIUM', label: 'Medium' },
  { v: 'HEAVY', label: 'Heavy' },
];

export const DISCHARGE_OPTIONS: Array<{ v: SymptomDischarge; label: string }> = [
  { v: 'DRY', label: 'Dry' },
  { v: 'STICKY', label: 'Sticky' },
  { v: 'CREAMY', label: 'Creamy' },
  { v: 'EGG_WHITE', label: 'Egg white' },
  { v: 'WATERY', label: 'Watery' },
  { v: 'SPOTTING', label: 'Spotting' },
];

export const ACTIVITY_OPTIONS: Array<{ v: SymptomActivity; label: string }> = [
  { v: 'NONE', label: 'None' },
  { v: 'PROTECTED', label: 'Protected' },
  { v: 'UNPROTECTED', label: 'Unprotected' },
  { v: 'HIGH_DRIVE', label: 'High drive' },
];

export const DISCHARGE_LABELS: Record<SymptomDischarge, string> = Object.fromEntries(
  DISCHARGE_OPTIONS.map((o) => [o.v, o.label]),
) as Record<SymptomDischarge, string>;
