import { apiClient } from './client';

export const getProfile = () => apiClient.get('/v1/users/me');
export const updateProfile = (data: any) => apiClient.put('/v1/users/me', data);
export const updatePreferences = (data: any) => apiClient.put('/v1/users/me/preferences', data);
export const updateOnboarding = (data: any) => apiClient.put('/v1/users/me/onboarding', data);
export const getPublicProfile = (userId: string) => apiClient.get(`/v1/users/public/${userId}`);
export const getStudents = () => apiClient.get('/v1/users/me/students');
export const assignProtocol = (studentId: string, protocolId: string | null) =>
  apiClient.post(`/v1/users/students/${studentId}/assign-protocol`, { protocolId });
