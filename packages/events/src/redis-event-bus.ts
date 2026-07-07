import Redis from 'ioredis';
import { EventBus, StreamSubscribeOptions } from './event-bus';
import { NightFuelEvent } from '@nightfuel/types';
import * as crypto from 'crypto';

export class RedisEventBus implements EventBus {
    // TTL for the per-(group,eventId) processed-marker that makes subscribeDurable
    // idempotent against at-least-once redelivery. 48h comfortably outlives any
    // realistic PEL/redelivery window (a crashed consumer's pending entries are
    // reclaimed and redelivered well within this), while bounding marker growth
    // so the keyspace can't accumulate indefinitely.
    private static readonly PROCESSED_MARKER_TTL_SECONDS = 48 * 60 * 60;

    private publisher: Redis;
    private subscriber: Redis | null = null;
    private handlers: Map<string, Array<(event: NightFuelEvent<any>) => Promise<void>>>;
    private redisUrl: string;
    private streamReaders: Redis[] = [];
    private activeProcessors: Map<string, boolean> = new Map();

    constructor(redisUrl: string) {
        this.redisUrl = redisUrl;
        this.publisher = new Redis(redisUrl, {
            maxRetriesPerRequest: null,
        });

        this.handlers = new Map();

        this.publisher.on('error', (err) => {
            console.error('Redis Publisher Error:', err.message);
        });
    }

    private initSubscriber() {
        if (this.subscriber) return;

        this.subscriber = new Redis(this.redisUrl, {
            maxRetriesPerRequest: null,
        });

        this.subscriber.on('error', (err) => {
            console.error('Redis Subscriber Error:', err.message);
        });

        this.subscriber.on('message', async (channel, message) => {
            const handlers = this.handlers.get(channel);
            if (handlers) {
                try {
                    const event: NightFuelEvent<any> = JSON.parse(message);
                    await Promise.all(handlers.map(handler => handler(event)));
                } catch (error) {
                    console.error(`Error processing event on channel ${channel}:`, error);
                }
            }
        });
    }

    async publish<T>(stream: string, event: NightFuelEvent<T>): Promise<void> {
        const eventStr = JSON.stringify(event);
        // Dual-publish: for both legacy Pub/Sub and durable Streams
        await Promise.all([
            this.publisher.publish(stream, eventStr),
            this.publisher.xadd(stream, '*', 'event', eventStr)
        ]);
    }

    subscribe<T>(channel: string, handler: (event: NightFuelEvent<T>) => Promise<void>): void {
        this.initSubscriber();
        if (!this.handlers.has(channel)) {
            this.handlers.set(channel, []);
            this.subscriber?.subscribe(channel);
        }
        this.handlers.get(channel)?.push(handler);
    }

    subscribeDurable<T>(options: StreamSubscribeOptions<T>): void {
        const { stream, group, consumer = `${group}-consumer-${crypto.randomUUID()}`, handler } = options;

        const reader = new Redis(this.redisUrl, { maxRetriesPerRequest: null });
        this.streamReaders.push(reader);
        const processorKey = `${stream}:${group}:${consumer}`;
        this.activeProcessors.set(processorKey, true);

        const processStream = async () => {
            // Ensure consumer group exists
            try {
                // MKSTREAM flag ensures the stream is created if it doesn't exist
                await this.publisher.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
            } catch (err: any) {
                if (!err.message.includes('BUSYGROUP')) {
                    console.error(`Error creating consumer group ${group} for stream ${stream}:`, err.message);
                }
            }

            while (this.activeProcessors.get(processorKey)) {
                try {
                    // Block for up to 5 seconds waiting for new messages
                    const results = await reader.xreadgroup(
                        'GROUP', group, consumer,
                        'COUNT', '1', 'BLOCK', 5000,
                        'STREAMS', stream, '>'
                    ) as any[] | null;

                    if (results) {
                        for (const [_, messages] of results) {
                            for (const [id, [_fieldName, eventStr]] of messages) {
                                try {
                                    const event: NightFuelEvent<T> = JSON.parse(eventStr);
                                    await this.dispatchDurable(stream, group, id, event, handler);
                                } catch (error) {
                                    console.error(`Error processing durable event ${id} on stream ${stream}:`, error);
                                    // Note: we don't XACK on failure, so it remains in PEL (Pending Entries List)
                                }
                            }
                        }
                    }
                } catch (err: any) {
                    console.error(`Durable subscription error [${stream} / ${group}]:`, err.message);
                    await new Promise(res => setTimeout(res, 2000)); // Backoff on error
                }
            }
        };

        processStream().catch(err => {
            console.error(`Stream processor terminated for ${stream}:`, err);
        });
    }

    /**
     * Idempotent dispatch of ONE durable stream message.
     *
     * subscribeDurable is at-least-once: a message is XACKed only after its
     * handler resolves, so a handler throw — or a process restart that leaves an
     * unacked entry in the consumer group's PEL — REDELIVERS the same logical
     * event (same NightFuelEvent.eventId). Handlers that fold state additively
     * (progress-service macro accumulation) or step a counter (state-service
     * fatigue ±1 / adherence window) would then double-apply.
     *
     * We make EVERY durable consumer idempotent against redelivery with a single
     * Redis processed-marker keyed by (group, eventId). The ordering is the
     * crux:
     *
     *   1. If the marker already exists → this eventId was fully processed by a
     *      previous delivery. SKIP the handler and XACK (drop it from the PEL).
     *   2. Otherwise run the handler. ONLY on success do we (a) SET the marker
     *      (with a TTL — long enough to outlive any redelivery window, short
     *      enough not to grow Redis unbounded), then (b) XACK.
     *   3. On handler FAILURE we set NO marker and do NOT XACK, so the entry
     *      stays in the PEL and is redelivered/retried.
     *
     * Crash-safety of the marker-AFTER-success ordering:
     *   • Crash BETWEEN handler-success and SET marker, or between SET and XACK:
     *     the message is still unacked → redelivered. The marker (if it was
     *     written) is seen on redelivery → skip + XACK; if it wasn't written yet
     *     the handler runs again. Either way the user-visible effect is applied
     *     at most "once more" only when the handler had NOT yet been observed to
     *     fully succeed — and handlers reached via this path are themselves
     *     idempotent at the row level (state-service lastEventId dedup), so a
     *     re-run between success and marker is harmless.
     *   • Crash DURING the handler: no marker, no XACK → full reprocess. Correct.
     *
     * The marker is keyed by `group` (not consumer) so it dedups across consumer
     * restarts/rebalances within the same logical subscriber, and is namespaced
     * per group so two different durable subscribers (state-service vs
     * progress-service) each process the same eventId exactly once independently.
     */
    private async dispatchDurable<T>(
        stream: string,
        group: string,
        id: string,
        event: NightFuelEvent<T>,
        handler: (event: NightFuelEvent<T>) => Promise<void>,
    ): Promise<void> {
        const markerKey = `nf:processed:${group}:${event.eventId}`;

        // (1) Already processed by a prior delivery → skip + ack, never re-run.
        const alreadyProcessed = await this.publisher.exists(markerKey);
        if (alreadyProcessed) {
            await this.publisher.xack(stream, group, id);
            return;
        }

        // (2) First time we've seen this eventId in this group → run the handler.
        // A throw here propagates to the caller's catch: NO marker is set and NO
        // XACK is issued, so the entry remains in the PEL for redelivery/retry.
        await handler(event);

        // Handler succeeded. Mark processed FIRST (TTL-bounded), THEN ack. A
        // crash in this gap leaves the message unacked → redelivery sees the
        // marker → skip + ack (no reprocess).
        await this.publisher.set(markerKey, '1', 'EX', RedisEventBus.PROCESSED_MARKER_TTL_SECONDS);
        await this.publisher.xack(stream, group, id);
    }

    async disconnect(): Promise<void> {
        this.activeProcessors.forEach((_, key) => this.activeProcessors.set(key, false));

        const cleanup = [
            this.publisher.quit(),
            this.subscriber?.quit(),
            ...this.streamReaders.map(r => r.quit())
        ];

        await Promise.all(cleanup);
    }
}
