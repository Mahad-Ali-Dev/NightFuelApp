import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface OfflineAction {
    id: string;
    type: 'log_meal' | 'log_workout' | 'log_water' | 'update_progress';
    payload: any;
    timestamp: string;
}

interface OfflineState {
    isOffline: boolean;
    queue: OfflineAction[];
    setOfflineStatus: (isOffline: boolean) => void;
    enqueueAction: (action: Omit<OfflineAction, 'id' | 'timestamp'>) => void;
    dequeueAction: (id: string) => void;
    clearQueue: () => void;
}

export const useOfflineStore = create<OfflineState>()(
    persist(
        (set) => ({
            isOffline: false,
            queue: [],
            setOfflineStatus: (isOffline) => set({ isOffline }),
            enqueueAction: (action) =>
                set((state) => ({
                    queue: [
                        ...state.queue,
                        {
                            ...action,
                            id: Math.random().toString(36).substring(2, 10),
                            timestamp: new Date().toISOString(),
                        },
                    ],
                })),
            dequeueAction: (id) =>
                set((state) => ({
                    queue: state.queue.filter((a) => a.id !== id),
                })),
            clearQueue: () => set({ queue: [] }),
        }),
        {
            name: 'nf-offline-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
