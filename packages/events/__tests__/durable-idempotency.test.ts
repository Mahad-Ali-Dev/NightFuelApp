/**
 * RedisEventBus.subscribeDurable — at-least-once REDELIVERY IDEMPOTENCY suite.
 *
 * subscribeDurable is at-least-once: a stream entry is XACKed only after its
 * handler resolves, so a handler throw — or a restart with an unacked entry in
 * the consumer group's PEL — REDELIVERS the same logical event (same
 * NightFuelEvent.eventId). Without a guard, additive consumers double-count
 * (progress-service macro accumulation) and stepwise consumers double-apply
 * (state-service fatigue ±1 / adherence window).
 *
 * The fix lives centrally in the bus: a per-(group,eventId) Redis
 * processed-marker (nf:processed:<group>:<eventId>) checked BEFORE dispatch and
 * SET only AFTER the handler succeeds, then XACK. This suite locks:
 *
 *   1. A duplicate stream entry carrying an already-seen eventId runs the
 *      handler EXACTLY ONCE (the macro accumulator is not double-counted), and
 *      the redelivery is still XACKed (drained from the PEL).
 *   2. The marker-AFTER-success / XACK ordering: on success we SET the marker
 *      BEFORE XACK; on a marker hit we XACK WITHOUT running the handler.
 *   3. A FAILED handler sets NO marker and issues NO XACK, so the entry stays in
 *      the PEL and is redelivered/retried — and the retry then succeeds.
 *
 * Strategy: mock `ioredis` with an in-memory fake (string KV with EX/EXISTS +
 * an xreadgroup queue + XACK recorder). We let the real subscribeDurable polling
 * loop pull each queued delivery, then disconnect to stop the loop. No real
 * Redis is touched.
 */

const xackCalls: Array<{ stream: string; group: string; id: string }> = [];
const setCalls: Array<{ key: string }> = [];

/**
 * Shared in-memory Redis double. The bus constructs several Redis instances
 * (publisher + one reader per durable subscription); they must share the SAME
 * key space and the SAME pending-delivery queue, so every `new Redis()` returns
 * this one object.
 */
function makeFakeRedis() {
    const kv = new Map<string, string>();
    // Each queued delivery is a full xreadgroup reply: [[stream, [[id, [field, value]]]]]
    const deliveries: any[] = [];

    return {
        kv,
        deliveries,
        // ── KV (processed-marker) ────────────────────────────────────────────
        async exists(key: string) {
            return kv.has(key) ? 1 : 0;
        },
        async set(key: string, value: string, ..._rest: any[]) {
            setCalls.push({ key });
            kv.set(key, value);
            return 'OK';
        },
        // ── Streams ──────────────────────────────────────────────────────────
        async xgroup() {
            return 'OK';
        },
        async xreadgroup(..._args: any[]) {
            // Hand back one queued delivery per poll. When drained, mimic Redis's
            // BLOCK by awaiting a real macrotask timer and returning null — this
            // yields the event loop so drain()'s setTimeout(0) turns can run and
            // disconnect() can flip the loop's active flag (otherwise a tight
            // microtask spin starves the macrotask queue and nothing exits).
            if (deliveries.length === 0) {
                await new Promise((r) => setTimeout(r, 5));
                return null;
            }
            return deliveries.shift();
        },
        async xack(stream: string, group: string, id: string) {
            xackCalls.push({ stream, group, id });
            return 1;
        },
        async quit() {
            return 'OK';
        },
        on() {
            /* no-op error listener */
        },
    };
}

// Holder the ioredis mock reads from. Must be `mock`-prefixed so jest allows the
// factory below to reference it (jest hoists jest.mock above the imports).
const mockRedisHolder: { current: ReturnType<typeof makeFakeRedis> | null } = { current: null };

jest.mock('ioredis', () => ({
    __esModule: true,
    default: jest.fn(() => mockRedisHolder.current),
}));

import { RedisEventBus } from '../src/redis-event-bus';

const STREAM = 'nightfuel:meal:meal-logged';
const GROUP = 'progress-service';

/** Build an xreadgroup-shaped reply for a single event entry. */
function delivery(id: string, eventId: string, payload: any) {
    const eventStr = JSON.stringify({ eventId, userId: 'u1', payload });
    return [[STREAM, [[id, ['event', eventStr]]]]];
}

/** Spin the bus until the delivery queue drains (the loop has consumed all). */
async function drain(bus: RedisEventBus) {
    // The polling loop awaits microtasks between xreadgroup calls; a handful of
    // event-loop turns is enough to consume the small queues used here.
    for (let i = 0; i < 50 && fake.deliveries.length > 0; i++) {
        await new Promise((r) => setTimeout(r, 0));
    }
    // One more turn so the final entry's handler+marker+ack settle.
    await new Promise((r) => setTimeout(r, 0));
    await bus.disconnect();
}

let fake: ReturnType<typeof makeFakeRedis>;

beforeEach(() => {
    fake = makeFakeRedis();
    mockRedisHolder.current = fake;
    xackCalls.length = 0;
    setCalls.length = 0;
});

describe('subscribeDurable — redelivery idempotency (processed-marker)', () => {
    it('runs the handler ONCE for a redelivered eventId (macros not double-counted) and still XACKs the dup', async () => {
        const bus = new RedisEventBus('redis://fake');

        // Additive accumulator standing in for progress-service macro folding.
        let totalCalories = 0;
        const seenEventIds: string[] = [];

        bus.subscribeDurable<{ calories: number }>({
            stream: STREAM,
            group: GROUP,
            handler: async (event) => {
                seenEventIds.push(event.eventId);
                totalCalories += event.payload.calories;
            },
        });

        // Same logical event delivered TWICE (e.g. handler succeeded but the
        // XACK was lost to a crash, so the PEL redelivered it under a new id).
        fake.deliveries.push(delivery('1-0', 'evt-A', { calories: 500 }));
        fake.deliveries.push(delivery('1-1', 'evt-A', { calories: 500 }));

        await drain(bus);

        // Handler ran exactly once → macros counted once.
        expect(seenEventIds).toEqual(['evt-A']);
        expect(totalCalories).toBe(500);

        // Marker written exactly once, for (group, eventId).
        expect(setCalls).toEqual([{ key: 'nf:processed:progress-service:evt-A' }]);

        // BOTH deliveries were XACKed (the dup is drained from the PEL too).
        expect(xackCalls.map((c) => c.id)).toEqual(['1-0', '1-1']);
    });

    it('on first success SETs the marker BEFORE XACK (crash-safe ordering)', async () => {
        const bus = new RedisEventBus('redis://fake');
        const order: string[] = [];

        // Record the global order of marker-set vs xack by wrapping the fakes.
        const realSet = fake.set.bind(fake);
        const realXack = fake.xack.bind(fake);
        fake.set = async (...args: any[]) => {
            order.push('set');
            return (realSet as any)(...args);
        };
        fake.xack = async (...args: any[]) => {
            order.push('xack');
            return (realXack as any)(...args);
        };

        bus.subscribeDurable({
            stream: STREAM,
            group: GROUP,
            handler: async () => {
                order.push('handler');
            },
        });

        fake.deliveries.push(delivery('2-0', 'evt-B', { calories: 1 }));
        await drain(bus);

        // handler resolves → marker set → ack. Never ack-before-marker.
        expect(order).toEqual(['handler', 'set', 'xack']);
    });

    it('skips the handler when the marker already exists, and still XACKs', async () => {
        const bus = new RedisEventBus('redis://fake');

        // Pre-seed the marker as if a prior delivery had already processed evt-C.
        fake.kv.set('nf:processed:progress-service:evt-C', '1');

        let handlerRuns = 0;
        bus.subscribeDurable({
            stream: STREAM,
            group: GROUP,
            handler: async () => {
                handlerRuns += 1;
            },
        });

        fake.deliveries.push(delivery('3-0', 'evt-C', { calories: 999 }));
        await drain(bus);

        expect(handlerRuns).toBe(0); // skipped — never re-run
        expect(setCalls).toHaveLength(0); // marker untouched
        expect(xackCalls.map((c) => c.id)).toEqual(['3-0']); // but acked + drained
    });
});

describe('subscribeDurable — failed handler is retried (marker NOT set)', () => {
    it('does NOT set the marker or XACK when the handler throws, then succeeds on redelivery', async () => {
        const bus = new RedisEventBus('redis://fake');

        let attempts = 0;
        bus.subscribeDurable({
            stream: STREAM,
            group: GROUP,
            handler: async () => {
                attempts += 1;
                if (attempts === 1) throw new Error('transient handler failure');
                // second attempt succeeds
            },
        });

        // First delivery (will throw), then the PEL redelivery of the SAME event.
        fake.deliveries.push(delivery('4-0', 'evt-D', { calories: 1 }));
        fake.deliveries.push(delivery('4-1', 'evt-D', { calories: 1 }));

        await drain(bus);

        // Handler attempted twice: the failed run set no marker, so the retry
        // re-ran the handler rather than being skipped.
        expect(attempts).toBe(2);

        // Marker set exactly once — only after the SUCCESSFUL (2nd) attempt.
        expect(setCalls).toEqual([{ key: 'nf:processed:progress-service:evt-D' }]);

        // Only the successful delivery was XACKed; the failed one stayed in the
        // PEL (no ack for id '4-0').
        expect(xackCalls.map((c) => c.id)).toEqual(['4-1']);
    });
});
