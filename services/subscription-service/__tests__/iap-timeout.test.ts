/**
 * Regression suite — subscription-service IAP HTTP TIMEOUT (MEDIUM #8) in the
 * REAL iap-validator (src/iap-validator.ts), driven through validateAppleReceipt
 * with the global `fetch` mocked.
 *
 * Background (the bug this suite locks shut):
 *   postJson() used a bare fetch() with NO timeout. Receipt validation runs on
 *   the SYNCHRONOUS purchase-verification route, so a hung App Store endpoint
 *   would pin the request indefinitely.
 *
 *   The fix passes AbortSignal.timeout(10s) to fetch. When the App Store stalls,
 *   the signal fires and fetch rejects with a TimeoutError; postJson rethrows,
 *   and validateAppleReceipt propagates it (it does NOT swallow the error into a
 *   "valid" result). The route's catch then surfaces the validation-failure path
 *   (errorCode 'server_error', valid:false). Net effect: a timeout FAILS CLOSED —
 *   no tier is ever granted.
 *
 * Focused unit test of the validator. We mock the global fetch so no network is
 * touched. We do NOT advance a real 10s clock — instead the mock reproduces
 * exactly what fetch does on a timed-out AbortSignal (reject with a TimeoutError),
 * and separately asserts that postJson actually wires an AbortSignal into fetch.
 */

import { validateAppleReceipt } from '../src/iap-validator';

// Reproduces fetch's behaviour when its AbortSignal.timeout fires: reject with a
// DOMException-like error whose .name is 'TimeoutError'.
function mockTimingOutFetch(): jest.Mock {
    const fn = jest.fn(async (_url: string, _init?: { signal?: AbortSignal }) => {
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        throw err;
    });
    (global as any).fetch = fn;
    return fn as unknown as jest.Mock;
}

describe('subscription-service IAP HTTP timeout (MEDIUM #8)', () => {
    const prevSecret = process.env.APPLE_SHARED_SECRET;

    beforeAll(() => {
        // A shared secret so validateAppleReceipt does not short-circuit on config.
        process.env.APPLE_SHARED_SECRET = 'shared-secret-test-value';
    });

    afterAll(() => {
        if (prevSecret === undefined) delete process.env.APPLE_SHARED_SECRET;
        else process.env.APPLE_SHARED_SECRET = prevSecret;
    });

    it('wires an AbortSignal into the fetch call (so a hung endpoint can be aborted)', async () => {
        const fetchMock = mockTimingOutFetch();

        await validateAppleReceipt('receipt-blob').catch(() => undefined);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const init = fetchMock.mock.calls[0][1];
        expect(init).toBeDefined();
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('FAILS CLOSED on timeout — validateAppleReceipt rejects, no tier granted', async () => {
        mockTimingOutFetch();

        let settled: { ok: boolean; value?: unknown; err?: Error } | undefined;
        try {
            const value = await validateAppleReceipt('receipt-blob');
            settled = { ok: true, value };
        } catch (err) {
            settled = { ok: false, err: err as Error };
        }

        // The validator does NOT return a valid result on timeout. It rejects,
        // which the route's catch translates into errorCode 'server_error'
        // (valid:false) — the tier is never granted.
        expect(settled.ok).toBe(false);
        expect(settled.err).toBeInstanceOf(Error);
        expect(settled.err!.message).toMatch(/timeout/i);
        // Crucially, no ValidationResult with a tier was ever produced.
        expect(settled.value).toBeUndefined();
    });

    it('surfaces a generic (non-tier-granting) result through the route-style catch on timeout', async () => {
        mockTimingOutFetch();

        // Mirror the route handler's try/catch around validateAppleReceipt
        // (services/subscription-service/src/routes.ts) to prove the wired-up
        // behaviour: a timeout becomes a valid:false, no-tier response.
        let routeResult: { valid: boolean; tier?: string; errorCode?: string };
        try {
            const r = await validateAppleReceipt('receipt-blob');
            routeResult = { valid: r.valid, tier: r.tier, errorCode: r.errorCode };
        } catch {
            routeResult = { valid: false, errorCode: 'server_error' };
        }

        expect(routeResult.valid).toBe(false);
        expect(routeResult.tier).toBeUndefined();
        expect(routeResult.errorCode).toBe('server_error');
    });
});
