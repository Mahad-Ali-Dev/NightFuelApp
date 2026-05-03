import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ShiftState {
    activeShiftId: string | null;
    shiftDate: string | null;
    circadianProfileId: string | null;
    setActiveShift: (shiftId: string, date: string) => void;
    setCircadianProfile: (profileId: string) => void;
    clearShift: () => void;
}

export const useShiftStore = create<ShiftState>()(
    persist(
        (set) => ({
            activeShiftId: null,
            shiftDate: null,
            circadianProfileId: null,
            setActiveShift: (activeShiftId, shiftDate) => set({ activeShiftId, shiftDate }),
            setCircadianProfile: (circadianProfileId) => set({ circadianProfileId }),
            clearShift: () => set({ activeShiftId: null, shiftDate: null, circadianProfileId: null }),
        }),
        {
            name: 'shift-storage',
        }
    )
);
