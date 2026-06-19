import { apiClient } from './client';

/**
 * The public-facing profile shape (SOCIAL API CONTRACT, user-service):
 * GET /v1/users/public/:id -> { userId, displayName, avatarUrl, isPrivate }.
 * `isPrivate` (default false) gates a private user's detailed profile to accepted
 * followers only — the userProfile screen reads it to render the locked state.
 * Fields beyond these may be present (bio, follower counts, …) for non-private
 * users or accepted followers, so the type is intentionally open.
 */
export interface PublicProfile {
  userId: string;
  displayName?: string;
  avatarUrl?: string | null;
  /** When true and the viewer is not an accepted follower, only name+avatar are shown. */
  isPrivate?: boolean;
  [key: string]: unknown;
}

export const getProfile = () => apiClient.get('/v1/users/me');
export const updateProfile = (data: any) => apiClient.put('/v1/users/me', data);
export const updatePreferences = (data: any) => apiClient.put('/v1/users/me/preferences', data);
export const updateOnboarding = (data: any) => apiClient.put('/v1/users/me/onboarding', data);
export const getPublicProfile = (userId: string) => apiClient.get(`/v1/users/public/${userId}`);
export const getStudents = () => apiClient.get('/v1/users/me/students');
export const assignProtocol = (studentId: string, protocolId: string | null) =>
  apiClient.post(`/v1/users/students/${studentId}/assign-protocol`, { protocolId });

/**
 * Toggle the current user's profile visibility (SOCIAL API CONTRACT, user-service):
 * PATCH /v1/users/me { isPrivate }. A private user's detailed profile is only
 * returned to accepted followers (composed by community-service).
 */
export const updatePrivacy = ({ isPrivate }: { isPrivate: boolean }) =>
  apiClient.patch('/v1/users/me', { isPrivate });
