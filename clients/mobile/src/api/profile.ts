import { apiClient } from './client';
import { User } from '@/store/authStore';

export interface UserProfile extends User {
    aboutMe?: string;
    occupation?: string;
    timezone?: string;
    avatarUrl: string | null;
    preferences?: UserPreferences;
    status?: UserStatus;
}

export interface UserPreferences {
    dietaryType: string;
    allergies: string[];
    dislikedIngredients: string[];
    medications: string[];
    supplements: string[];
    sleepTargetHours: number;
    wakeTime: string;
    sleepTime: string;
    workStartTime: string;
    workEndTime: string;
}

export interface UserStatus {
    fatigueScore: number;
    adherenceScore: number;
    circadianPhase: 'WAKE' | 'SLEEP' | 'WIND_DOWN';
    lastUpdated: string;
}

export const getMyProfile = async (): Promise<UserProfile> => {
    const { data } = await apiClient.get('/v1/users/me');
    return data;
};

export const updateProfile = async (updates: Partial<UserProfile>): Promise<UserProfile> => {
    const { data } = await apiClient.put('/v1/users/me', updates);
    return data;
};

export const getPreferences = async (): Promise<UserPreferences> => {
    const { data } = await apiClient.get('/v1/users/me/preferences');
    return data;
};

export const updatePreferences = async (updates: Partial<UserPreferences>): Promise<UserPreferences> => {
    const { data } = await apiClient.put('/v1/users/me/preferences', updates);
    return data;
};

export const getStatus = async (): Promise<UserStatus> => {
    // Backend uses adherenceRate / circadianPeakTime / updatedAt
    const { data } = await apiClient.get<any>('/v1/users/me/status');
    return {
        fatigueScore: data.fatigueScore ?? 0,
        adherenceScore: data.adherenceScore ?? data.adherenceRate ?? 0,
        circadianPhase: data.circadianPhase ?? 'WAKE',
        lastUpdated: data.lastUpdated ?? data.updatedAt ?? '',
    };
};

export const getPublicProfile = async (userId: string): Promise<Partial<UserProfile>> => {
    const { data } = await apiClient.get(`/v1/users/public/${userId}`);
    return data;
};
