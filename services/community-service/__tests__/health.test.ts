import Fastify, { FastifyInstance } from 'fastify';

/**
 * Placeholder smoke test proving the babel-jest harness runs *.ts suites with a
 * real fastify.inject() and no DB/network. It mirrors the `/health` route from
 * src/index.ts rather than importing the bootstrap module (which opens a DB
 * connection and binds a port on import). Items 2/3 add the real suites
 * alongside this file in the same __tests__ dir.
 */
function buildApp(): FastifyInstance {
    const app = Fastify({ logger: false });
    app.get('/health', async () => {
        return { status: 'ok', service: 'community-service' };
    });
    return app;
}

describe('community-service health', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it('GET /health returns ok status', async () => {
        const res = await app.inject({ method: 'GET', url: '/health' });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ status: 'ok', service: 'community-service' });
    });
});
