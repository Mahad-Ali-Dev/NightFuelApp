import { apiClient } from './client';
import { clamp } from '@/utils/validation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  difficulty: string;
  instructions?: string;
  imageUrl?: string;
  /** Body part targeted (e.g. "chest", "upper legs", "waist") */
  bodyPart?: string;
  /** App category: "gym" | "home" | "cardio" | "kegel" */
  category?: string;
  /** Deep-link / watch URL for a demo video. Null/undefined when unknown. */
  demoUrl?: string;
  /** Animated GIF demonstrating the movement, when available. */
  demoGifUrl?: string;
  /** Secondary muscles worked (from wger), when available. */
  secondaryMuscles?: string[];
}

export interface WorkoutSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  routineId?: string;
  logs: SessionExercise[];
}

export interface SessionExercise {
  exerciseName: string;
  sets: number;
  reps: number;
  weightKg: number;
  durationSecs: number;
}

/** A single exercise entry within a logged workout. */
export interface WorkoutExercise {
  name: string;
  sets: number;
  reps: number;
  weightKg: number;
}

/**
 * A completed workout log as returned by `GET /v1/exercises` (getRecent) and
 * created by `POST /v1/exercises` (logWorkout). Fields are optional because the
 * backend log shape is sparse — consumers (history, heatmap) guard each one.
 */
export interface Workout {
  id: string;
  type?: string;
  title?: string;
  duration?: number;
  intensity?: string;
  totalVolume?: number;
  exercises?: WorkoutExercise[];
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  date?: string;
}

/** Payload accepted by `POST /v1/exercises` to log a completed workout. */
export interface LogWorkoutPayload {
  type?: string;
  title?: string;
  duration?: number;
  intensity?: string;
  exercises?: WorkoutExercise[];
}

export interface Routine {
  id: string;
  name: string;
  exercises: Array<{ name: string; sets: number; reps: number }>;
}

export interface OneRepMax {
  exerciseName: string;
  weightKg: number;
  estimated1RMKg: number;
  date: string;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export interface SearchLibraryFilters {
  /** Free-text name search */
  query?: string | null;
  /** App category: gym, home, cardio, kegel */
  category?: string | null;
  /** Muscle group label (e.g. "Chest", "Back") — backend does case-insensitive `contains` */
  muscleGroup?: string | null;
  /** ExerciseDB body-part key (e.g. "upper arms", "waist", "upper legs") */
  bodyPart?: string | null;
  /** Equipment filter (e.g. "barbell", "body weight") */
  equipment?: string | null;
  /** Page size — backend supports up to 200 */
  limit?: number;
}

/**
 * Search the exercise library.
 *
 * Backwards-compatible: legacy two-positional-arg form still works
 *   searchLibrary("chest")
 *   searchLibrary("chest", "gym")
 *
 * New filter-object form (preferred):
 *   searchLibrary({ muscleGroup: "Chest" })
 *   searchLibrary({ bodyPart: "upper arms", limit: 200 })
 */
export const searchLibrary = async (
  queryOrFilters?: string | SearchLibraryFilters | null,
  category?: string | null,
): Promise<Exercise[]> => {
  // Resolve overloaded args into a single filters object.
  const filters: SearchLibraryFilters =
    queryOrFilters && typeof queryOrFilters === 'object'
      ? queryOrFilters
      : { query: queryOrFilters as string | null | undefined, category };

  const params: Record<string, string | number> = { limit: filters.limit ?? 200 };
  if (filters.query) params.query = filters.query;
  if (filters.category) params.category = filters.category;
  if (filters.muscleGroup) params.muscleGroup = filters.muscleGroup;
  if (filters.bodyPart) params.bodyPart = filters.bodyPart;
  if (filters.equipment) params.equipment = filters.equipment;

  const { data } = await apiClient.get<Exercise[]>('/v1/exercises/library', { params });
  return data;
};

export const getRecent = async (limit = 10): Promise<Workout[]> => {
  const { data } = await apiClient.get<Workout[]>(`/v1/exercises`, { params: { limit } });
  return data;
};

export const getById = async (id: string): Promise<Exercise> => {
  const { data } = await apiClient.get<Exercise>(`/v1/exercises/library/${id}`);
  return data;
};

export const logWorkout = async (payload: LogWorkoutPayload): Promise<Workout> => {
  const { data } = await apiClient.post<Workout>('/v1/exercises', payload);
  return data;
};

export const deleteWorkout = async (id: string) => {
  const { data } = await apiClient.delete(`/v1/exercises/${id}`);
  return data;
};

export const startSession = async (routineId?: string): Promise<WorkoutSession> => {
  const { data } = await apiClient.post<WorkoutSession>('/v1/exercises/session/start', { routineId });
  return data;
};

export const getActiveSession = async (): Promise<WorkoutSession | null> => {
  try {
    const { data } = await apiClient.get<WorkoutSession | null>('/v1/exercises/session/active');
    return data;
  } catch (err: any) {
    // Backend returns 404 when no active session exists — that's not an error
    if (err?.response?.status === 404) return null;
    throw err;
  }
};

export const logSessionExercise = async (
  sessionId: string,
  payload: { exerciseName: string; sets: number; reps: number; weightKg: number; durationSecs: number },
) => {
  const { data } = await apiClient.post(`/v1/exercises/session/${sessionId}/exercise/log`, payload);
  return data;
};

export const endSession = async (sessionId: string) => {
  const { data } = await apiClient.post(`/v1/exercises/session/${sessionId}/end`);
  return data;
};

export const getRoutines = async (): Promise<Routine[]> => {
  const { data } = await apiClient.get<Routine[]>('/v1/exercises/routines');
  return data;
};

/** A single exercise entry accepted by {@link shapeCreateRoutine}. */
export interface RoutineExerciseInput {
  name: string;
  sets?: number;
  reps?: number;
}

/** A whitelisted routine payload accepted by `POST /v1/exercises/routines`. */
export interface CreateRoutineInput {
  /** Display title (required). Sent as `title` to match the backend schema. */
  title: string;
  description?: string;
  splitType?: string;
  exercises: RoutineExerciseInput[];
}

/**
 * Round to an integer and clamp into `[min, max]`, mapping NaN/non-finite to 0.
 * Mirrors the backend's `z.number().int().min(min).max(max)` on routine sets/reps
 * so the client never POSTs a value the server would reject.
 */
function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return clamp(n, min, max);
}

/**
 * Build a clean, bounded create-routine payload from untrusted caller input.
 *
 * Mirrors the backend `createRoutineSchema` (exercise-service): `title` is
 * required (min 1 char), the `exercises` array is capped at 50, and each
 * exercise's `sets`/`reps` are integer-clamped to 0-100 / 0-1000. Any field not
 * on the whitelist (`title`/`description`/`splitType`/`exercises`, and per
 * exercise `name`/`sets`/`reps`) is stripped, so a caller cannot smuggle extra
 * keys (e.g. `isAdmin`) straight into the request body.
 *
 * @throws Error when the resolved title is empty/whitespace-only.
 */
export function shapeCreateRoutine(input: unknown): CreateRoutineInput {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

  // Backend requires `title`; tolerate a legacy `name` alias as a fallback.
  const rawTitle = src.title ?? src.name;
  const title = (typeof rawTitle === 'string' ? rawTitle : String(rawTitle ?? '')).trim();
  if (!title) throw new Error('Routine title is required');

  const shaped: CreateRoutineInput = {
    title,
    exercises: (Array.isArray(src.exercises) ? src.exercises : [])
      .slice(0, 50)
      .map((e): RoutineExerciseInput => {
        const ex = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
        return {
          name: (typeof ex.name === 'string' ? ex.name : String(ex.name ?? '')).trim(),
          sets: clampInt(ex.sets, 0, 100),
          reps: clampInt(ex.reps, 0, 1000),
        };
      }),
  };

  if (typeof src.description === 'string') shaped.description = src.description;
  if (typeof src.splitType === 'string') shaped.splitType = src.splitType;

  return shaped;
}

export const createRoutine = async (input: unknown): Promise<Routine> => {
  const { data } = await apiClient.post<Routine>('/v1/exercises/routines', shapeCreateRoutine(input));
  return data;
};

export interface GenerateRoutinePayload {
  goal: 'strength' | 'hypertrophy' | 'endurance' | 'fat_loss' | 'general';
  level: 'beginner' | 'intermediate' | 'advanced';
  daysPerWeek: number;
  focusAreas?: string[];
  equipment?: string;
}

/** Ask Ria to generate an AI workout routine and save it automatically. */
export const generateRoutineWithAI = async (payload: GenerateRoutinePayload): Promise<Routine> => {
  const { data } = await apiClient.post<Routine>('/v1/exercises/routines/generate', payload, {
    timeout: 60_000, // 60s for AI generation
  });
  return data;
};

export const getOneRepMaxes = async (): Promise<OneRepMax[]> => {
  const { data } = await apiClient.get<OneRepMax[]>('/v1/exercises/1rm');
  return data;
};

export const logOneRepMax = async (payload: { exerciseName: string; weightKg: number; estimated1RMKg: number }) => {
  const { data } = await apiClient.post('/v1/exercises/1rm', payload);
  return data;
};

export const getHeatmap = async () => {
  const { data } = await apiClient.get('/v1/exercises/history/heatmap');
  return data;
};

export const getAnalytics = async (exerciseName: string) => {
  const { data } = await apiClient.get(`/v1/exercises/analytics/${encodeURIComponent(exerciseName)}`);
  return data;
};

/** Fetch a single logged workout (with its exercises) for the report screen.
 *  Note: this hits the workout endpoint `/v1/exercises/:id`, NOT the exercise
 *  *library* endpoint used by getById. A workout-log id is not a library id. */
export const getWorkout = async (id: string) => {
  const { data } = await apiClient.get(`/v1/exercises/${id}`);
  return data;
};
