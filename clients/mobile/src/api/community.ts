import { apiClient } from './client';
// Message-request endpoints + their wire shapes are owned by src/api/chat.ts (the
// chat work-item); we delegate to those below so there is exactly ONE place that
// knows the /v1/chat/requests shape, and re-export the row type for the inbox UI.
import {
  getChatRequests,
  acceptChatRequest,
  declineChatRequest,
  type Conversation,
  type ChatPeer,
} from './chat';

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

// ── Social: follow / unfollow / social-graph ───────────────────────────────────
// SOCIAL API CONTRACT (community-service):
//   POST   /v1/community/follow/:userId            (idempotent)
//   DELETE /v1/community/follow/:userId
//   GET    /v1/community/users/:userId/social  ->  { isFollowing, followers, following }

/** The follow-graph state for a given user, relative to the current viewer. */
export interface UserSocial {
  /** Whether the current user already follows this profile. */
  isFollowing: boolean;
  /** Total followers of this profile. */
  followers: number;
  /** Total accounts this profile follows. */
  following: number;
}

/**
 * Follow a user. Idempotent per the CONTRACT (following someone you already
 * follow is a no-op server-side), so the optimistic UI never needs to guard
 * against a double-tap.
 */
export const followUser = async (userId: string): Promise<void> => {
  await apiClient.post(`/v1/community/follow/${userId}`);
};

/** Unfollow a user. */
export const unfollowUser = async (userId: string): Promise<void> => {
  await apiClient.delete(`/v1/community/follow/${userId}`);
};

/**
 * The follow-graph state for a profile relative to the viewer. Tolerates a
 * `{ data: {...} }` envelope or a bare object, and coerces the numeric counts so
 * a missing field renders as 0 rather than NaN.
 */
export const getUserSocial = async (userId: string): Promise<UserSocial> => {
  const { data } = await apiClient.get<{ data?: UserSocial } & Partial<UserSocial>>(
    `/v1/community/users/${userId}/social`,
  );
  const body = (data?.data ?? data ?? {}) as Partial<UserSocial>;
  return {
    isFollowing: !!body.isFollowing,
    followers: Number(body.followers) || 0,
    following: Number(body.following) || 0,
  };
};

// ── Message requests (Instagram-DM style) ──────────────────────────────────────
// SOCIAL API CONTRACT (chat-service): a not-yet-accepted 1:1 conversation is a
// REQUEST. These hit the chat-service request endpoints:
//   GET  /v1/chat/requests                       (incoming pending list)
//   POST /v1/chat/requests/:conversationId/accept
//   POST /v1/chat/requests/:conversationId/decline
// We delegate to src/api/chat.ts (imported at top) so the wire shape lives in one
// place; the work-item-named aliases below are what the inbox UI imports.

/** A pending incoming message request — a `Conversation` with requestState 'pending'. */
export type MessageRequest = Conversation;
export type { ChatPeer };

/** Incoming pending message requests for the current user. GET /v1/chat/requests. */
export const getMessageRequests = (): Promise<MessageRequest[]> => getChatRequests();

/** Accept an incoming message request. POST /v1/chat/requests/:conversationId/accept. */
export const acceptRequest = (conversationId: string): Promise<void> =>
  acceptChatRequest(conversationId);

/** Decline an incoming message request. POST /v1/chat/requests/:conversationId/decline. */
export const declineRequest = (conversationId: string): Promise<void> =>
  declineChatRequest(conversationId);
