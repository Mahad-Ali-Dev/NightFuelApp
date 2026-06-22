import cluster from 'cluster';
import os from 'os';
import { Logger } from 'pino';

export interface BootstrapOptions {
    logger: Logger;
    serviceName: string;
    port: number;
    startServer: () => Promise<void>;
}

export function bootstrapCluster(options: BootstrapOptions) {
    const { logger, serviceName, startServer } = options;

    // Check if clustering is enabled via env or if we're in production
    const isClusteringEnabled = process.env.NODE_ENV === 'production' || process.env.ENABLE_CLUSTER === 'true';
    const numCPUs = parseInt(process.env.WEB_CONCURRENCY || '0') || os.cpus().length;

    if (isClusteringEnabled && cluster.isPrimary) {
        logger.info({ serviceName, numCPUs }, `Primary process ${process.pid} is starting cluster`);

        // MEDIUM #11: during graceful shutdown we tell workers to die; without
        // this flag the 'exit' handler below would immediately re-fork them, so
        // the cluster never drains and shutdown hangs (zombie workers). Once a
        // shutdown signal arrives we stop forking and let workers exit.
        let shuttingDown = false;

        // Fork workers
        for (let i = 0; i < numCPUs; i++) {
            cluster.fork();
        }

        cluster.on('exit', (worker, code, signal) => {
            // While running, an unexpected worker death should be replaced
            // (crash-restart). During shutdown, do NOT re-fork.
            if (shuttingDown) {
                logger.info({ pid: worker.process.pid, code, signal }, 'Worker exited during shutdown');
                return;
            }
            logger.warn({ pid: worker.process.pid, code, signal }, 'Worker process died. Forking replacement...');
            cluster.fork();
        });

        const onShutdownSignal = (signal: NodeJS.Signals) => {
            if (shuttingDown) return;
            shuttingDown = true;
            logger.info({ serviceName, signal }, 'Primary received shutdown signal — stopping cluster');
            // Stop accepting new forks and ask each worker to exit. Workers run
            // their own SIGTERM/SIGINT handlers (graceful HTTP close); the
            // 'exit' handler above no longer re-forks them.
            for (const worker of Object.values(cluster.workers ?? {})) {
                worker?.kill(signal);
            }
        };
        process.on('SIGTERM', () => onShutdownSignal('SIGTERM'));
        process.on('SIGINT', () => onShutdownSignal('SIGINT'));
    } else {
        // Simple start (either worker or non-clustered)
        startServer().catch(err => {
            logger.error(err, `Failed to start ${serviceName}`);
            process.exit(1);
        });
    }
}

// ─── DB Connection with Retry ─────────────────────────────────────────────────

export interface PrismaLike {
    $connect(): Promise<void>;
}

/**
 * Attempts to connect to the database with exponential back-off.
 * Use this in every service's `start()` instead of bare `prisma.$connect()`.
 */
export async function connectWithRetry(
    prisma: PrismaLike,
    logger: Logger,
    maxRetries = 8,
    initialDelayMs = 4000,
): Promise<void> {
    let delayMs = initialDelayMs;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await prisma.$connect();
            return;
        } catch (err: any) {
            if (attempt === maxRetries) throw err;
            logger.warn(
                `DB connection attempt ${attempt}/${maxRetries} failed — retrying in ${delayMs / 1000}s... (${err.message})`,
            );
            await new Promise(r => setTimeout(r, delayMs));
            delayMs = Math.min(Math.round(delayMs * 1.5), 30_000);
        }
    }
}

// ─── Global Process Error Handlers ───────────────────────────────────────────

/**
 * Registers `uncaughtException` and `unhandledRejection` handlers on `process`.
 * Call this once at the top of every service's `index.ts`.
 * Without these, Node.js will crash silently on any unhandled async error.
 */
export function registerGlobalProcessHandlers(logger: Logger): void {
    process.on('uncaughtException', (err) => {
        logger.error({ err }, 'Uncaught exception — shutting down');
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        logger.error({ reason }, 'Unhandled promise rejection — shutting down');
        process.exit(1);
    });
}

// ─── Fastify Global Error Handler ────────────────────────────────────────────

export interface FastifyLike {
    setErrorHandler(handler: (error: any, request: any, reply: any) => void): void;
}

/** Shape returned by {@link buildErrorResponse}: the HTTP status to set and the redacted JSON body to send. */
export interface ErrorResponse {
    statusCode: number;
    body: {
        error: string;
        message: string;
        statusCode: number;
    };
}

/**
 * Pure, side-effect-free redaction decision for a thrown request error.
 *
 * Returns the HTTP status code and the JSON body the global error handler
 * should emit — without touching Fastify, the logger, or any I/O. This makes
 * the redaction contract directly unit-testable (import it and assert against
 * the real branching) and keeps {@link registerFastifyErrorHandler} a thin
 * wrapper around it.
 *
 * Information-disclosure hardening: never echo raw error text (DB/Prisma
 * internals, stack hints) in a 5xx body. The real error is logged by the
 * caller. For 4xx we keep the specific message ONLY for genuine validation
 * errors (Fastify sets `error.validation`), whose messages are safe,
 * user-facing schema copy. A non-validation 4xx (e.g. a thrown
 * 'connect ECONNREFUSED 127.0.0.1:5432' or a Prisma 'not found' surfaced
 * with statusCode 400) would otherwise leak internals verbatim, so it
 * gets the same generic redaction treatment.
 */
export function buildErrorResponse(error: any): ErrorResponse {
    const statusCode: number = error.statusCode ?? 500;
    if (statusCode >= 500) {
        return {
            statusCode,
            body: {
                error: 'InternalServerError',
                message: 'An unexpected error occurred',
                statusCode,
            },
        };
    }
    if (error.validation) {
        return {
            statusCode,
            body: {
                error: error.name ?? 'InternalServerError',
                message: error.message ?? 'An unexpected error occurred',
                statusCode,
            },
        };
    }
    return {
        statusCode,
        body: {
            error: error.name ?? 'BadRequest',
            message: 'Bad request',
            statusCode,
        },
    };
}

/**
 * Registers a Fastify global error handler that returns structured JSON errors
 * instead of crashing or returning empty 500 responses.
 * Call this once after creating the Fastify instance.
 */
export function registerFastifyErrorHandler(fastify: FastifyLike, logger: Logger): void {
    fastify.setErrorHandler((error: any, request: any, reply: any) => {
        logger.error(
            { err: error, url: request.url, method: request.method },
            'Unhandled request error',
        );
        const res = buildErrorResponse(error);
        reply.code(res.statusCode).send(res.body);
    });
}
