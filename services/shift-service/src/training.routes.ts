import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PrismaClient } from './generated/prisma';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

// userId is NEVER accepted from the client — it is injected from the verified
// JWT in each handler (mirrors routes.ts / schemas.ts). Body bounds are kept
// tight so an absurd title/notes payload can't reach the DB.
const createScheduledSessionSchema = z.object({
    title: z.string().min(1).max(200),
    scheduledAt: z.string().datetime(),
    notes: z.string().max(2000).optional(),
    // OPTIONAL link to one of the caller's OWN shifts. A malformed (non-uuid)
    // value is rejected by Zod as a 4xx before any DB work; a well-formed uuid
    // is still ownership-checked in the handler before it is persisted.
    shiftId: z.string().uuid().optional(),
});

// Optional ISO-datetime window. When both are present a from<=to invariant is
// enforced; a single bound (or none) still passes so the list can be filtered
// loosely or fetched whole.
const getScheduledSessionsQuerySchema = z
    .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
    })
    .refine(
        (q) => q.from === undefined || q.to === undefined || new Date(q.to) >= new Date(q.from),
        { message: 'to must be on or after from', path: ['to'] }
    );

// ---------------------------------------------------------------------------
// Missing-table / missing-column detection
// ---------------------------------------------------------------------------

/**
 * True when `err` indicates the `scheduled_sessions` schema is not yet fully
 * deployed — either the TABLE itself or the optional `shift_id` COLUMN is
 * still missing. Both stem from USER-GATED migrations that are un-run files
 * until a human deploys them against the VPS:
 *
 *   - 20260617000000_scheduled_sessions creates the base TABLE. Until it runs,
 *     a query surfaces Prisma `P2021` ("The table does not exist in the current
 *     database."), or — un-wrapped — the raw Postgres
 *     'relation "scheduled_sessions" does not exist' message.
 *
 *   - 20260618000000_scheduled_session_shift_link adds the optional `shift_id`
 *     COLUMN *separately*. So once the base table is deployed (20260617) but
 *     the column is not (20260618), a create that sets `data.shiftId` surfaces
 *     Prisma `P2022` ("The column ... does not exist in the current database."),
 *     or — un-wrapped — a raw 'column ... does not exist' message. Without
 *     matching P2022 here that write-time error would fall through to the
 *     generic redacted 500 instead of the honest degradation path.
 *
 * We match the coded forms (P2021 / P2022) AND the raw message forms so the
 * same degradation holds whether the error arrives wrapped by Prisma or
 * un-wrapped (e.g. via $queryRaw or a unit test that simulates the condition
 * without a real Prisma client).
 *
 * On a match the GET degrades to 200 [] and the POST to a body-less 503 so dev
 * keeps working pre-migration; everything else is a genuine fault and must
 * surface as the redacted 500. No raw column/table name or Prisma text ever
 * reaches the client — the 200 []/503 bodies are already redacted.
 */
function isMissingTableError(err: any): boolean {
    if (!err) return false;
    // P2021 = missing TABLE; P2022 = missing COLUMN (the un-run shift_id link).
    if (err.code === 'P2021' || err.code === 'P2022') return true;
    const message = typeof err.message === 'string' ? err.message : '';
    return /relation "scheduled_sessions" does not exist/i.test(message)
        || /table.*scheduled_sessions.*does not exist/i.test(message)
        || /column .*does not exist/i.test(message);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Scheduled-sessions routes for the mobile Training Calendar. Mounted by
 * index.ts at the `/v1/training` prefix as a SIBLING of `/v1/shifts`. The
 * existing shift PrismaClient is reused (passed via opts.prisma) — strictly
 * additive, no second client.
 */
export const trainingRoutes = async (
    fastify: FastifyInstance,
    opts: { prisma: PrismaClient }
) => {
    const prisma = opts.prisma;

    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/scheduled-sessions',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                querystring: getScheduledSessionsQuerySchema,
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore — userId is injected by the JWT verify decorator.
                const userId = request.user.userId;
                const { from, to } = request.query as z.infer<typeof getScheduledSessionsQuerySchema>;

                const scheduledAt =
                    from || to
                        ? {
                              ...(from ? { gte: new Date(from) } : {}),
                              ...(to ? { lte: new Date(to) } : {}),
                          }
                        : undefined;

                const sessions = await prisma.scheduledSession.findMany({
                    where: { userId, ...(scheduledAt ? { scheduledAt } : {}) },
                    orderBy: { scheduledAt: 'asc' },
                });

                reply.send(sessions);
            } catch (err: any) {
                // Graceful degradation: the user-gated migrations may not have
                // run yet. A missing TABLE *or* missing COLUMN error is EXPECTED
                // in that window, so the GET answers 200 [] (and logs at info)
                // rather than 500 — the calendar then shows its honest empty
                // state. Any other error is a real fault: log it server-side and
                // return the generic redacted body (raw err.message must not
                // reach the client).
                if (isMissingTableError(err)) {
                    request.log.info(
                        'scheduled_sessions table/column absent (migration un-run); returning []'
                    );
                    return reply.send([]);
                }
                request.log.error(err);
                reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/scheduled-sessions',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: createScheduledSessionSchema,
            },
        },
        async (request, reply) => {
            try {
                // @ts-ignore — userId is injected by the JWT verify decorator.
                const userId = request.user.userId;
                const body = request.body as z.infer<typeof createScheduledSessionSchema>;

                // Optional shift link: only a shift the CALLER owns may be
                // linked. We look it up scoped to the verified JWT userId; a
                // null result means the id is unknown OR belongs to another
                // user, and in both cases we refuse with a generic 4xx (no raw
                // detail — the redaction contract holds) rather than silently
                // dropping or, worse, linking a foreign shift.
                if (body.shiftId) {
                    const shift = await prisma.shift.findFirst({
                        where: { id: body.shiftId, userId },
                    });
                    if (!shift) {
                        return reply.code(400).send({ error: 'Invalid shift' });
                    }
                }

                const session = await prisma.scheduledSession.create({
                    data: {
                        userId,
                        title: body.title,
                        scheduledAt: new Date(body.scheduledAt),
                        notes: body.notes,
                        ...(body.shiftId ? { shiftId: body.shiftId } : {}),
                    },
                });

                reply.code(201).send(session);
            } catch (err: any) {
                // Same migration window as the GET, but a write cannot be
                // satisfied with an empty list — surface a clear, body-less 503
                // so the client knows scheduling is not yet available rather
                // than treating it as a hard server fault. This also covers the
                // missing shift_id COLUMN (Prisma P2022): when the base table is
                // deployed but the un-run 20260618 link migration is not, a
                // create that sets data.shiftId would otherwise fall through to
                // the generic redacted 500.
                if (isMissingTableError(err)) {
                    request.log.info(
                        'scheduled_sessions table/column absent (migration un-run); POST unavailable'
                    );
                    return reply.code(503).send({ error: 'Scheduled sessions are not yet available' });
                }
                // Redaction: the body is already Zod-validated upstream, so any
                // error here is a Prisma/DB fault — logged server-side, generic
                // body to the client.
                request.log.error(err);
                reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );
};
