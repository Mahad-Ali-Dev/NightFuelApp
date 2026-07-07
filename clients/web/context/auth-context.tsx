'use client';

import { useAuthStore } from '../store/authStore';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

export const useAuth = () => {
    const { login: storeLogin, logout: storeLogout, updateUser, user, isAuthenticated } = useAuthStore();
    const router = useRouter();

    const login = async (data: any) => {
        const res = await api.post('/login', data);
        // HIGH #1: the refresh token is set by auth-service in an httpOnly cookie;
        // we only keep the short-lived access token (in memory) here.
        storeLogin(res.data.user, res.data.accessToken);
        router.push('/dashboard');
    };

    const register = async (data: any) => {
        const res = await api.post('/register', data);
        storeLogin(res.data.user, res.data.accessToken);
        router.push('/dashboard');
    };

    const logout = async () => {
        try {
            // No body needed — auth-service reads the refresh token from the
            // httpOnly cookie (api has withCredentials) and clears it server-side.
            await api.post('/logout', {});
        } catch (e) {
            console.error("Logout failed", e);
        }
        storeLogout();
        router.push('/login');
    };

    return { user, isAuthenticated, login, register, logout, updateUser, isLoading: false };
};
