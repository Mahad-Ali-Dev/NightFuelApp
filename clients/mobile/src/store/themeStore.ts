import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
    isDarkTheme: (colorScheme: 'light' | 'dark' | null | undefined) => boolean;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            theme: 'dark', // Default to Dark based on design
            setTheme: (theme) => set({ theme }),
            isDarkTheme: (colorScheme) => {
                const { theme } = get();
                if (theme === 'system') {
                    return colorScheme === 'dark';
                }
                return theme === 'dark';
            },
        }),
        {
            name: 'nf-theme-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
