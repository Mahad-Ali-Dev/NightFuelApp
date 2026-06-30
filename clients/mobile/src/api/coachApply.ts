/**
 * coachApply.ts — the "apply to be a coach" + admin review API.
 *
 * Flow: a USER submits an application → an ADMIN approves (the backend promotes
 * their role to COACH + activates their CoachProfile) or rejects it. See
 * services/user-service (CoachApplication model + /coach-application routes).
 */
import { apiClient } from './client';

export type CoachApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface CoachApplication {
    id: string;
    userId: string;
    status: CoachApplicationStatus;
    bio: string | null;
    specializations: string[];
    certifications: string[];
    monthlyRateUsd: number | null;
    rejectionReason: string | null;
    reviewedAt: string | null;
    createdAt: string;
    // Present only on the admin list (joined from the applicant's profile).
    displayName?: string | null;
    avatarUrl?: string | null;
}

export interface SubmitCoachApplicationInput {
    bio?: string;
    specializations?: string[];
    certifications?: string[];
    monthlyRateUsd?: number | null;
}

/** Submit (or re-submit) my coach application. Returns the resulting status. */
export async function submitCoachApplication(input: SubmitCoachApplicationInput): Promise<{ status: string }> {
    const { data } = await apiClient.post<{ status: string }>('/v1/users/me/coach-application', input);
    return data;
}

/** My own coach application, or null if I've never applied. */
export async function getMyCoachApplication(): Promise<CoachApplication | null> {
    const { data } = await apiClient.get<CoachApplication | null>('/v1/users/me/coach-application');
    return data ?? null;
}

/** Admin: the review queue (optionally filtered by status). */
export async function adminListCoachApplications(status?: CoachApplicationStatus): Promise<CoachApplication[]> {
    const { data } = await apiClient.get<CoachApplication[]>('/v1/users/admin/coach-applications', { params: { status } });
    return data;
}

/** Admin: approve → the applicant becomes a COACH. */
export async function adminApproveCoachApplication(id: string): Promise<{ ok: boolean }> {
    const { data } = await apiClient.post<{ ok: boolean }>(`/v1/users/admin/coach-applications/${id}/approve`);
    return data;
}

/** Admin: reject with an optional reason. */
export async function adminRejectCoachApplication(id: string, reason?: string): Promise<{ ok: boolean }> {
    const { data } = await apiClient.post<{ ok: boolean }>(`/v1/users/admin/coach-applications/${id}/reject`, { reason });
    return data;
}
