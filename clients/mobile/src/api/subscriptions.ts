import { apiClient } from './client';

export interface SubscriptionStatus {
  tier: 'FREE' | 'PRO' | 'PREMIUM' | 'ENTERPRISE';
  active: boolean;
  expiresAt?: string;
  features: string[];
}

export const getStatus = async (): Promise<SubscriptionStatus> => {
  const { data } = await apiClient.get<SubscriptionStatus>('/v1/subscriptions/status');
  return data;
};

export const upgrade = async (payload: { tier: string; paymentMethodId?: string }) => {
  const { data } = await apiClient.post('/v1/subscriptions/upgrade', payload);
  return data;
};

export const enrollAsCoach = async () => {
  const { data } = await apiClient.post('/v1/subscriptions/coach/onboard');
  return data;
};

export const bookCoachSession = async (coachId: string, amount: number) => {
  const { data } = await apiClient.post('/v1/subscriptions/coach/checkout', { coachId, amount });
  return data;
};
