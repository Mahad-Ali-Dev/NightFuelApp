import { apiClient } from './client';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  /**
   * BUG #2: the sender's resolved display name, when the backend can resolve it.
   * Present on message responses + 'new_message' socket frames. The UI prefers
   * this over senderId so a bubble never renders a raw id; when it is absent the
   * UI falls back to the conversation peer's name (resolved by senderId).
   */
  senderName?: string;
  text: string;
  createdAt: string;
  /** Present on GET /messages — true when the row was sent by the current user. */
  isOwn?: boolean;
}

/**
 * Lifecycle of an Instagram-DM-style 1:1 conversation (SOCIAL API CONTRACT):
 * a conversation between two not-yet-accepted users is a REQUEST — the requester
 * may send exactly ONE message until the recipient accepts. Coach/existing convos
 * default to 'accepted'.
 */
export type RequestState = 'pending' | 'accepted' | 'declined';

/**
 * The OTHER participant of a conversation, as returned alongside requestState by
 * GET conversations (per the SOCIAL API CONTRACT). `avatarUrl` may be absent/null.
 */
export interface ChatPeer {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface Conversation {
  id: string;
  userId: string;
  targetId: string;
  updatedAt: string;
  /**
   * Additive (SOCIAL API CONTRACT): request lifecycle + the peer descriptor.
   * Optional so existing coach-conversation payloads (which omit them) still
   * satisfy the type; the UI treats a missing requestState as 'accepted'.
   */
  requestState?: RequestState;
  peer?: ChatPeer;
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

/**
 * BUG #2: shape of a `notification:new` realtime frame (notification-service's
 * persisted Notification row). Only the fields the chat screen reacts to are
 * typed; everything is optional so a partial/forwarded frame never throws.
 */
export interface NotificationNewPayload {
  id?: string;
  type?: string;
  title?: string;
  body?: string;
  data?: { conversationId?: string; deepLink?: string; [k: string]: unknown };
}

/** Start a new conversation */
export async function startConversation(targetId: string) {
  const { data } = await apiClient.post<{ data: { id: string } }>('/v1/coaches/conversations', { targetUserId: targetId });
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
    // Additive: socket.io exposes `.off` to detach a listener. The previous
    // decorator only had on/emit/disconnect; existing consumers (useChat.ts)
    // don't call off, so adding it is backward-compatible. The optimistic-send
    // path uses it to detach its one-shot ack listener after reconciliation.
    off: (event: string, callback: Function) => {
      const list = handlers[event];
      if (!list) return;
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
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
      // new_message: the server ack/broadcast of a persisted message.
      if (data.type === 'new_message' && handlers['newMessage']) {
        handlers['newMessage'].forEach(cb => cb(data.data));
      }
      // BUG #2: notification:new — an incoming notification (e.g. a direct message
      // the recipient just received). notification-service emits this over its own
      // Socket.IO transport, but socket.io-client is stubbed out in this app
      // (metro.config.js → socket-io-stub), so we ALSO recognise the frame here in
      // case it is forwarded over the chat WebSocket. Subscribers use it to refresh
      // their Unread state. Forwarding the payload verbatim; the screen filters.
      else if (data.type === 'notification:new' && handlers['notification:new']) {
        handlers['notification:new'].forEach(cb => cb(data.data ?? data));
      }
      // Presence: peer started/stopped typing. The frame carries the
      // conversationId (and senderId) so a multi-conversation socket can route
      // it; we pass the whole payload through and let the screen filter.
      else if (data.type === 'typing_start' && handlers['typing_start']) {
        handlers['typing_start'].forEach(cb => cb(data.data ?? data));
      }
      else if (data.type === 'typing_stop' && handlers['typing_stop']) {
        handlers['typing_stop'].forEach(cb => cb(data.data ?? data));
      }
      // Read receipts: the peer read up to/including some message(s) in a
      // conversation. Payload shape is owned by the backend (item-1); we forward
      // it verbatim so the screen can flip its own bubbles to 'read'.
      else if (data.type === 'message_read' && handlers['message_read']) {
        handlers['message_read'].forEach(cb => cb(data.data ?? data));
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

// ── Realtime emit helpers (additive) ──────────────────────────────────────────
// These accept the decorated socket returned by createSocketConnection (typed as
// `any` since the UI imports it as a socket.io-client Socket). Each just calls
// `.emit(type, payload)` — the decorator serialises that to the wire frame
// `{ type, ...payload }` the chat-service expects. Sender identity is always
// derived server-side from the JWT, so we never include it here.

/** Minimal shape we rely on from the decorated socket — just `emit`. */
type EmitSocket = { emit: (event: string, payload?: Record<string, unknown>) => void };

/**
 * Send a chat message over the WebSocket (optimistic-send path). Mirrors the
 * `send_message` frame the chat-service validates: `{ type:'send_message',
 * conversationId, text }`. The server replies with a `new_message` frame the
 * caller reconciles its optimistic bubble against.
 */
export function sendMessageOverSocket(socket: EmitSocket | null | undefined, conversationId: string, text: string): void {
  if (!socket) return;
  socket.emit('send_message', { conversationId, text });
}

/**
 * Emit a typing presence frame. `start` picks `typing_start` vs `typing_stop`.
 * Debounced by the caller (a ~1.5s idle timer fires typing_stop). The backend
 * (item-1) broadcasts the matching frame to the peer.
 */
export function emitTyping(socket: EmitSocket | null | undefined, conversationId: string, start: boolean): void {
  if (!socket) return;
  socket.emit(start ? 'typing_start' : 'typing_stop', { conversationId });
}

/**
 * Mark a conversation read (REST). POST /v1/chat/conversations/:id/read — the
 * backend records the read watermark and broadcasts a `message_read` frame to
 * the peer so their own bubbles flip to the read tick.
 */
export async function markRead(conversationId: string): Promise<void> {
  await apiClient.post(`/v1/chat/conversations/${conversationId}/read`);
}

// ── Message-request endpoints (SOCIAL API CONTRACT — Instagram-DM style) ───────
// A pending 1:1 conversation is a REQUEST: the requester may send exactly one
// message; further sends 409 with { error:'request_pending' } until accepted.

/**
 * Incoming pending message requests for the current user.
 * GET /v1/chat/requests. Tolerates a `{ data: [...] }` envelope or a bare array.
 */
export async function getChatRequests(): Promise<Conversation[]> {
  const { data } = await apiClient.get<{ data?: Conversation[] } | Conversation[]>('/v1/chat/requests');
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.data) ? data.data : [];
}

/**
 * Accept an incoming message request (the recipient action). Flips the
 * conversation's requestState to 'accepted' and unlocks the composer for both.
 * POST /v1/chat/requests/:conversationId/accept.
 */
export async function acceptChatRequest(conversationId: string): Promise<void> {
  await apiClient.post(`/v1/chat/requests/${conversationId}/accept`);
}

/**
 * Decline an incoming message request (the recipient action).
 * POST /v1/chat/requests/:conversationId/decline.
 */
export async function declineChatRequest(conversationId: string): Promise<void> {
  await apiClient.post(`/v1/chat/requests/${conversationId}/decline`);
}
