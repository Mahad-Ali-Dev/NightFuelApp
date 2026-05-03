import { apiClient } from './client';

export interface SleepSession {
  id: string;
  userId: string;
  startTime: string;
  endTime?: string | null;
  durationMins?: number | null;
  quality?: number | null;
  disturbances: number;
  source: string;
  circadianAlignmentScore?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SleepAnalytics {
  qualityScore?: number;
  summary?: string;
  anchorSleepWindow?: string;
  preShiftNapWindow?: string;
  avgDuration?: number;
  avgQuality?: number;
  [key: string]: any;
}

export interface LogSleepInput {
  startTime: string;
  endTime: string;
  quality?: number;
  disturbances?: number;
  notes?: string;
}

export const log = (data: LogSleepInput) =>
  apiClient.post('/v1/sleep', data);

export const listSessions = async (limit = 15): Promise<SleepSession[]> => {
  const { data } = await apiClient.get<SleepSession[]>('/v1/sleep', {
    params: { limit },
  });
  return data;
};

export const getQuality = async () => {
  const { data } = await apiClient.get('/v1/sleep/quality');
  return data;
};

export const getAnalytics = async (): Promise<SleepAnalytics> => {
  const { data } = await apiClient.get<SleepAnalytics>('/v1/sleep/analytics');
  return data;
};
