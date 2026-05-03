import { create } from 'zustand';

// ─── Types ───────────────────────────────────────────────────────────

export interface Shift {
  id: string;
  type: 'night' | 'rotating' | 'on-call';
  startTime: Date;
  endTime: Date;
  label: string;
}

export interface ShiftState {
  currentShift: Shift | null;
  shiftType: 'night' | 'rotating' | 'on-call' | null;
  shiftEndTime: Date | null;
  isOnShift: boolean;
  setShift: (shift: Shift) => void;
  clearShift: () => void;
}

// ─── Store ───────────────────────────────────────────────────────────

export const useShiftStore = create<ShiftState>((set) => ({
  currentShift: null,
  shiftType: null,
  shiftEndTime: null,
  isOnShift: false,

  setShift: (shift: Shift) => {
    set({
      currentShift: shift,
      shiftType: shift.type,
      shiftEndTime: shift.endTime,
      isOnShift: true,
    });
  },

  clearShift: () => {
    set({
      currentShift: null,
      shiftType: null,
      shiftEndTime: null,
      isOnShift: false,
    });
  },
}));
