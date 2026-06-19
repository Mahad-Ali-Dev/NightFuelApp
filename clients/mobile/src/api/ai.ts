import { AxiosError } from 'axios';
import { apiClient, getAccessToken, resolveApiUrl } from './client';
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

/** Parsed shape of the shared AI daily-quota 429 contract. */
export interface AiQuotaError {
  /** Authoritative daily cap for the caller's tier. */
  limit: number;
  /** Resolved plan tier (mirrors chat-service's free/pro tiers). */
  plan: 'free' | 'pro';
  /** ISO timestamp the quota window resets at ('' when the body omits it). */
  resetsAt: string;
}

// Plan → default daily cap, mirroring chat-service's AI_FREE_DAILY (5) /
// AI_PRO_DAILY (20) fallbacks. Used ONLY when a 429 body omits an explicit
// `limit`; an explicit numeric `limit` always wins. Kept in lock-step with the
// identical table behind ai-coach's parseQuotaError so both quota surfaces
// resolve the tier the same way the chat-service Ria quota does.
const AI_PLAN_DEFAULT_LIMIT: Record<AiQuotaError['plan'], number> = { free: 5, pro: 20 };

/**
 * Parse the shared "daily AI limit reached" 429 emitted by the AI/chat
 * services — `429 { error: 'ai_quota_exceeded', limit, plan, resetsAt }` — out
 * of any caught error. Returns the typed quota object so a caller can flip into
 * a distinct upgrade state, or `null` for ANY other error (network, 5xx, a
 * non-quota 4xx, a 429 with a different `error` code) so the caller falls
 * through to its generic error handling.
 *
 * Pure: no I/O, no new dependency. Defensive about shape — only a 429 whose
 * body `error` is exactly 'ai_quota_exceeded' counts; `limit` is coerced to a
 * finite Number (else the plan default), `plan` defaults to 'free', and
 * `resetsAt` is normalised to a string.
 */
export function parseAiQuotaError(err: unknown): AiQuotaError | null {
  const ax = err as AxiosError<{ error?: string; limit?: unknown; plan?: unknown; resetsAt?: unknown }>;
  if (!ax?.response || ax.response.status !== 429) return null;
  const body = ax.response.data;
  if (!body || body.error !== 'ai_quota_exceeded') return null;

  const plan: AiQuotaError['plan'] = body.plan === 'pro' ? 'pro' : 'free';
  const limit = Number.isFinite(body.limit) ? Number(body.limit) : AI_PLAN_DEFAULT_LIMIT[plan];
  const resetsAt = typeof body.resetsAt === 'string' ? body.resetsAt : '';
  return { limit, plan, resetsAt };
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
 * Streaming variant of `chat()`.
 *
 * Usage:
 *   const stop = streamChat(payload, {
 *     onToken: (delta) => append(delta),
 *     onDone:  (meta) => recordCost(meta),
 *     onError: (msg, partial) => fallBackOrShow(msg, partial),
 *   });
 *   // user navigates away → stop()
 *
 * Closes M1 from PRODUCTION_READINESS.md. The non-streaming `chat()`
 * remains as a fallback for callers that don't want to deal with deltas.
 *
 * Implementation notes:
 *   - Uses **XMLHttpRequest**, not fetch + ReadableStream. RN's fetch does
 *     not expose a usable streaming `response.body.getReader()` on either
 *     platform (Android buffers the whole body; iOS rejects `getReader`),
 *     so token-by-token rendering via fetch silently degrades to "whole
 *     reply at once". XHR's `onprogress` fires as bytes arrive and lets us
 *     read the cumulative `responseText`, which is reliable in RN.
 *   - We track a `lastIndex` into `responseText`, slice only the newly
 *     arrived suffix each progress tick, and split it on the SSE record
 *     separator "\n\n". A trailing partial record (no terminating blank
 *     line yet) is held back until the next tick.
 *   - Auth header attached manually (reuses {@link getAccessToken}); the
 *     URL is built with {@link resolveApiUrl} so the API base + `/v1`
 *     gateway-strip policy matches the axios interceptor exactly.
 *   - Sanitization applied client-side before transmission, same as the
 *     non-streaming chat().
 *   - On any error before/while streaming (network, non-200, parse,
 *     `error` event), invokes onError with the canned fallback reply *and*
 *     whatever partial text had arrived, so the caller can transparently
 *     fall back to the non-streaming path without regressing behaviour.
 */
export interface StreamDoneMeta {
  tokens?: number;
  tokens_input?: number;
  tokens_output?: number;
  cost_usd?: number;
  model?: string;
  latency_ms?: number;
}

export interface StreamChatHandlers {
  onToken: (delta: string) => void;
  onDone: (meta: StreamDoneMeta) => void;
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

  const url = resolveApiUrl('/v1/ai/chat/stream');

  // Stream bookkeeping.
  let partial = '';        // accumulated assistant text (for fallback/truncation)
  let lastIndex = 0;       // how far into xhr.responseText we've already parsed
  let finished = false;    // guard so we emit a terminal callback exactly once
  let aborted = false;     // user called the returned stop()
  let sawDone = false;     // received an explicit `done` / `[DONE]` sentinel

  const xhr = new XMLHttpRequest();

  /** Emit onError exactly once (network/parse/non-200) unless already done. */
  const fail = (source: string, extra?: Record<string, unknown>) => {
    if (finished || aborted) return;
    finished = true;
    captureException(new Error(`streamChat_${source}`), { source: `streamChat.${source}`, ...extra });
    handlers.onError(AI_FALLBACK_CHAT_REPLY, partial);
  };

  /**
   * Parse a single complete SSE record (one or more lines, already split off
   * at "\n\n"). A record may contain several `data:` lines; we handle each.
   */
  const handleRecord = (record: string) => {
    for (const line of record.split('\n')) {
      const trimmedLine = line.replace(/\r$/, '');
      if (!trimmedLine.startsWith('data:')) continue;
      const data = trimmedLine.slice(5).trim();
      if (!data) continue;

      // Stream sentinel — server signals completion.
      if (data === '[DONE]') {
        sawDone = true;
        if (!finished && !aborted) {
          finished = true;
          handlers.onDone({});
        }
        return;
      }

      try {
        const event = JSON.parse(data) as
          | { type: 'token'; delta: string }
          | ({ type: 'done' } & StreamDoneMeta)
          | { type: 'error'; message?: string; fallback?: string };

        if (event.type === 'token') {
          partial += event.delta;
          handlers.onToken(event.delta);
        } else if (event.type === 'done') {
          sawDone = true;
          if (!finished && !aborted) {
            finished = true;
            handlers.onDone({
              tokens: event.tokens,
              tokens_input: event.tokens_input,
              tokens_output: event.tokens_output,
              cost_usd: event.cost_usd,
              model: event.model,
              latency_ms: event.latency_ms,
            });
          }
        } else if (event.type === 'error') {
          // Server-side error event — treat as a stream failure so the
          // caller falls back to the non-streaming path.
          fail('event', { message: event.message });
        }
      } catch {
        // Malformed JSON line — skip silently (common mid-stream when a
        // record is split across progress ticks; the remainder is retried
        // on the next tick because we only advance lastIndex past complete
        // "\n\n"-terminated records).
      }
    }
  };

  /**
   * Drain every complete "\n\n"-terminated record from the suffix of
   * responseText we haven't parsed yet, leaving a trailing partial record
   * (if any) buffered for the next progress tick.
   *
   * @param flush when true (final read), also parse a trailing record that
   *              has no terminating blank line.
   */
  const drain = (flush: boolean) => {
    const text: string = xhr.responseText || '';
    let chunk = text.slice(lastIndex);

    let sepIdx: number;
    while ((sepIdx = chunk.indexOf('\n\n')) !== -1) {
      const record = chunk.slice(0, sepIdx);
      chunk = chunk.slice(sepIdx + 2);
      lastIndex = text.length - chunk.length;
      if (record.length > 0) handleRecord(record);
    }

    if (flush && chunk.length > 0) {
      handleRecord(chunk);
      lastIndex = text.length;
    }
  };

  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');
  // Empty string == default "text" response; required so responseText is
  // populated incrementally during onprogress in RN.
  try { xhr.responseType = ''; } catch { /* some RN versions reject reassignment after open */ }

  xhr.onprogress = () => {
    if (aborted) return;
    if (xhr.status && xhr.status !== 200) return; // handled in onreadystatechange/onload
    drain(false);
  };

  xhr.onload = () => {
    if (aborted || finished) return;
    if (xhr.status !== 200) {
      fail('http', { status: xhr.status });
      return;
    }
    drain(true);
    // Server closed the stream without an explicit done/[DONE]. Treat a
    // 200 with received tokens as a successful completion; an empty 200 as
    // a failure so the caller can fall back.
    if (!finished) {
      if (sawDone || partial.length > 0) {
        finished = true;
        handlers.onDone({});
      } else {
        fail('empty');
      }
    }
  };

  xhr.onerror = () => fail('network');
  xhr.ontimeout = () => fail('timeout');

  xhr.timeout = AI_TIMEOUTS.chat;

  (async () => {
    try {
      const token = await getAccessToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(JSON.stringify({ ...payload, message: safe.text }));
    } catch (err) {
      fail('send', { err: (err as Error)?.message });
    }
  })();

  return () => {
    aborted = true;
    finished = true;
    try { xhr.abort(); } catch { /* noop */ }
  };
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
