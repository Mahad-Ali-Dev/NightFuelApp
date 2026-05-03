import { apiClient } from './client';

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

export const searchLibrary = async (query?: string | null, category?: string | null): Promise<Exercise[]> => {
  const params: any = { limit: 50 };
  if (query) params.query = query;
  if (category) params.category = category;

  const { data } = await apiClient.get<Exercise[]>('/v1/exercises/library', { params });
  return data;
};

export const getRecent = async (limit = 10) => {
  const { data } = await apiClient.get(`/v1/exercises`, { params: { limit } });
  return data;
};

export const getById = async (id: string) => {
  const { data } = await apiClient.get(`/v1/exercises/library/${id}`);
  return data;
};

export const logWorkout = async (payload: any) => {
  const { data } = await apiClient.post('/v1/exercises', payload);
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

export const createRoutine = async (payload: any): Promise<Routine> => {
  const { data } = await apiClient.post<Routine>('/v1/exercises/routines', payload);
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

/** Alias for report screen */
export const getWorkout = getById;
