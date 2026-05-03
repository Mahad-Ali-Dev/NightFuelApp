/**
 * API response types & shared interfaces.
 * Centralizes common response patterns used across API modules.
 */

// ── Generic Wrappers ────────────────────────────────────────────────

export interface ApiResponse<T> {
    data: T;
    message?: string;
    status: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

export interface ApiError {
    message: string;
    code: string;
    statusCode: number;
    details?: Record<string, unknown>;
}

// ── Common Models ───────────────────────────────────────────────────

export interface UserProfile {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: 'user' | 'coach' | 'admin';
    onboardingComplete: boolean;
    shiftType: 'night' | 'rotating' | 'on-call' | null;
    timezone: string;
    createdAt: string;
}

export interface Macros {
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
}

export interface TimeRange {
    start: string; // ISO 8601
    end: string;
}

export interface CoachClient {
    id: string;
    name: string;
    avatarUrl: string | null;
    shiftType: string;
    adherencePercent: number;
    lastActive: string;
    alerts: number;
    currentPlan: string | null;
}

export interface CoachingRequest {
    id: string;
    userId: string;
    userName: string;
    userAvatar: string | null;
    shiftType: string;
    goals: string[];
    message: string;
    status: 'pending' | 'accepted' | 'declined';
    createdAt: string;
}

// ── Subscription ────────────────────────────────────────────────────

export type SubscriptionTier = 'basic' | 'pro' | 'elite';

export interface SubscriptionStatus {
    tier: SubscriptionTier;
    isActive: boolean;
    expiresAt: string | null;
    features: string[];
}

// ── Notifications ───────────────────────────────────────────────────

export interface Notification {
    id: string;
    type: 'meal' | 'caffeine' | 'sleep' | 'workout' | 'coach' | 'system';
    title: string;
    body: string;
    read: boolean;
    actionUrl?: string;
    createdAt: string;
}
