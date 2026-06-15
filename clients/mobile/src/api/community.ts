import { apiClient } from './client';

export interface Post {
  id: string;
  userId: string;
  content: string;
  imageUrl?: string;
  likes: number;
  commentsCount: number;
  createdAt: string;
  author?: {
    id?: string;
    name: string;
    avatarUrl?: string;
  };
}

export interface Comment {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
  author?: {
    name: string;
    avatarUrl?: string;
  };
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  participants: number;
  myProgress?: number;
}

export const getFeed = async (limit = 20, cursor?: string): Promise<Post[]> => {
  const { data } = await apiClient.get('/v1/community/feed', { params: { limit, cursor } });
  return data;
};

export const createPost = async (content: string, imageUrl?: string): Promise<Post> => {
  const { data } = await apiClient.post('/v1/community/post', { content, imageUrl });
  return data;
};

export const likePost = async (postId: string): Promise<boolean> => {
  const { data } = await apiClient.post(`/v1/community/post/${postId}/like`);
  return data.success;
};

export const addComment = async (postId: string, text: string): Promise<Comment> => {
  const { data } = await apiClient.post(`/v1/community/post/${postId}/comment`, { text });
  return data;
};

export const getUserPosts = async (userId: string | 'me', limit = 20): Promise<Post[]> => {
  const { data } = await apiClient.get(`/v1/community/user/${userId}/posts`, { params: { limit } });
  return data;
};

export const getChallenges = async (): Promise<Challenge[]> => {
  const { data } = await apiClient.get('/v1/community/challenges');
  return data;
};

export const joinChallenge = async (challengeId: string): Promise<boolean> => {
  const { data } = await apiClient.post(`/v1/community/challenges/${challengeId}/join`);
  return data.success;
};

/** Log incremental progress toward a challenge (e.g. steps walked, workouts done) */
export const updateChallengeProgress = async (challengeId: string, value: number): Promise<boolean> => {
  const { data } = await apiClient.post(`/v1/community/challenges/${challengeId}/progress`, { progress: value });
  return data.success ?? true;
};

export const getLeaderboard = async (limit = 10): Promise<{ leaderboard: any[], myScore: any }> => {
  const { data } = await apiClient.get('/v1/community/leaderboard', { params: { limit } });
  return data;
};

export const getPostById = async (postId: string): Promise<Post> => {
  const { data } = await apiClient.get(`/v1/community/post/${postId}`);
  return data.data ?? data;
};

export const getComments = async (postId: string): Promise<Comment[]> => {
  const { data } = await apiClient.get<{ data: Comment[] }>(`/v1/community/post/${postId}/comments`);
  return data.data ?? (Array.isArray(data) ? data : []);
};

// ── Badge / Achievement API ────────────────────────────────────────────────────

export interface Badge {
  id: string;
  key: string;
  name: string;
  description: string;
  iconEmoji: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  xpReward: number;
  awardedAt?: string;
  seen?: boolean;
}

export interface UserScore {
  userId: string;
  xp: number;
  level: number;
  xpForNextLevel: number;
}

export const getBadgeCatalog = async (): Promise<Badge[]> => {
  const { data } = await apiClient.get('/v1/community/badges');
  return Array.isArray(data) ? data : [];
};

export const getMyBadges = async (): Promise<Badge[]> => {
  const { data } = await apiClient.get('/v1/community/badges/mine');
  return Array.isArray(data) ? data : [];
};

export const getUnseenBadges = async (): Promise<Badge[]> => {
  const { data } = await apiClient.get('/v1/community/badges/unseen');
  return Array.isArray(data) ? data : [];
};

export const getUserBadges = async (userId: string): Promise<Badge[]> => {
  const { data } = await apiClient.get(`/v1/community/badges/user/${userId}`);
  return Array.isArray(data) ? data : [];
};

export const getUserScore = async (userId: string | 'me'): Promise<UserScore> => {
  const { data } = await apiClient.get(`/v1/community/user/${userId}/score`);
  return data;
};
