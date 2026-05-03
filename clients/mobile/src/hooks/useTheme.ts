import { useColorScheme } from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { useTheme as useThemeContext } from '@/theme';

/**
 * Dark/light mode toggle hook.
 * Combines the Zustand theme store with RN's system color scheme
 * and the ThemeContext for a unified API.
 */
export function useThemeToggle() {
    const systemScheme = useColorScheme();
    const theme = useThemeStore((s) => s.theme);
    const setTheme = useThemeStore((s) => s.setTheme);
    const isDarkTheme = useThemeStore((s) => s.isDarkTheme);

    const isDark = isDarkTheme(systemScheme);
    const themeContext = useThemeContext();

    const toggleTheme = () => {
        setTheme(isDark ? 'light' : 'dark');
    };

    return {
        theme,
        isDark,
        setTheme,
        toggleTheme,
        systemScheme,
        ...themeContext,
    };
}
