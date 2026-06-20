import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanMeal {
  time: string;
  label: string;
  description: string;
  macros?: {
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
  };
}

export interface NutritionPlan {
  id: string;
  userId: string;
  date: string;
  meals: PlanMeal[];
  supplements: string[];
  hydrationTargetMl: number;
  protocolId?: string;
  shiftId?: string;
  shiftType?: string;
  createdAt: string;
}

export interface ProtocolParameters {
  calories: number;
  protein_g: number;
  volume_modifier: number;
  deload?: boolean;
  training_split?: string;
}

export interface MealProtocol {
  id: string;
  name: string;
  description: string;
  parameters: ProtocolParameters;
  isPublic: boolean;
  creatorId?: string;
}

/**
 * Payload accepted by POST /v1/plans/protocols (createProtocolSchema).
 * `name` + `parameters` are required; `description`/`isPublic` are optional.
 */
export interface CreateProtocolPayload {
  name: string;
  description?: string;
  parameters: ProtocolParameters;
  isPublic?: boolean;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * The backend returns a Prisma DayPlan record where the structured plan
 * is nested inside a `plan` JSON field:
 *   { id, userId, planDate, plan: { meals, supplements, hydrationTargetMl, ... }, ... }
 *
 * The mobile UI expects a flat shape: { id, userId, meals, supplements, hydrationTargetMl, ... }
 * This normalizer bridges the gap.
 */
function normalizePlan(raw: any): NutritionPlan | null {
  if (!raw) return null;
  const inner = raw.plan ?? {};
  return {
    id: raw.id,
    userId: raw.userId,
    date: raw.planDate ?? raw.date,
    meals: inner.meals ?? raw.meals ?? [],
    supplements: inner.supplements ?? raw.supplements ?? [],
    hydrationTargetMl: inner.hydrationTargetMl ?? raw.hydrationTargetMl ?? 2500,
    protocolId: raw.protocolId,
    shiftId: raw.shiftId,
    shiftType: raw.shiftType ?? inner.shiftType,
    createdAt: raw.createdAt,
  };
}

/** Get plan for a specific date (YYYY-MM-DD) */
export const getPlanByDate = async (date: string) => {
  try {
    const { data } = await apiClient.get<any>(`/v1/plans/${date}`);
    return normalizePlan(data);
  } catch (err: any) {
    // 404 = no plan for this date — return null, don't crash
    if (err?.response?.status === 404) return null;
    throw err;
  }
};

/** Generate or regenerate a plan for a date */
export const generatePlan = async (payload: {
  date: string;
  circadianProfile?: any;
  shiftId?: string;
  shiftType?: string
}) => {
  const { data } = await apiClient.post<any>('/v1/plans/generate', payload, {
    timeout: 60000 // 60 seconds for AI generation
  });
  return normalizePlan(data);
};

/** Get plan history */
export const getPlanHistory = async () => {
  const { data } = await apiClient.get<NutritionPlan[]>('/v1/plans/history');
  return data;
};

/** Rate a plan */
export const ratePlan = async (id: string, rating: number) => {
  const { data } = await apiClient.post(`/v1/plans/${id}/rate`, { rating });
  return data;
};

/** Protocols */
export const getProtocols = async () => {
  const { data } = await apiClient.get<MealProtocol[]>('/v1/plans/protocols');
  return data;
};

export const createProtocol = async (payload: CreateProtocolPayload) => {
  const { data } = await apiClient.post<MealProtocol>('/v1/plans/protocols', payload);
  return data;
};

export const updateProtocol = async (id: string, payload: Partial<CreateProtocolPayload>) => {
  const { data } = await apiClient.patch<MealProtocol>(`/v1/plans/protocols/${id}`, payload);
  return data;
};

export const deleteProtocol = async (id: string) => {
  await apiClient.delete(`/v1/plans/protocols/${id}`);
};

// ---------------------------------------------------------------------------
// Aliases expected by hooks
// ---------------------------------------------------------------------------

/** Alias for hooks — fetches today's plan */
export const getToday = () => getPlanByDate(new Date().toISOString().slice(0, 10));

/** Alias for hooks — generates a plan */
export const generate = generatePlan;

/** Alias type for hooks */
export type GeneratePlanPayload = Parameters<typeof generatePlan>[0];

/** Alias type for hooks */
export type Plan = NutritionPlan;
