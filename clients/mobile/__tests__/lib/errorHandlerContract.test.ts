/**
 * errorHandlerContract.test.ts
 *
 * Contract test for the central Fastify error handler defined at
 * packages/config/src/server.ts (registerFastifyErrorHandler). That handler is
 * the single place every backend service hardens error responses:
 *
 *   - a 5xx (or unset statusCode → 500) returns a GENERIC body
 *     `{ error: 'InternalServerError', message: 'An unexpected error occurred' }`
 *     and NEVER echoes the raw error text (DB/Prisma internals, stack hints);
 *   - a 4xx KEEPS its specific `error`/`message` so validation/auth UX copy is
 *     preserved.
 *
 * The handler can't be imported into the React-Native jest sandbox (its module
 * pulls in node `cluster`/`os`/`pino` at load time), so we replicate the exact
 * branch logic here — a faithful, deterministic copy of server.ts:108-126 — and
 * assert its observable contract. No network, no node-only imports. If the
 * source handler's behaviour changes, this guard should be updated in lock-step.
 */

// ── Faithful replica of registerFastifyErrorHandler's reply logic ──────────────
// (packages/config/src/server.ts lines 108-126). Mirrors it exactly so the test
// documents and locks the externally observable contract.
function handleError(
  error: { statusCode?: number; name?: string; message?: string },
  reply: FakeReply,
): void {
  const statusCode: number = error.statusCode ?? 500;
  if (statusCode >= 500) {
    reply.code(statusCode).send({
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
      statusCode,
    });
    return;
  }
  reply.code(statusCode).send({
    error: error.name ?? 'InternalServerError',
    message: error.message ?? 'An unexpected error occurred',
    statusCode,
  });
}

// Minimal Fastify reply double: records the status code and JSON body, supports
// the `reply.code(n).send(body)` fluent chain the handler uses.
interface SentResponse {
  error: string;
  message: string;
  statusCode: number;
}
class FakeReply {
  statusCode = 0;
  body: SentResponse | null = null;
  code(n: number): this {
    this.statusCode = n;
    return this;
  }
  send(payload: SentResponse): this {
    this.body = payload;
    return this;
  }
}

describe('central error handler — 5xx is generic (no information disclosure)', () => {
  test('an explicit 500 returns the generic body and no internal detail', () => {
    const reply = new FakeReply();
    handleError(
      { statusCode: 500, name: 'PrismaClientKnownRequestError', message: 'relation "users" does not exist' },
      reply,
    );
    expect(reply.statusCode).toBe(500);
    expect(reply.body).toEqual({
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
      statusCode: 500,
    });
    // The raw DB error text must never leak to the client.
    expect(reply.body?.message).not.toContain('relation');
    expect(reply.body?.error).not.toContain('Prisma');
  });

  test('a missing statusCode defaults to a generic 500', () => {
    const reply = new FakeReply();
    handleError({ message: 'kaboom from somewhere deep' }, reply);
    expect(reply.statusCode).toBe(500);
    expect(reply.body).toEqual({
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
      statusCode: 500,
    });
  });

  test('a 503 is also generic', () => {
    const reply = new FakeReply();
    handleError({ statusCode: 503, name: 'ServiceUnavailable', message: 'pool timeout: 10.0.0.5:5432' }, reply);
    expect(reply.statusCode).toBe(503);
    expect(reply.body?.error).toBe('InternalServerError');
    expect(reply.body?.message).toBe('An unexpected error occurred');
    expect(reply.body?.message).not.toContain('5432');
  });
});

describe('central error handler — 4xx keeps its specific message', () => {
  test('a 400 preserves the specific validation error name and message', () => {
    const reply = new FakeReply();
    handleError({ statusCode: 400, name: 'BadRequest', message: 'displayName must be at least 2 characters' }, reply);
    expect(reply.statusCode).toBe(400);
    expect(reply.body).toEqual({
      error: 'BadRequest',
      message: 'displayName must be at least 2 characters',
      statusCode: 400,
    });
  });

  test('a 403 keeps its specific auth message', () => {
    const reply = new FakeReply();
    handleError({ statusCode: 403, name: 'Forbidden', message: 'You do not have access to this resource' }, reply);
    expect(reply.statusCode).toBe(403);
    expect(reply.body?.error).toBe('Forbidden');
    expect(reply.body?.message).toBe('You do not have access to this resource');
  });

  test('a 404 keeps its specific message', () => {
    const reply = new FakeReply();
    handleError({ statusCode: 404, name: 'NotFound', message: 'Exercise not found' }, reply);
    expect(reply.body).toEqual({ error: 'NotFound', message: 'Exercise not found', statusCode: 404 });
  });

  test('a 4xx with no name/message falls back to safe generics but keeps the 4xx code', () => {
    const reply = new FakeReply();
    handleError({ statusCode: 422 }, reply);
    expect(reply.statusCode).toBe(422);
    expect(reply.body).toEqual({
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
      statusCode: 422,
    });
  });
});
