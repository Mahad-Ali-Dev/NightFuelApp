import { NightFuelEvent } from '@nightfuel/types';

export interface StreamSubscribeOptions<T> {
    stream: string;
    group: string;
    consumer?: string;
    handler: (event: NightFuelEvent<T>) => Promise<void>;
}

export interface EventBus {
    publish<T>(stream: string, event: NightFuelEvent<T>): Promise<void>;
    subscribe<T>(stream: string, handler: (event: NightFuelEvent<T>) => Promise<void>): void;
    subscribeDurable<T>(options: StreamSubscribeOptions<T>): void;
    disconnect(): Promise<void>;
}
