import { AxiosError } from 'axios';
import { apiClient, API_BASE_URL, getAccessToken } from './client';
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
 * Streaming variant of `chat()` — see streamChat below.
 */

/**
 * Streaming variant of `chat()`.
 *
 * Usage:
 *   const stop = streamChat(payload, {
 *     onToken: (delta) => append(delta),
 *     onDone:  (meta) => recordCost(meta),
 *     onError: (msg) => showError(msg),
 *   });
 *   // user navigates away → stop()
 *
 * Closes M1 from PRODUCTION_READINESS.md. The non-streaming `chat()`
 * remains as a fallback for callers that don't want to deal with deltas.
 *
 * Implementation notes:
 *   - Uses fetch + ReadableStream rather than `react-native-sse` so
 *     we don't add another native dependency. RN 0.81+ has streaming
 *     fetch responses on iOS / Android.
 *   - Auth header attached manually (no axios interceptor here).
 *   - Sanitization applied client-side before transmission, same as
 *     the non-streaming chat().
 *   - On any error before the stream starts (network, 4xx), invokes
 *     onError with the canned fallback reply.
 *   - On error mid-stream, calls onError with whatever was received
 *     so the UI can show "(reply truncated)".
 */
export interface StreamChatHandlers {
  onToken: (delta: string) => void;
  onDone: (meta: {
    tokens?: number;
    tokens_input?: number;
    tokens_output?: number;
    cost_usd?: number;
    model?: string;
    latency_ms?: number;
  }) => void;
  onError: (errorMessage: string, partialText: string) => void;
}

export function streamChat(
  payload: AiChatPayload,
  handlers: StreamChatHandlers,
): () => void {
  const safe = sanitizeAiInput(payload.message);
  if (safe.rejected) {
    handlers.onError("I didn't catch that — could you type your question again?", '');
    return () => undefined;
  }

  const controller = new AbortController();
  let partial = '';

  const url = `${API_BASE_URL}/v1/ai/chat/stream`;

  (async () => {
    try {
      const token = await getAccessToken();

      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...payload, message: safe.text }),
      });

      if (!res.ok) {
        captureException(new Error(`stream_http_${res.status}`), {
          source: 'streamChat.http',
          status: res.status,
        });
        handlers.onError(AI_FALLBACK_CHAT_REPLY, partial);
        return;
      }

      const body = (res as any).body as ReadableStream<Uint8Array> | undefined;
      if (!body || typeof body.getReader !== 'function') {
        // Fallback: pull whole body, then split into events. Loses the
        // "see tokens as they arrive" benefit but doesn't break.
        const text = await res.text();
        for (const line of text.split('\n\n')) {
          processSseLine(line, handlers, (acc) => { partial += acc; });
        }
        return;
      }

      const reader = body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events end with a blank line (\n\n). Pull complete events
        // out of the buffer; whatever remains waits for the next chunk.
        let blankIdx;
        while ((blankIdx = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, blankIdx);
          buffer = buffer.slice(blankIdx + 2);
          processSseLine(event, handlers, (acc) => { partial += acc; });
        }
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return;
      captureException(err, { source: 'streamChat.fetch' });
      handlers.onError(AI_FALLBACK_CHAT_REPLY, partial);
    }
  })();

  return () => {
    try { controller.abort(); } catch { /* noop */ }
  };
}

function processSseLine(
  raw: string,
  handlers: StreamChatHandlers,
  appendPartial: (delta: string) => void,
): void {
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;

    try {
      const event = JSON.parse(data) as
        | { type: 'token'; delta: string }
        | { type: 'done'; tokens?: number; tokens_input?: number; tokens_output?: number; cost_usd?: number; model?: string; latency_ms?: number }
        | { type: 'error'; message: string; fallback?: string };

      if (event.type === 'token') {
        handlers.onToken(event.delta);
        appendPartial(event.delta);
      } else if (event.type === 'done') {
        handlers.onDone({
          tokens: event.tokens,
          tokens_input: event.tokens_input,
          tokens_output: event.tokens_output,
          cost_usd: event.cost_usd,
          model: event.model,
          latency_ms: event.latency_ms,
        });
      } else if (event.type === 'error') {
        handlers.onError(event.fallback ?? event.message, '');
      }
    } catch {
      // Malformed event line — skip silently (common during stream
      // truncation; logging would be noisy).
    }
  }
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
