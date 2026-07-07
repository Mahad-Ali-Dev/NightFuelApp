/**
 * Regression suite — subscription-service SANDBOX-RECEIPT lockdown (HIGH #3) in
 * the REAL iap-validator (src/iap-validator.ts), driven through validateAppleReceipt
 * with the global `fetch` mocked.
 *
 * Background (the vulnerability this suite locks shut):
 *   parseAppleResponse ignored resp.environment, and validateAppleReceipt
 *   auto-retried the sandbox verifyReceipt URL on Apple status 21007. So a FREE
 *   sandbox receipt (StoreKit test / TestFlight) submitted to a PRODUCTION server
 *   would validate and upgrade a real account at zero cost.
 *
 *   The fix gates sandbox acceptance on isSandboxAllowed() — driven by
 *   IAP_ALLOW_SANDBOX (default false) and, as a non-prod convenience, NODE_ENV.
 *   In production with the flag off:
 *     • a status-0 response stamped environment:"Sandbox" is REJECTED, and
 *     • the 21007 sandbox-retry is REFUSED (no sandbox URL call at all),
 *   both with errorCode 'apple_environment_mismatch'. When IAP_ALLOW_SANDBOX is
 *   true, sandbox receipts validate again so non-prod testing still works.
 *
 * No app/Fastify here — this is a focused unit test of the validator. We mock the
 * global fetch so no network is touched and the Apple response is fully controlled.
 */

import { validateAppleReceipt, isSandboxAllowed } from '../src/iap-validator';

const APPLE_PROD_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

// A well-formed Apple verifyReceipt success body for a PRO subscription, with a
// configurable environment + status.
function appleBody(opts: { environment: 'Sandbox' | 'Production'; status?: number }) {
    return {
        status: opts.status ?? 0,
        environment: opts.environment,
        latest_receipt_info: [
            {
                product_id: 'com.zeitra.app.pro.monthly',
                transaction_id: '1000000111',
                original_transaction_id: '1000000999888777',
                expires_date_ms: String(Date.now() + 30 * 24 * 3600 * 1000), // 30 days out
            },
        ],
    };
}

// Install a fetch mock that returns `bodyByUrl[url]` as an ok JSON response.
function mockFetch(bodyByUrl: Record<string, unknown>): jest.Mock {
    const fn = jest.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => bodyByUrl[url] ?? bodyByUrl['*'],
    }));
    (global as any).fetch = fn;
    return fn as unknown as jest.Mock;
}

describe('subscription-service IAP sandbox lockdown (HIGH #3)', () => {
    const prevAllow = process.env.IAP_ALLOW_SANDBOX;
    const prevNodeEnv = process.env.NODE_ENV;
    const prevSecret = process.env.APPLE_SHARED_SECRET;

    beforeAll(() => {
        // A shared secret so validateAppleReceipt does not short-circuit on config.
        process.env.APPLE_SHARED_SECRET = 'shared-secret-test-value';
    });

    afterAll(() => {
        if (prevAllow === undefined) delete process.env.IAP_ALLOW_SANDBOX; else process.env.IAP_ALLOW_SANDBOX = prevAllow;
        if (prevNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prevNodeEnv;
        if (prevSecret === undefined) delete process.env.APPLE_SHARED_SECRET; else process.env.APPLE_SHARED_SECRET = prevSecret;
    });

    describe('IAP_ALLOW_SANDBOX is false in production', () => {
        beforeEach(() => {
            process.env.NODE_ENV = 'production';
            process.env.IAP_ALLOW_SANDBOX = 'false';
        });

        it('isSandboxAllowed() is false', () => {
            expect(isSandboxAllowed()).toBe(false);
        });

        it('REJECTS a status-0 receipt stamped environment:"Sandbox" (no tier granted)', async () => {
            mockFetch({ [APPLE_PROD_URL]: appleBody({ environment: 'Sandbox' }) });

            const result = await validateAppleReceipt('sandbox-receipt-blob');

            expect(result.valid).toBe(false);
            expect(result.errorCode).toBe('apple_environment_mismatch');
            expect(result.tier).toBeUndefined();
        });

        it('REFUSES the 21007 sandbox retry — never calls the sandbox URL', async () => {
            const fetchMock = mockFetch({
                [APPLE_PROD_URL]: { status: 21007 }, // "sandbox receipt sent to production"
                [APPLE_SANDBOX_URL]: appleBody({ environment: 'Sandbox' }),
            });

            const result = await validateAppleReceipt('sandbox-receipt-blob');

            expect(result.valid).toBe(false);
            expect(result.errorCode).toBe('apple_environment_mismatch');
            // The lockdown: the sandbox endpoint is never contacted.
            const calledUrls = fetchMock.mock.calls.map((c: any[]) => c[0]);
            expect(calledUrls).toContain(APPLE_PROD_URL);
            expect(calledUrls).not.toContain(APPLE_SANDBOX_URL);
        });

        it('still ACCEPTS a genuine Production receipt', async () => {
            mockFetch({ [APPLE_PROD_URL]: appleBody({ environment: 'Production' }) });

            const result = await validateAppleReceipt('prod-receipt-blob');

            expect(result.valid).toBe(true);
            expect(result.tier).toBe('PRO');
            expect(result.originalTransactionId).toBe('1000000999888777');
        });
    });

    describe('IAP_ALLOW_SANDBOX is true (non-prod testing)', () => {
        beforeEach(() => {
            process.env.NODE_ENV = 'production'; // even in prod, the explicit flag wins
            process.env.IAP_ALLOW_SANDBOX = 'true';
        });

        it('isSandboxAllowed() is true', () => {
            expect(isSandboxAllowed()).toBe(true);
        });

        it('ACCEPTS a Sandbox receipt when the flag is on', async () => {
            mockFetch({ [APPLE_PROD_URL]: appleBody({ environment: 'Sandbox' }) });

            const result = await validateAppleReceipt('sandbox-receipt-blob');

            expect(result.valid).toBe(true);
            expect(result.tier).toBe('PRO');
        });

        it('follows the 21007 retry to the sandbox URL when the flag is on', async () => {
            const fetchMock = mockFetch({
                [APPLE_PROD_URL]: { status: 21007 },
                [APPLE_SANDBOX_URL]: appleBody({ environment: 'Sandbox' }),
            });

            const result = await validateAppleReceipt('sandbox-receipt-blob');

            expect(result.valid).toBe(true);
            const calledUrls = fetchMock.mock.calls.map((c: any[]) => c[0]);
            expect(calledUrls).toContain(APPLE_SANDBOX_URL);
        });
    });
});
