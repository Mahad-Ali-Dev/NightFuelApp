/**
 * Tests for the additive surface of src/api/chat.ts (the chat-UI work-item):
 *   - markRead → POST /v1/chat/conversations/:id/read
 *   - getChatRequests → GET /v1/chat/requests, tolerating { data:[...] } / bare
 *     array / unexpected-object (defensive [] fallback)
 *   - acceptChatRequest / declineChatRequest → POST the right request endpoints
 *   - sendMessageOverSocket / emitTyping → emit the correct decorated-socket
 *     frames (and no-op on a null socket)
 *
 * The pre-existing exports (getMessages/sendMessage/startConversation/etc.) are
 * intentionally unchanged, so this suite only locks the new behaviour.
 */

jest.mock('@/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import {
  markRead,
  getChatRequests,
  acceptChatRequest,
  declineChatRequest,
  sendMessageOverSocket,
  emitTyping,
} from '@/api/chat';
import { apiClient } from '@/api/client';

const mockedGet = apiClient.get as jest.Mock;
const mockedPost = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('markRead', () => {
  test('POSTs to the conversation read endpoint', async () => {
    mockedPost.mockResolvedValueOnce({ data: {} });

    await markRead('conv_1');

    expect(mockedPost).toHaveBeenCalledWith('/v1/chat/conversations/conv_1/read');
  });
});

describe('getChatRequests', () => {
  test('unwraps a { data: Conversation[] } envelope', async () => {
    const requests = [
      { id: 'c_1', userId: 'u_me', targetId: 'u_them', updatedAt: 'x', requestState: 'pending' as const },
    ];
    mockedGet.mockResolvedValueOnce({ data: { data: requests } });

    const result = await getChatRequests();

    expect(mockedGet).toHaveBeenCalledWith('/v1/chat/requests');
    expect(result).toEqual(requests);
  });

  test('accepts a bare array body', async () => {
    const requests = [{ id: 'c_2', userId: 'u_me', targetId: 'u_them', updatedAt: 'y' }];
    mockedGet.mockResolvedValueOnce({ data: requests });

    const result = await getChatRequests();

    expect(result).toEqual(requests);
  });

  test('returns [] for an unexpected (object, no data) body', async () => {
    mockedGet.mockResolvedValueOnce({ data: { unexpected: true } });

    const result = await getChatRequests();

    expect(result).toEqual([]);
  });
});

describe('acceptChatRequest / declineChatRequest', () => {
  test('accept POSTs to the accept endpoint', async () => {
    mockedPost.mockResolvedValueOnce({ data: {} });

    await acceptChatRequest('conv_9');

    expect(mockedPost).toHaveBeenCalledWith('/v1/chat/requests/conv_9/accept');
  });

  test('decline POSTs to the decline endpoint', async () => {
    mockedPost.mockResolvedValueOnce({ data: {} });

    await declineChatRequest('conv_9');

    expect(mockedPost).toHaveBeenCalledWith('/v1/chat/requests/conv_9/decline');
  });
});

describe('sendMessageOverSocket', () => {
  test('emits a send_message frame with conversationId + text', () => {
    const emit = jest.fn();
    sendMessageOverSocket({ emit }, 'conv_1', 'hello');

    expect(emit).toHaveBeenCalledWith('send_message', { conversationId: 'conv_1', text: 'hello' });
  });

  test('is a no-op when the socket is null', () => {
    // No throw, nothing emitted.
    expect(() => sendMessageOverSocket(null, 'conv_1', 'hi')).not.toThrow();
  });
});

describe('emitTyping', () => {
  test('emits typing_start when start=true', () => {
    const emit = jest.fn();
    emitTyping({ emit }, 'conv_1', true);

    expect(emit).toHaveBeenCalledWith('typing_start', { conversationId: 'conv_1' });
  });

  test('emits typing_stop when start=false', () => {
    const emit = jest.fn();
    emitTyping({ emit }, 'conv_1', false);

    expect(emit).toHaveBeenCalledWith('typing_stop', { conversationId: 'conv_1' });
  });

  test('is a no-op when the socket is undefined', () => {
    expect(() => emitTyping(undefined, 'conv_1', true)).not.toThrow();
  });
});
