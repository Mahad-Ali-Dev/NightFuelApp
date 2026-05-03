import { useAuthStore, User, RegisterData } from '@/store/authStore';
export type { User, RegisterData };

/**
 * Auth state & actions hook.
 * Wraps the Zustand authStore for ergonomic usage in components.
 */
export function useAuth() {
    const user = useAuthStore((s) => s.user);
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const isLoading = useAuthStore((s) => s.isLoading);
    const role = useAuthStore((s) => s.role);
    const login = useAuthStore((s) => s.login);
    const register = useAuthStore((s) => s.register);
    const logout = useAuthStore((s) => s.logout);
    const loadSession = useAuthStore((s) => s.loadSession);
    const setUser = useAuthStore((s) => s.setUser);

    const isCoach = role === 'coach';
    const isAdmin = role === 'admin';

    return {
        user,
        isAuthenticated,
        isLoading,
        role,
        isCoach,
        isAdmin,
        login,
        register,
        logout,
        loadSession,
        setUser,
    };
}
