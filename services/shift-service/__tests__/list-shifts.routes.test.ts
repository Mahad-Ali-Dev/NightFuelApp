/**
 * P0 SECURITY — ROUTE-level proof of the date-range bound on shift-service
 * `GET /v1/shifts/` (src/routes.ts).
 *
 * WHY THIS FILE EXISTS (the S16 review point):
 *   The companion unit suite (schemas.test.ts) exercises
 *   `getShiftsQuerySchemaBounded` DIRECTLY via safeParse. That is necessary but
 *   NOT sufficient: a green schema unit test gives FALSE confidence while the
 *   ROUTE stays wired to the UNBOUNDED `getShiftsQuerySchema`. A reversed or
 *   multi-decade `start..end` would then sail past the querystring validator
 *   into `ShiftService.getShifts` → an unbounded `findMany` DB scan and the
 *   downstream circadian aggregation.
 *
 *   This suite closes that gap by asserting the bound on the WIRED route, not
 *   the schema in isolation. It is the test that catches the no-op: it FAILS if
 *   `routes.ts` is reverted to `getShiftsQuerySchema.omit({ userId: true })`
 *   (the unbounded schema), because the two 400 cases below only return 400
 *   when the route's querystring schema actually enforces the range guards.
 *
 * HOW IT IS WIRED:
 *   A fresh Fastify instance is built exactly like src/index.ts (minus the real
 *   DB/Redis): the fastify-type-provider-zod compilers are installed so the
 *   route's `withTypeProvider<ZodTypeProvider>()` querystring schema actually
 *   validates, and the genuine `shiftRoutes` plugin is registered at the
 *   production `/v1/shifts` prefix (see src/index.ts). Auth is stubbed directly
 *   — the `authenticate` decorator is an async no-op that sets
 *   `request.user = { userId }` — so the suite stays disjoint from the JWT gate
 *   (covered elsewhere) and focuses solely on the range bound. The ShiftService
 *   is fully stubbed; `getShifts` resolves `[]` so we can both reach the 200
 *   path AND assert the handler ran exactly once on a valid range (and never on
 *   a rejected one).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { shiftRoutes } from '../src/routes';

// The verified-JWT identity the stubbed `authenticate` decorator injects. The
// range bound is identity-agnostic, but we set a realistic uuid so the handler
// passes it through to the stubbed service unchanged.
const USER_ID = '11111111-1111-1111-1111-111111111111';

// Production mount prefix for shiftRoutes — must match src/index.ts
// (`fastify.register(..., { prefix: '/v1/shifts' })`). The schema-direct suite
// can't catch a prefix/wiring regression; this one injects at the real path.
const SHIFTS_PREFIX = '/v1/shifts';

// A fully-stubbed ShiftService. Only `getShifts` is exercised here; the rest
// are present so the plugin's other route registrations have a method to bind
// to. `getShifts` resolves [] so the 200 path returns a valid (empty) list and
// we can assert it was invoked exactly once on a valid range — and NEVER on a
// range the bound rejects (those 400s short-circuit in the validator, before
// the handler).
type StubShiftService = {
    getShifts: ReturnType<typeof jest.fn>;
    createShift: ReturnType<typeof jest.fn>;
    getCurrentShift: ReturnType<typeof jest.fn>;
    getShiftById: ReturnType<typeof jest.fn>;
    updateShift: ReturnType<typeof jest.fn>;
    deleteShift: ReturnType<typeof jest.fn>;
};

function makeStubService(): StubShiftService {
    return {
        getShifts: jest.fn(() => Promise.resolve([])),
        createShift: jest.fn(),
        getCurrentShift: jest.fn(),
        getShiftById: jest.fn(),
        updateShift: jest.fn(),
        deleteShift: jest.fn(),
    };
}

/**
 * Build a fresh app wired exactly like src/index.ts (minus the real DB): the
 * Zod validator/serializer compilers (required for the route's typed
 * querystring schema to validate at all), an `authenticate` decorator stubbed
 * as an async no-op that injects the verified identity, and the genuine
 * `shiftRoutes` plugin mounted at the production `/v1/shifts` prefix.
 */
async function buildApp(service: StubShiftService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    // Stub the auth gate directly — no JWT needed. The route references
    // (fastify as any).authenticate via `onRequest`, so it must exist as a
    // decorator. Setting request.user mirrors the contract the real decorator
    // satisfies after jwtVerify().
    app.decorate('authenticate', async (request: any) => {
        request.user = { userId: USER_ID };
    });
    await app.register(
        async (instance) => {
            await shiftRoutes(instance, { shiftService: service as any });
        },
        { prefix: SHIFTS_PREFIX }
    );
    await app.ready();
    return app;
}

describe('shift-service GET /v1/shifts — date-range bound (route-level)', () => {
    let app: FastifyInstance;
    let service: StubShiftService;

    beforeEach(async () => {
        service = makeStubService();
        app = await buildApp(service);
    });

    afterEach(async () => {
        await app.close();
    });

    // (a) Reversed range: end strictly before start. The wired bound rejects
    // this with a 400 in the querystring validator — the handler (and thus the
    // DB) is never reached. FAILS (200) if the route uses the unbounded schema.
    it('rejects a reversed range (end before start) with 400 and never queries the DB', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `${SHIFTS_PREFIX}/?start=2026-06-30&end=2026-06-01`,
        });

        expect(res.statusCode).toBe(400);
        // The reversed range must be stopped at the boundary, never reaching the
        // service / an unbounded findMany.
        expect(service.getShifts).not.toHaveBeenCalled();
    });

    // (b) Absurd multi-decade range (~30 years, far over the 366-day cap). The
    // wired bound rejects this with a 400 before any DB work. This is the case
    // that would otherwise force an unbounded scan / heavy circadian
    // aggregation. FAILS (200) if the route reverts to the unbounded schema.
    it('rejects an absurd multi-decade range (> 366 days) with 400 and never queries the DB', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `${SHIFTS_PREFIX}/?start=2000-01-01&end=2030-01-01`,
        });

        expect(res.statusCode).toBe(400);
        expect(service.getShifts).not.toHaveBeenCalled();
    });

    // (c) A normal in-bounds one-month range passes validation, reaches the
    // handler, and the service is invoked exactly once. This proves the bound
    // does NOT over-reject valid traffic — and that the 400s above are the bound
    // firing, not a blanket rejection of every querystring.
    it('accepts a valid one-month range with 200 and queries the DB exactly once', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `${SHIFTS_PREFIX}/?start=2026-06-01&end=2026-06-30`,
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual([]);
        expect(service.getShifts).toHaveBeenCalledTimes(1);
    });
});
