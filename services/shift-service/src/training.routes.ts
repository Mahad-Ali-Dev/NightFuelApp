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
// Missing-table detection
// ---------------------------------------------------------------------------

/**
 * True when `err` indicates the `scheduled_sessions` table does not yet exist.
 *
 * The 20260617000000_scheduled_sessions migration is USER-GATED — it is an
 * un-run file until a human deploys it against the VPS. Until then a query
 * against the table surfaces Prisma error code `P2021` ("The table does not
 * exist in the current database."). We also match the raw Postgres
 * 'relation "scheduled_sessions" does not exist' message so the same
 * degradation path holds if the error arrives un-wrapped (e.g. via $queryRaw
 * or in a unit test that simulates the condition without a real Prisma client).
 *
 * On a match the GET degrades to 200 [] so dev keeps working pre-migration;
 * everything else is a genuine fault and must surface as the redacted 500.
 */
function isMissingTableError(err: any): boolean {
    if (!err) return false;
    if (err.code === 'P2021') return true;
    const message = typeof err.message === 'string' ? err.message : '';
    return /relation "scheduled_sessions" does not exist/i.test(message)
        || /table.*scheduled_sessions.*does not exist/i.test(message);
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
                // Graceful degradation: the user-gated migration may not have
                // run yet. A missing-table error is EXPECTED in that window, so
                // the GET answers 200 [] (and logs at info) rather than 500 —
                // the calendar then shows its honest empty state. Any other
                // error is a real fault: log it server-side and return the
                // generic redacted body (raw err.message must not reach the client).
                if (isMissingTableError(err)) {
                    request.log.info(
                        'scheduled_sessions table absent (migration un-run); returning []'
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

                const session = await prisma.scheduledSession.create({
                    data: {
                        userId,
                        title: body.title,
                        scheduledAt: new Date(body.scheduledAt),
                        notes: body.notes,
                    },
                });

                reply.code(201).send(session);
            } catch (err: any) {
                // Same migration window as the GET, but a write cannot be
                // satisfied with an empty list — surface a clear, body-less 503
                // so the client knows scheduling is not yet available rather
                // than treating it as a hard server fault.
                if (isMissingTableError(err)) {
                    request.log.info(
                        'scheduled_sessions table absent (migration un-run); POST unavailable'
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
