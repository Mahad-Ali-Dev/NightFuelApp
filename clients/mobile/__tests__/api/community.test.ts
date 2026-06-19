/**
 * Tests for src/api/community.ts.
 *
 * Focus: updateChallengeProgress() sends a { progress } body and tolerates a
 * missing success flag; plus the success-flag unwrap (likePost/joinChallenge),
 * the data.data / array-fallback readers (getPostById/getComments), and the
 * Array.isArray guards on the badge endpoints.
 */

jest.mock('@/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

import {
  updateChallengeProgress,
  joinChallenge,
  likePost,
  getChallenges,
  getFeed,
  getPostById,
  getComments,
  getMyBadges,
  followUser,
  unfollowUser,
  getUserSocial,
  getMessageRequests,
  acceptRequest,
  declineRequest,
  type Challenge,
} from '@/api/community';
import { apiClient } from '@/api/client';

const mockedGet = apiClient.get as jest.Mock;
const mockedPost = apiClient.post as jest.Mock;
const mockedDelete = apiClient.delete as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateChallengeProgress', () => {
  test('POSTs a { progress: value } body to the challenge progress endpoint', async () => {
    mockedPost.mockResolvedValueOnce({ data: { success: true } });

    const ok = await updateChallengeProgress('ch_1', 42);

    expect(mockedPost).toHaveBeenCalledWith(
      '/v1/community/challenges/ch_1/progress',
      { progress: 42 },
    );
    expect(ok).toBe(true);
  });

  test('defaults to true when the response omits the success flag', async () => {
    // `data.success ?? true` — an empty 200 body should be treated as success.
    mockedPost.mockResolvedValueOnce({ data: {} });

    const ok = await updateChallengeProgress('ch_1', 1);

    expect(ok).toBe(true);
  });

  test('honors an explicit success:false', async () => {
    mockedPost.mockResolvedValueOnce({ data: { success: false } });

    const ok = await updateChallengeProgress('ch_1', 1);

    expect(ok).toBe(false);
  });
});

describe('joinChallenge', () => {
  test('POSTs to the join endpoint and returns data.success', async () => {
    mockedPost.mockResolvedValueOnce({ data: { success: true } });

    const ok = await joinChallenge('ch_9');

    expect(mockedPost).toHaveBeenCalledWith(
      '/v1/community/challenges/ch_9/join',
    );
    expect(ok).toBe(true);
  });
});

describe('likePost', () => {
  test('POSTs to the like endpoint and returns data.success', async () => {
    mockedPost.mockResolvedValueOnce({ data: { success: false } });

    const ok = await likePost('post_3');

    expect(mockedPost).toHaveBeenCalledWith('/v1/community/post/post_3/like');
    expect(ok).toBe(false);
  });
});

describe('getChallenges', () => {
  test('returns the challenge list verbatim', async () => {
    const challenges: Challenge[] = [
      {
        id: 'ch_1',
        title: '10k Steps',
        description: 'Walk 10k a day',
        participants: 12,
        myProgress: 3,
      },
    ];
    mockedGet.mockResolvedValueOnce({ data: challenges });

    const result = await getChallenges();

    expect(mockedGet).toHaveBeenCalledWith('/v1/community/challenges');
    expect(result).toEqual(challenges);
  });
});

describe('getFeed', () => {
  test('forwards the default limit and undefined cursor as params', async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });

    await getFeed();

    expect(mockedGet).toHaveBeenCalledWith('/v1/community/feed', {
      params: { limit: 20, cursor: undefined },
    });
  });

  test('forwards a custom limit + cursor', async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });

    await getFeed(5, 'cur_abc');

    expect(mockedGet).toHaveBeenCalledWith('/v1/community/feed', {
      params: { limit: 5, cursor: 'cur_abc' },
    });
  });
});

describe('getPostById', () => {
  test('unwraps a data.data envelope when present', async () => {
    const post = { id: 'p_1', content: 'hello', likes: 0 };
    mockedGet.mockResolvedValueOnce({ data: { data: post } });

    const result = await getPostById('p_1');

    expect(mockedGet).toHaveBeenCalledWith('/v1/community/post/p_1');
    expect(result).toEqual(post);
  });

  test('falls back to the raw body when there is no data envelope', async () => {
    const post = { id: 'p_2', content: 'flat', likes: 1 };
    mockedGet.mockResolvedValueOnce({ data: post });

    const result = await getPostById('p_2');

    expect(result).toEqual(post);
  });
});

describe('getComments', () => {
  test('unwraps the { data: Comment[] } envelope', async () => {
    const comments = [{ id: 'c_1', userId: 'u_1', text: 'nice', createdAt: 'x' }];
    mockedGet.mockResolvedValueOnce({ data: { data: comments } });

    const result = await getComments('p_1');

    expect(result).toEqual(comments);
  });

  test('accepts a bare array body', async () => {
    const comments = [{ id: 'c_2', userId: 'u_2', text: 'yo', createdAt: 'y' }];
    mockedGet.mockResolvedValueOnce({ data: comments });

    const result = await getComments('p_1');

    expect(result).toEqual(comments);
  });

  test('returns [] for an unexpected (object, no data) body', async () => {
    mockedGet.mockResolvedValueOnce({ data: { unexpected: true } });

    const result = await getComments('p_1');

    expect(result).toEqual([]);
  });
});

describe('getMyBadges', () => {
  test('returns the array when the body is an array', async () => {
    const badges = [{ id: 'b_1', key: 'streak_7', name: '7-day streak' }];
    mockedGet.mockResolvedValueOnce({ data: badges });

    const result = await getMyBadges();

    expect(mockedGet).toHaveBeenCalledWith('/v1/community/badges/mine');
    expect(result).toEqual(badges);
  });

  test('returns [] when the body is not an array (defensive guard)', async () => {
    mockedGet.mockResolvedValueOnce({ data: { error: 'nope' } });

    const result = await getMyBadges();

    expect(result).toEqual([]);
  });
});

describe('followUser / unfollowUser', () => {
  test('followUser POSTs to the follow endpoint (idempotent)', async () => {
    mockedPost.mockResolvedValueOnce({ data: {} });

    await followUser('u_42');

    expect(mockedPost).toHaveBeenCalledWith('/v1/community/follow/u_42');
  });

  test('unfollowUser DELETEs the follow endpoint', async () => {
    mockedDelete.mockResolvedValueOnce({ data: {} });

    await unfollowUser('u_42');

    expect(mockedDelete).toHaveBeenCalledWith('/v1/community/follow/u_42');
  });
});

describe('getUserSocial', () => {
  test('GETs the social endpoint and returns the {isFollowing,followers,following} shape', async () => {
    mockedGet.mockResolvedValueOnce({ data: { isFollowing: true, followers: 12, following: 5 } });

    const result = await getUserSocial('u_7');

    expect(mockedGet).toHaveBeenCalledWith('/v1/community/users/u_7/social');
    expect(result).toEqual({ isFollowing: true, followers: 12, following: 5 });
  });

  test('unwraps a { data: {...} } envelope', async () => {
    mockedGet.mockResolvedValueOnce({ data: { data: { isFollowing: false, followers: 3, following: 9 } } });

    const result = await getUserSocial('u_7');

    expect(result).toEqual({ isFollowing: false, followers: 3, following: 9 });
  });

  test('coerces missing/garbage fields to a safe default (0 / false)', async () => {
    mockedGet.mockResolvedValueOnce({ data: { followers: 'x' } });

    const result = await getUserSocial('u_7');

    expect(result).toEqual({ isFollowing: false, followers: 0, following: 0 });
  });
});

describe('message-request delegation (chat-service endpoints)', () => {
  test('getMessageRequests GETs /v1/chat/requests and unwraps the envelope', async () => {
    const requests = [
      { id: 'c_1', userId: 'u_me', targetId: 'u_them', updatedAt: 'x', requestState: 'pending' as const },
    ];
    mockedGet.mockResolvedValueOnce({ data: { data: requests } });

    const result = await getMessageRequests();

    expect(mockedGet).toHaveBeenCalledWith('/v1/chat/requests');
    expect(result).toEqual(requests);
  });

  test('acceptRequest POSTs to the accept endpoint', async () => {
    mockedPost.mockResolvedValueOnce({ data: {} });

    await acceptRequest('c_9');

    expect(mockedPost).toHaveBeenCalledWith('/v1/chat/requests/c_9/accept');
  });

  test('declineRequest POSTs to the decline endpoint', async () => {
    mockedPost.mockResolvedValueOnce({ data: {} });

    await declineRequest('c_9');

    expect(mockedPost).toHaveBeenCalledWith('/v1/chat/requests/c_9/decline');
  });
});
