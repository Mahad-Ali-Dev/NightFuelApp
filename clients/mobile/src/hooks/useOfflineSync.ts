/**
 * useOfflineSync — drains the offline action queue when connectivity is restored.
 * Watches `offlineStore.isOffline` (set by NetworkStatusBar) so we avoid
 * a duplicate NetInfo subscription or missing-package errors.
 */
import { useEffect, useRef } from 'react';
import { useOfflineStore, OfflineAction } from '@/store/offlineStore';
import { logMeal } from '@/api/meals';
import { logWorkout } from '@/api/exercises';

async function replayAction(action: OfflineAction): Promise<void> {
    switch (action.type) {
        case 'log_meal':
            await logMeal(action.payload);
            break;
        case 'log_workout':
            await logWorkout(action.payload);
            break;
        case 'log_water':
            await logMeal({ ...action.payload, type: 'water' });
            break;
        case 'update_progress':
            // Best-effort; skip silently if endpoint not ready
            break;
        default:
            console.warn('[OfflineSync] Unknown action type:', (action as OfflineAction).type);
    }
}

export function useOfflineSync() {
    const { isOffline, queue, dequeueAction } = useOfflineStore();
    const isSyncing = useRef(false);
    const prevOffline = useRef(isOffline);

    useEffect(() => {
        // Trigger sync when transitioning from offline → online
        const wasOffline = prevOffline.current;
        prevOffline.current = isOffline;

        if (!isOffline && wasOffline && queue.length > 0 && !isSyncing.current) {
            isSyncing.current = true;
            (async () => {
                for (const action of queue) {
                    try {
                        await replayAction(action);
                        dequeueAction(action.id);
                    } catch (err) {
                        console.warn('[OfflineSync] Failed to replay action:', action.type, err);
                    }
                }
                isSyncing.current = false;
            })();
        }
    }, [isOffline, queue, dequeueAction]);
}
