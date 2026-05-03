'use client';

import { useAuthStore } from '../store/authStore';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

export const useAuth = () => {
    const { login: storeLogin, logout: storeLogout, updateUser, user, isAuthenticated } = useAuthStore();
    const router = useRouter();

    const login = async (data: any) => {
        const res = await api.post('/login', data);
        storeLogin(res.data.user, res.data.accessToken, res.data.refreshToken);
        router.push('/dashboard');
    };

    const register = async (data: any) => {
        const res = await api.post('/register', data);
        storeLogin(res.data.user, res.data.accessToken, res.data.refreshToken);
        router.push('/dashboard');
    };

    const logout = async () => {
        try {
            await api.post('/logout', { refreshToken: localStorage.getItem('refreshToken') });
        } catch (e) {
            console.error("Logout failed", e);
        }
        storeLogout();
        router.push('/login');
    };

    return { user, isAuthenticated, login, register, logout, updateUser, isLoading: false };
};
