/**
 * Offline queue & retry logic.
 * Queues mutations made while offline and retries them when connectivity returns.
 */
// NetInfo may not be installed in all environments — provide a safe fallback
let NetInfo: { fetch: () => Promise<{ isConnected: boolean | null }> };
try {
    NetInfo = require('@react-native-community/netinfo').default;
} catch {
    NetInfo = { fetch: async () => ({ isConnected: true }) };
}
import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_QUEUE_KEY = 'nf_offline_queue';

export interface QueuedAction {
    id: string;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
    retryCount: number;
}

/**
 * Add an action to the offline queue.
 */
export async function enqueue(action: Omit<QueuedAction, 'id' | 'createdAt' | 'retryCount'>): Promise<void> {
    const queue = await getQueue();
    const entry: QueuedAction = {
        ...action,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        createdAt: new Date().toISOString(),
        retryCount: 0,
    };
    queue.push(entry);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Get all queued actions.
 */
export async function getQueue(): Promise<QueuedAction[]> {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
}

/**
 * Remove a specific action from the queue.
 */
export async function dequeue(actionId: string): Promise<void> {
    const queue = await getQueue();
    const updated = queue.filter((a) => a.id !== actionId);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(updated));
}

/**
 * Clear the entire queue.
 */
export async function clearQueue(): Promise<void> {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
}

/**
 * Check if device is currently online.
 */
export async function isOnline(): Promise<boolean> {
    try {
        const state = await NetInfo.fetch();
        return state.isConnected ?? false;
    } catch {
        return false;
    }
}

/**
 * Process all queued actions with a provided executor function.
 * Failed actions are re-queued with incremented retry count.
 * Actions exceeding maxRetries are dropped.
 */
export async function processQueue(
    executor: (action: QueuedAction) => Promise<void>,
    maxRetries: number = 3,
): Promise<{ processed: number; failed: number }> {
    const online = await isOnline();
    if (!online) return { processed: 0, failed: 0 };

    const queue = await getQueue();
    let processed = 0;
    let failed = 0;
    const remaining: QueuedAction[] = [];

    for (const action of queue) {
        try {
            await executor(action);
            processed++;
        } catch {
            if (action.retryCount < maxRetries) {
                remaining.push({ ...action, retryCount: action.retryCount + 1 });
            }
            failed++;
        }
    }

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    return { processed, failed };
}
