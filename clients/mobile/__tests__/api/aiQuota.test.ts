/**
 * Tests for `parseAiQuotaError` in src/api/ai.ts.
 *
 * `parseAiQuotaError` is the shared parser for the AI/chat services' daily-limit
 * contract — `429 { error:'ai_quota_exceeded', limit, plan, resetsAt }`. It is
 * consumed by the AI routine planner (app/(exercises)/ai-planner.tsx) to flip
 * into a distinct "daily limit reached → Upgrade" state instead of the generic
 * retryable error. These tests pin that it:
 *
 *   - returns the parsed { limit, plan, resetsAt } for a real 429 quota body
 *     (free + pro), coercing `limit` to a Number and normalising `resetsAt`;
 *   - falls back to the plan default cap (free→5 / pro→20) when `limit` is
 *     absent or non-finite;
 *   - returns null for ANY non-quota error — a 500, a network error (no
 *     response), and a 429 carrying a different `error` code — so the caller
 *     falls through to its generic error handling.
 *
 * Pure helper: no network, but `@/api/client` / `@/lib/sentry` are mocked so the
 * module import (which pulls in apiClient + captureException) doesn't reach real
 * I/O, mirroring the sibling __tests__/api/ai.test.ts conventions.
 */

jest.mock('@/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  getAccessToken: jest.fn().mockResolvedValue('tok-123'),
  resolveApiUrl: jest.fn((p: string) => `https://api.test${p}`),
}));

jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));

import { parseAiQuotaError } from '@/api/ai';

describe('parseAiQuotaError', () => {
  test('parses a 429 ai_quota_exceeded body (free)', () => {
    const err = {
      response: {
        status: 429,
        data: { error: 'ai_quota_exceeded', limit: 5, plan: 'free', resetsAt: '2099-01-02T00:00:00.000Z' },
      },
    };

    expect(parseAiQuotaError(err)).toEqual({
      limit: 5,
      plan: 'free',
      resetsAt: '2099-01-02T00:00:00.000Z',
    });
  });

  test('parses a 429 ai_quota_exceeded body (pro)', () => {
    const err = {
      response: {
        status: 429,
        data: { error: 'ai_quota_exceeded', limit: 20, plan: 'pro', resetsAt: 'x' },
      },
    };

    expect(parseAiQuotaError(err)).toEqual({ limit: 20, plan: 'pro', resetsAt: 'x' });
  });

  test('falls back to the plan default cap when limit is absent or non-finite', () => {
    expect(
      parseAiQuotaError({ response: { status: 429, data: { error: 'ai_quota_exceeded', plan: 'free' } } }),
    ).toEqual({ limit: 5, plan: 'free', resetsAt: '' });

    expect(
      parseAiQuotaError({ response: { status: 429, data: { error: 'ai_quota_exceeded', plan: 'pro', limit: 'NaN' } } }),
    ).toEqual({ limit: 20, plan: 'pro', resetsAt: '' });
  });

  test('coerces a numeric-but-not-integer limit through Number', () => {
    expect(
      parseAiQuotaError({ response: { status: 429, data: { error: 'ai_quota_exceeded', limit: 12, plan: 'pro', resetsAt: '' } } }),
    ).toEqual({ limit: 12, plan: 'pro', resetsAt: '' });
  });

  test('returns null for a 500 server error', () => {
    expect(parseAiQuotaError({ response: { status: 500, data: {} } })).toBeNull();
  });

  test('returns null for a network error (no response)', () => {
    expect(parseAiQuotaError({ message: 'Network Error' })).toBeNull();
    expect(parseAiQuotaError(undefined)).toBeNull();
  });

  test('returns null for a 429 carrying a different error code (not the quota contract)', () => {
    expect(
      parseAiQuotaError({ response: { status: 429, data: { error: 'too_many_requests' } } }),
    ).toBeNull();
    // A 429 with no body at all is also not the quota contract.
    expect(parseAiQuotaError({ response: { status: 429 } })).toBeNull();
  });

  test('returns null for the ai-pipeline retryAfterSeconds 429 (not the shared quota contract)', () => {
    // The ai-pipeline helpers in src/api/ai.ts (ai.generatePlan / swapMeal /
    // scoreMeal — the /v1/ai/* endpoints) emit a DIFFERENT 429 shape on rate
    // limit: { error: 'Rate limit exceeded', retryAfterSeconds } (documented at
    // app/(tabs)/circadian.tsx:163). That is NOT the shared daily-quota contract
    // { error:'ai_quota_exceeded', limit, plan, resetsAt } parsed into the typed
    // result above, so it must INTENTIONALLY fall through to null rather than
    // flip the caller into the Upgrade state. Pins that the two shapes stay
    // distinguished by name, so a future regression that conflated them is caught.
    expect(
      parseAiQuotaError({ response: { status: 429, data: { error: 'Rate limit exceeded', retryAfterSeconds: 30 } } }),
    ).toBeNull();
  });
});
