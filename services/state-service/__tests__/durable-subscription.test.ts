/**
 * state-service event WIRING suite — proves every read-model handler is bound to
 * the DURABLE stream consumer (subscribeDurable), NOT Redis Pub/Sub (subscribe).
 *
 * Pub/Sub is at-most-once: any event published while state-service is down or
 * reconnecting is LOST and never replayed, permanently corrupting the digital
 * twin. subscribeDurable joins a consumer group ('state-service') over the
 * bus's durable Redis Stream, so a restart backfills every entry unread by the
 * group. This suite asserts:
 *
 *   1. setupEventSubscribers registers ALL FIVE streams (meal, sleep, metrics,
 *      plan, cycle) via subscribeDurable, each under group 'state-service', and
 *      registers NOTHING via subscribe (no at-most-once consumer remains).
 *   2. Each registered durable handler dispatches to the matching materializer
 *      method (and skips it on a malformed payload — the validation guard is
 *      preserved through the switch).
 *
 * Driven with an in-memory EventBus that records subscribeDurable options and
 * lets us emit one event per stream — same style as notification-service's
 * chat-message-sent.test.ts. No Redis / DB is touched.
 */
import type { EventBus, StreamSubscribeOptions } from '@nightfuel/events';
import { Channels, type NightFuelEvent } from '@nightfuel/types';
import { setupEventSubscribers } from '../src/events';
import type { StateMaterializer } from '../src/materializer';

function makeInMemoryBus() {
    const durable = new Map<string, StreamSubscribeOptions<any>>();
    const subscribeCalls: string[] = [];

    const bus: EventBus = {
        publish: jest.fn(async () => {}),
        subscribe: jest.fn((channel: string) => {
            subscribeCalls.push(channel);
        }),
        subscribeDurable: <T>(options: StreamSubscribeOptions<T>) => {
            durable.set(options.stream, options as StreamSubscribeOptions<any>);
        },
        disconnect: jest.fn(async () => {}),
    };

    const emit = async (stream: string, event: NightFuelEvent<any>) => {
        const opts = durable.get(stream);
        if (!opts) throw new Error(`no durable subscriber registered for "${stream}"`);
        await opts.handler(event);
    };

    return { bus, durable, subscribeCalls, emit };
}

function makeMaterializer() {
    return {
        handleMealLogged: jest.fn(async () => {}),
        handleSleepLogged: jest.fn(async () => {}),
        handleMetricsLogged: jest.fn(async () => {}),
        handlePlanGenerated: jest.fn(async () => {}),
        handleCycleAdvanced: jest.fn(async () => {}),
    } as unknown as jest.Mocked<StateMaterializer>;
}

function evt(payload: any): NightFuelEvent<any> {
    return {
        eventId: 'evt-1',
        eventType: 'x',
        producedAt: new Date().toISOString(),
        producerService: 'test',
        correlationId: 'c1',
        userId: 'user-1',
        payload,
    };
}

const ALL_STREAMS = [
    Channels.Meal.MealLogged,
    Channels.Sleep.SessionLogged,
    Channels.Progress.MetricsLogged,
    Channels.Plan.PlanGenerated,
    Channels.Progress.CycleAdvanced,
];

describe('state-service — durable (consumer-group) wiring', () => {
    it('registers every read-model stream via subscribeDurable under group "state-service"', async () => {
        const { bus, durable } = makeInMemoryBus();
        await setupEventSubscribers(bus, makeMaterializer());

        for (const stream of ALL_STREAMS) {
            const opts = durable.get(stream);
            expect(opts).toBeDefined();
            expect(opts!.group).toBe('state-service');
        }
        expect(durable.size).toBe(ALL_STREAMS.length);
    });

    it('registers NOTHING via at-most-once subscribe (no Pub/Sub consumer remains)', async () => {
        const { bus, subscribeCalls } = makeInMemoryBus();
        await setupEventSubscribers(bus, makeMaterializer());

        expect(subscribeCalls).toHaveLength(0);
        expect(bus.subscribe).not.toHaveBeenCalled();
    });

    it('durable handlers dispatch valid events to the matching materializer method', async () => {
        const { bus, emit } = makeInMemoryBus();
        const mat = makeMaterializer();
        await setupEventSubscribers(bus, mat);

        await emit(Channels.Meal.MealLogged, evt({ mealLogId: 'm1', isAdherent: true }));
        await emit(Channels.Sleep.SessionLogged, evt({ sleepSessionId: 's1', quality: 5, disturbances: 2 }));
        await emit(Channels.Progress.MetricsLogged, evt({ weightKg: 80 }));
        await emit(Channels.Plan.PlanGenerated, evt({ calorieTarget: 2000, proteinTargetG: 150 }));
        await emit(Channels.Progress.CycleAdvanced, evt({ trainingPhase: 'hypertrophy', newCycleWeek: 3 }));

        expect(mat.handleMealLogged).toHaveBeenCalledTimes(1);
        expect(mat.handleSleepLogged).toHaveBeenCalledTimes(1);
        expect(mat.handleMetricsLogged).toHaveBeenCalledTimes(1);
        expect(mat.handlePlanGenerated).toHaveBeenCalledTimes(1);
        expect(mat.handleCycleAdvanced).toHaveBeenCalledTimes(1);
    });

    it('the validation guard survives the switch: a malformed payload SKIPS the materializer', async () => {
        const { bus, emit } = makeInMemoryBus();
        const mat = makeMaterializer();
        await setupEventSubscribers(bus, mat);

        // planGenerated requires numeric calorieTarget/proteinTargetG; omit them.
        await emit(Channels.Plan.PlanGenerated, evt({ calorieTarget: 'oops' }));

        expect(mat.handlePlanGenerated).not.toHaveBeenCalled();
    });
});
