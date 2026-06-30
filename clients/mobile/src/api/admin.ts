import { apiClient } from './client';

export interface AdminStats {
    totalUsers: number;
    activeToday: number;
    newUsersThisWeek: number;
    premiumUsers: number;
    // Coach metrics (real, from coach_profiles). Optional so the type is valid
    // before the user-service deploy that adds them.
    coaches?: number;
    availableCoaches?: number;
}

export interface AdminUser {
    id: string;
    userId: string;
    displayName: string;
    status: string;
    tier: string;
    createdAt: string;
    lastActiveAt: string;
}

export async function getStats(): Promise<AdminStats> {
    const { data } = await apiClient.get<AdminStats>('/v1/users/admin/stats');
    return data;
}

export async function getUsers(search?: string, limit: number = 50): Promise<AdminUser[]> {
    const { data } = await apiClient.get<AdminUser[]>('/v1/users/admin/users', {
        params: { search, limit }
    });
    return data;
}

export async function toggleBanUser(userId: string): Promise<{ success: boolean; message: string }> {
    const { data } = await apiClient.post<{ success: boolean; message: string }>(`/v1/users/admin/users/${userId}/ban`);
    return data;
}
