import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TodayProgress {
  id: string;
  userId: string;
  date: string;
  caloriesTarget: number | null;
  caloriesActual: number;
  proteinTarget: number | null;
  proteinActual: number;
  carbsTarget: number | null;
  carbsActual: number;
  fatTarget: number | null;
  fatActual: number;
  mealsLogged: number;
  isAdherent: boolean;
  fatigueScore: number;
  hydrationActual: number;
  stepCount: number;
  source: string;
  supplementsLogged: any;
  lightExposureCompleted: boolean;
  planId: string | null;
  createdAt: string;
  updatedAt: string;
  // Legacy aliases for backward compat in UI code
  hydrationMl?: number;
  hydrationTargetMl?: number;
  score?: number;
}

export interface Streak {
  current: number;
  longest: number;
  lastActiveDate: string;
}

export interface WeeklyStats {
  avgCalories: number;
  avgProtein: number;
  avgHydration: number;
  avgScore: number;
  daysLogged: number;
  streakDays: number;
}

export interface BodyMetrics {
  id: string;
  date: string;
  recordedAt?: string;
  weightKg?: number;
  bodyFatPct?: number;
  muscleMassKg?: number;
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  armsCm?: number;
  thighsCm?: number;
  calvesCm?: number;
}

export interface LogBodyMetricsPayload {
  weightKg?: number;
  bodyFatPct?: number;
  muscleMassKg?: number;
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  armsCm?: number;
  thighsCm?: number;
  calvesCm?: number;
  notes?: string;
}

export interface ProgressHistoryEntry {
  date: string;
  score: number;
  calories: number;
  hydrationMl: number;
}

export interface ProgressStats {
  avgScore: number;
  avgCalories: number;
  avgHydration: number;
  totalDays: number;
  topScore: number;
}

export interface PerformanceReport {
  id: string;
  userId: string;
  weekRange: string;
  score: number;
  summary: string;
  highlights: string[];
  improvements: string[];
  focusArea: string;
  date: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** Fetch today's consolidated progress. */
export async function getToday(): Promise<TodayProgress> {
  const { data } = await apiClient.get<TodayProgress>('/v1/progress/today');
  return data;
}

/** Fetch historical AI Performance Reports. */
export async function getPerformanceReports(): Promise<PerformanceReport[]> {
  const { data } = await apiClient.get<PerformanceReport[]>('/v1/progress/reports');
  return data;
}

/** Trigger generation of a new weekly AI audit. */
export async function generateWeeklyAudit(): Promise<PerformanceReport> {
  const { data } = await apiClient.post<PerformanceReport>('/v1/progress/weekly-audit');
  return data;
}

/** Log a hydration entry. */
export async function logHydration(
  amount: number,
): Promise<{ hydrationMl: number }> {
  const { data } = await apiClient.post<{ hydrationMl: number }>(
    '/v1/progress/hydration',
    { amount },
  );
  return data;
}

/** Get the current streak information. */
export async function getStreak(): Promise<Streak> {
  // Backend returns currentStreak / longestStreak / lastAdherentDate
  const { data } = await apiClient.get<any>('/v1/progress/streak');
  return {
    current: data.currentStreak ?? data.current ?? 0,
    longest: data.longestStreak ?? data.longest ?? 0,
    lastActiveDate: data.lastAdherentDate ?? data.lastActiveDate ?? '',
  };
}

/** Get aggregated stats for the past week. */
export async function getWeeklyStats(): Promise<WeeklyStats> {
  // Backend returns `{ summary, chartData }` where `summary` is the getStats()
  // shape (daysTracked / avgCaloriesActual / adherencePercent / …) — NOT the flat
  // fields below — and carries no streak. Map it here and pull the streak in
  // parallel so the Weekly Recap never renders `undefined`/`NaN`.
  const [resp, streak] = await Promise.all([
    apiClient.get<any>('/v1/progress/weekly-stats'),
    getStreak().catch(() => ({ current: 0, longest: 0, lastActiveDate: '' } as Streak)),
  ]);

  const root = resp.data?.data ?? resp.data ?? {};
  const s = root.summary ?? root ?? {};
  const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : 0);

  return {
    avgCalories: num(s.avgCaloriesActual ?? s.avgCalories),
    avgProtein: num(s.avgProteinActual ?? s.avgProtein),
    avgHydration: num(s.avgHydration ?? s.avgHydrationActual),
    avgScore: num(s.adherencePercent ?? s.avgScore),
    daysLogged: num(s.daysTracked ?? s.daysLogged ?? s.totalDays),
    streakDays: num(streak.current ?? s.streakDays),
  };
}

/** Log body measurement metrics. */
export async function logBodyMetrics(
  payload: LogBodyMetricsPayload,
): Promise<BodyMetrics> {
  const { data } = await apiClient.post<BodyMetrics>(
    '/v1/progress/metrics',
    payload,
  );
  return data;
}

/** Get body metrics history for the past N days. */
export async function getBodyMetrics(days = 90): Promise<BodyMetrics[]> {
  const { data } = await apiClient.get<BodyMetrics[]>('/v1/progress/metrics', {
    params: { days },
  });
  return data;
}

/** Get daily progress history for the past N days. */
export async function getHistory(
  days = 7,
): Promise<ProgressHistoryEntry[]> {
  const { data } = await apiClient.get<ProgressHistoryEntry[]>(
    '/v1/progress/history',
    { params: { days } },
  );
  return data;
}

/** Get aggregate stats for the past N days. */
export async function getStats(days = 30): Promise<ProgressStats> {
  const { data } = await apiClient.get<ProgressStats>('/v1/progress/stats', {
    params: { days },
  });
  return data;
}
