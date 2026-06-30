/**
 * coachRelations.ts — the coach ↔ client relationship lifecycle.
 *
 * A client requests a coach → the coach accepts/declines → an accepted relation
 * makes them the client's coach + adds the client to the coach's roster. See
 * services/user-service (CoachClientRelation + /coaches/:id/request etc.).
 */
import { apiClient } from './client';

export interface CoachRequest {
    id: string;
    coachUserId: string;
    clientUserId: string;
    status: string;
    createdAt: string;
    /** Joined from the requesting client's profile. */
    displayName?: string | null;
    avatarUrl?: string | null;
}

export interface MyCoach {
    id: string;
    coachUserId: string;
    status: string;
    coach: {
        userId: string;
        displayName: string | null;
        avatarUrl: string | null;
        specializations: string[];
        bio: string | null;
    };
}

/** Client → request a coach (idempotent; re-requesting resets to PENDING). */
export async function requestCoach(coachUserId: string): Promise<{ status: string }> {
    const { data } = await apiClient.post<{ status: string }>(`/v1/users/coaches/${coachUserId}/request`);
    return data;
}

/** Coach → my incoming PENDING requests (with the requesting client's profile). */
export async function getCoachRequests(): Promise<CoachRequest[]> {
    const { data } = await apiClient.get<CoachRequest[]>('/v1/users/me/coach-requests');
    return data;
}

/** Coach → accept or decline a request. */
export async function respondToCoachRequest(id: string, action: 'accept' | 'decline'): Promise<{ ok: boolean }> {
    const { data } = await apiClient.post<{ ok: boolean }>(`/v1/users/coach-requests/${id}/${action}`);
    return data;
}

/** Client → my current (accepted) coach, or null. */
export async function getMyCoach(): Promise<MyCoach | null> {
    const { data } = await apiClient.get<MyCoach | null>('/v1/users/me/coach');
    return data ?? null;
}
