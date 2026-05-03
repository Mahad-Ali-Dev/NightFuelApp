import { apiClient } from './client';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  targetId: string;
  updatedAt: string;
}

export async function getCoachDirectory() {
  const { data } = await apiClient.get('/v1/coaches/directory');
  return data;
}

export async function getConversations() {
  const { data } = await apiClient.get<{ data: Conversation[] }>('/v1/coaches/conversations');
  return data.data;
}

export async function getMessages(conversationId: string) {
  const { data } = await apiClient.get<{ data: ChatMessage[] }>(`/v1/coaches/conversations/${conversationId}/messages`);
  return data.data;
}

export async function sendMessage(conversationId: string, text: string) {
  const { data } = await apiClient.post<{ data: ChatMessage }>(`/v1/coaches/conversations/${conversationId}/messages`, { text });
  return data.data;
}

// ---------------------------------------------------------------------------
// Aliases & stubs expected by hooks
// ---------------------------------------------------------------------------

/** Alias type for hooks */
export type Message = ChatMessage;

/** Start a new conversation */
export async function startConversation(targetId: string) {
  const { data } = await apiClient.post<{ data: { id: string } }>('/v1/coaches/conversations', { targetId });
  return data.data;
}

// ── Ria AI Persistent Chat API ────────────────────────────────────────────────

export interface RiaMessage {
  id: string;
  text: string;
  sender: 'ai' | 'user';
  isOwn: boolean;
  createdAt: string;
  status: 'read' | 'delivered';
}

export interface RiaSendResult {
  conversationId: string;
  reply: string;
  userMsgId: string;
  aiMsgId: string;
}

/** Load persistent Ria chat history from the database */
export async function getRiaMessages(limit = 50): Promise<RiaMessage[]> {
  const { data } = await apiClient.get<{ data: RiaMessage[] }>('/v1/chat/ria/messages', { params: { limit } });
  return data.data ?? [];
}

/** Send a message to Ria and receive an AI response (persisted in DB) */
export async function sendRiaMessage(message: string, context?: Record<string, unknown>): Promise<RiaSendResult> {
  const { data } = await apiClient.post<RiaSendResult>('/v1/chat/ria/send', { message, context });
  return data;
}

/** Create a real WebSocket connection through the Nginx gateway or local API. */
export async function createSocketConnection() {
  const token = await (await import('./client')).getAccessToken();
  let baseUrl = (await import('./client')).API_BASE_URL;

  // Convert http/https to ws/wss
  baseUrl = baseUrl.replace(/^http/, 'ws');

  // Append standard Fastify websocket path
  const wsUrl = `${baseUrl}/v1/chat/ws`;

  // Provide token as subprotocol or query param depending on backend
  // For standard Fastify, sending it as Authorization header is hard in browser WebSockets,
  // but React Native WebSocket supports headers.
  // React Native WebSocket supports a 3rd `options` arg for custom headers.
  // The standard TS lib types don't include it, so we cast the constructor.
  const RNWebSocket = WebSocket as any;
  const socket: WebSocket = new RNWebSocket(wsUrl, undefined, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Mock Socket.IO `.on` and `.emit` interface so the UI code doesn't break
  const handlers: Record<string, Function[]> = {};

  const decoratedSocket = {
    on: (event: string, callback: Function) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(callback);
    },
    emit: (event: string, payload: any) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: event, ...payload }));
      }
    },
    disconnect: () => {
      socket.close();
    }
  };

  socket.onopen = () => {
    if (handlers['connect']) handlers['connect'].forEach(cb => cb());
  };

  socket.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'new_message' && handlers['newMessage']) {
        handlers['newMessage'].forEach(cb => cb(data.data));
      }
    } catch (err) {
      console.warn('Failed to parse websocket message', err);
    }
  };

  socket.onclose = () => {
    if (handlers['disconnect']) handlers['disconnect'].forEach(cb => cb());
  };

  return decoratedSocket as any; // Cast as any because the UI expects Socket from 'socket.io-client'
}
