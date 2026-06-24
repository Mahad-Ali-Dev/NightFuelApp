import { apiClient, getAccessToken, resolveApiUrl } from './client';
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

/**
 * Upload a locally-picked image (a `file://` / `content://` / `ph://` ImagePicker
 * URI) to the community-service and return its absolute https URL.
 *
 * BUG #3: posting the raw local URI stored a value that every OTHER device rejects
 * (the on-device trust gate only allows https), so a post's image was blank for
 * everyone but the author. We now POST the file as multipart/form-data and the
 * server persists it + returns a public https URL we attach to the post.
 *
 * Uses RN's native `fetch` (not axios) on purpose: when a `FormData` body is
 * passed and NO `Content-Type` header is set, React Native's XHR layer fills in
 * `multipart/form-data; boundary=…` itself. Setting the header by hand (as axios's
 * `application/json` default would force) drops the boundary and breaks server-side
 * parsing — so we deliberately omit it here. Auth + base-URL/`/v1`-strip reuse the
 * exact same helpers as the axios client so behaviour never drifts.
 */
export const uploadImage = async (localUri: string): Promise<string> => {
  // Derive a filename + mime from the URI extension (RN FormData file part shape).
  const extMatch = /\.(\w+)(?:\?.*)?$/.exec(localUri);
  const ext = (extMatch?.[1] || 'jpg').toLowerCase();
  const mime =
    ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
        : ext === 'gif' ? 'image/gif'
          : ext === 'heic' ? 'image/heic'
            : ext === 'heif' ? 'image/heif'
              : 'image/jpeg';

  const form = new FormData();
  // RN's FormData accepts this { uri, name, type } shape for a file part.
  form.append('image', { uri: localUri, name: `upload.${ext}`, type: mime } as any);

  const token = await getAccessToken();
  const res = await fetch(resolveApiUrl('/v1/community/upload'), {
    method: 'POST',
    // NOTE: intentionally no 'Content-Type' — RN sets it (with the boundary) for us.
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form as any,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Image upload failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  const json = (await res.json()) as { url?: string };
  if (!json?.url) throw new Error('Image upload returned no URL');
  return json.url;
};

export const createPost = async (content: string, imageUrl?: string): Promise<Post> => {
  // BUG #3: if the image is a local (non-https) URI, upload it first and post with
  // the returned https URL. An already-https URL passes straight through. The
  // server additionally rejects a non-https imageUrl, so this keeps posting valid.
  let resolvedImageUrl = imageUrl;
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
    resolvedImageUrl = await uploadImage(imageUrl);
  }
  const { data } = await apiClient.post('/v1/community/post', { content, imageUrl: resolvedImageUrl });
  return data;
};

export const likePost = async (postId: string): Promise<boolean> => {
  // The like route returns the updated Post row (no `success` field), so a
  // `data.success` read is always undefined. Treat any 2xx (no throw) as success.
  await apiClient.post(`/v1/community/post/${postId}/like`);
  return true;
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
  // The join route returns the ChallengeParticipant row (no `success` field), so a
  // `data.success` read is always undefined. Treat any 2xx (no throw) as success.
  await apiClient.post(`/v1/community/challenges/${challengeId}/join`);
  return true;
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
