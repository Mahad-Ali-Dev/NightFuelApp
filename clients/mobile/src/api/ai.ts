import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiChatPayload {
  userId: string;
  message: string;
  history: Array<{ role: string; content: string }>;
  context?: Record<string, unknown>;
}

export interface AiChatResponse {
  reply: string;
  suggestions?: string[];
}

export interface MealSwapPayload {
  meal_to_swap: Record<string, unknown>;
  preferences: Record<string, unknown>;
  provider?: string;
}

export interface MealSwapResponse {
  swappedMeal: Record<string, unknown>;
  reasoning: string;
}

export interface MealScorePayload {
  userId: string;
  meal: Record<string, unknown>;
  preferences: Record<string, unknown>;
}

export interface MealScoreResponse {
  score: number;
  breakdown: Record<string, number>;
  feedback: string;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function getWeeklyAudit() {
  const { data } = await apiClient.get('/v1/ai/weekly-audit');
  return data;
}

export async function generatePlan(payload: { userId: string, date: string, shiftId: string, shiftType: string, profileData?: any }) {
  const { data } = await apiClient.post('/v1/ai/generate-plan', payload);
  return data;
}


/** Send a message to the AI coach. */
export async function chat(payload: AiChatPayload): Promise<AiChatResponse> {
  const { data } = await apiClient.post<AiChatResponse>(
    '/v1/ai/chat',
    payload,
  );
  return data;
}

/** Ask the AI to suggest a meal swap. */
export async function swapMeal(
  payload: MealSwapPayload,
): Promise<MealSwapResponse> {
  const { data } = await apiClient.post<MealSwapResponse>(
    '/v1/ai/meal-swap',
    payload,
  );
  return data;
}

/** Score a meal according to chrono-nutrition rules. */
export async function scoreMeal(
  payload: MealScorePayload,
): Promise<MealScoreResponse> {
  const { data } = await apiClient.post<MealScoreResponse>(
    '/v1/ai/meal-score',
    payload,
  );
  return data;
}
