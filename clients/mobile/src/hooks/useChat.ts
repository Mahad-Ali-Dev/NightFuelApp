import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    getConversations,
    getMessages,
    sendMessage,
    createSocketConnection,
    Message,
} from '@/api/chat';
import type { Socket } from 'socket.io-client';

/**
 * WebSocket chat connection hook.
 * Manages real-time messaging with auto-reconnect.
 */
export function useChat(conversationId?: string) {
    const queryClient = useQueryClient();
    const socketRef = useRef<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    // Fetch conversation list
    const conversationsQuery = useQuery({
        queryKey: ['chat', 'conversations'],
        queryFn: getConversations,
        staleTime: 2 * 60 * 1000,
    });

    // Fetch messages for a specific conversation
    const messagesQuery = useQuery({
        queryKey: ['chat', 'messages', conversationId],
        queryFn: () => getMessages(conversationId!),
        enabled: !!conversationId,
        staleTime: 30 * 1000,
    });

    // Send message mutation
    const sendMutation = useMutation({
        mutationFn: ({ convId, text }: { convId: string; text: string }) =>
            sendMessage(convId, text),
        onSuccess: (newMessage) => {
            queryClient.setQueryData<Message[]>(
                ['chat', 'messages', newMessage.conversationId],
                (old) => [...(old ?? []), newMessage],
            );
            queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
        },
        onError: (err: any) => {
            console.error('[useChat] sendMessage failed:', err);
        },
    });

    // WebSocket connection
    const connect = useCallback(async () => {
        if (socketRef.current?.connected) return;
        try {
            const socket = await createSocketConnection();

            socket.on('connect', () => setIsConnected(true));
            socket.on('disconnect', () => setIsConnected(false));
            socket.on('new_message', (message: Message) => {
                queryClient.setQueryData<Message[]>(
                    ['chat', 'messages', message.conversationId],
                    (old) => [...(old ?? []), message],
                );
            });

            socketRef.current = socket;
        } catch {
            // Connection failed — will retry on next call
        }
    }, [queryClient]);

    const disconnect = useCallback(() => {
        socketRef.current?.disconnect();
        socketRef.current = null;
        setIsConnected(false);
    }, []);

    // Auto-connect when conversationId is provided
    useEffect(() => {
        if (conversationId) {
            connect();
        }
        return () => disconnect();
    }, [conversationId, connect, disconnect]);

    return {
        conversations: conversationsQuery.data ?? [],
        messages: messagesQuery.data ?? [],
        isLoadingConversations: conversationsQuery.isLoading,
        isLoadingMessages: messagesQuery.isLoading,
        isConnected,

        send: (text: string) => {
            if (!conversationId) return;
            return sendMutation.mutateAsync({ convId: conversationId, text });
        },
        isSending: sendMutation.isPending,

        connect,
        disconnect,
        refetchConversations: conversationsQuery.refetch,
        refetchMessages: messagesQuery.refetch,
    };
}
