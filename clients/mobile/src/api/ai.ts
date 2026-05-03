import { AxiosError } from 'axios';
import { apiClient } from './client';
import { sanitizeAiInput, AI_TIMEOUTS, AI_FALLBACK_CHAT_REPLY } from '@/lib/aiSafety';
import { captureException } from '@/lib/sentry';

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
  /** True when the reply came from the offline fallback, not the server. */
  fallback?: boolean;
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * True if the error from an AI endpoint is "service unavailable" — i.e. we
 * should consider falling back to the offline / canned response rather than
 * surfacing a raw error to the user.
 *
 * Includes:
 *   - Network errors (no response)
 *   - 502 / 503 / 504 from the gateway
 *   - timeouts (axios `ECONNABORTED`)
 *
 * Excludes:
 *   - 4xx (client error — surface to caller, don't mask)
 *   - 401 (auth — interceptor handles refresh)
 */
function isServiceUnavailable(err: unknown): boolean {
  const ax = err as AxiosError;
  if (!ax) return false;
  if (ax.code === 'ECONNABORTED') return true; // timeout
  if (!ax.response) return true; // network failure / DNS / TLS
  const status = ax.response.status;
  return status >= 502 && status <= 504;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function getWeeklyAudit() {
  const { data } = await apiClient.get('/v1/ai/weekly-audit', {
    timeout: AI_TIMEOUTS.weeklyAudit,
  });
  return data;
}

export async function generatePlan(payload: {
  userId: string;
  date: string;
  shiftId: string;
  shiftType: string;
  profileData?: any;
}) {
  const { data } = await apiClient.post('/v1/ai/generate-plan', payload, {
    timeout: AI_TIMEOUTS.generatePlan,
  });
  return data;
}

/**
 * Send a message to the AI coach.
 *
 * The message is run through {@link sanitizeAiInput} client-side: control
 * characters / invisible Unicode are stripped, length capped at 2000 chars,
 * and recognized prompt-injection patterns are flagged and reported to
 * Sentry as a non-fatal breadcrumb (the message is still sent — the server
 * is the authoritative gate).
 *
 * On gateway 5xx / network failure / timeout, returns
 * {@link AI_FALLBACK_CHAT_REPLY} with `fallback: true` rather than throwing.
 * Other errors (4xx) propagate so callers can show validation messages.
 */
export async function chat(payload: AiChatPayload): Promise<AiChatResponse> {
  const safe = sanitizeAiInput(payload.message);
  if (safe.rejected) {
    return {
      reply: "I didn't catch that — could you type your question again?",
      fallback: true,
    };
  }

  // Soft signal — flagged inputs go to Sentry without blocking.
  if (safe.flags.length > 0) {
    captureException(new Error('ai_input_flagged'), {
      flags: safe.flags,
      modified: safe.modified,
      // Never log the actual message text — it may contain PII or be the
      // injection payload itself.
    });
  }

  try {
    const { data } = await apiClient.post<AiChatResponse>(
      '/v1/ai/chat',
      { ...payload, message: safe.text },
      { timeout: AI_TIMEOUTS.chat },
    );
    return data;
  } catch (err) {
    if (isServiceUnavailable(err)) {
      // Don't capture a Sentry exception here — service-unavailable is an
      // operational state, not an app bug.
      return { reply: AI_FALLBACK_CHAT_REPLY, fallback: true };
    }
    throw err;
  }
}

/** Ask the AI to suggest a meal swap. */
export async function swapMeal(payload: MealSwapPayload): Promise<MealSwapResponse> {
  const { data } = await apiClient.post<MealSwapResponse>('/v1/ai/meal-swap', payload, {
    timeout: AI_TIMEOUTS.mealSwap,
  });
  return data;
}

/**
 * Score a meal according to chrono-nutrition rules.
 *
 * Falls back to a neutral "score not available" result on service outage so
 * the meal-logging flow doesn't get blocked by a single 5xx.
 */
export async function scoreMeal(payload: MealScorePayload): Promise<MealScoreResponse> {
  try {
    const { data } = await apiClient.post<MealScoreResponse>('/v1/ai/meal-score', payload, {
      timeout: AI_TIMEOUTS.mealScore,
    });
    return data;
  } catch (err) {
    if (isServiceUnavailable(err)) {
      return {
        score: 0,
        breakdown: {},
        feedback: "Score unavailable right now. Your meal was logged successfully.",
      };
    }
    throw err;
  }
}
