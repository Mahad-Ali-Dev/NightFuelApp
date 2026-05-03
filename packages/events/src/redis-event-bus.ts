import Redis from 'ioredis';
import { EventBus, StreamSubscribeOptions } from './event-bus';
import { NightFuelEvent } from '@nightfuel/types';
import * as crypto from 'crypto';

export class RedisEventBus implements EventBus {
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
                                    await handler(event);
                                    // Explicitly acknowledge the message
                                    await this.publisher.xack(stream, group, id);
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
