'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import {
    ChevronLeft, Send, Phone, Video, MoreVertical, Search,
    Mic, Paperclip, Smile, Check, CheckCheck,
    MessageSquare, User as UserIcon, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getConversations, getMessages, sendChatMessage, startConversation } from '@/lib/api';
import { useSearchParams, useRouter } from 'next/navigation';

interface ChatMessage {
    id: string;
    text: string;
    sender: 'me' | 'them';
    time: string;
    status: 'sent' | 'delivered' | 'read';
    type: 'text' | 'audio' | 'image';
}

interface ChatContact {
    id: string;
    name: string;
    avatarUrl?: string;
    lastMessage: string;
    lastTime: string;
    online: boolean;
    unreadCount: number;
    role?: string;
}

function formatTime(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderMessageText(text: string) {
    try {
        if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
            const data = JSON.parse(text);
            if (data.coaching_message) {
                return (
                    <div className="space-y-3">
                        <p className="font-medium text-brand-400">{data.coaching_message}</p>

                        {data.hydration_goal && (
                            <div className="bg-blue-500/10 border border-blue-500/20 p-2 rounded-lg text-xs">
                                <span className="font-bold text-blue-400">💧 Hydration: </span>
                                {data.hydration_goal}
                            </div>
                        )}

                        {data.supplement_suggestions && data.supplement_suggestions.length > 0 && (
                            <div className="bg-purple-500/10 border border-purple-500/20 p-2 rounded-lg text-xs">
                                <span className="font-bold text-purple-400">💊 Supplements: </span>
                                {data.supplement_suggestions.join(', ')}
                            </div>
                        )}

                        {data.meals && data.meals.length > 0 && (
                            <div className="space-y-2 mt-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 border-b border-emerald-500/20 pb-1">Suggested Meals</p>
                                {data.meals.map((meal: any, idx: number) => (
                                    <div key={idx} className="bg-black/20 rounded p-2">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-bold text-xs text-white">{meal.name}</span>
                                            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{meal.suggested_time}</span>
                                        </div>
                                        <p className="text-[10px] text-neutral-400 mb-1.5 leading-relaxed">{meal.recommendation}</p>
                                        {meal.items && meal.items.length > 0 && (
                                            <ul className="text-[10px] space-y-0.5 ml-2 border-l border-white/10 pl-2">
                                                {meal.items.map((item: any, i: number) => (
                                                    <li key={i} className="text-neutral-300">
                                                        <span className="text-white">{item.amount}</span> {item.name}
                                                        <span className="text-neutral-500 ml-1">({item.calories} kcal)</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {data.workout_suggestion && (
                            <div className="space-y-2 mt-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-orange-400 border-b border-orange-500/20 pb-1">Workout</p>
                                <div className="bg-black/20 rounded p-2">
                                    <div className="flex justify-between items-center mb-1 align-top">
                                        <span className="font-bold text-xs text-white pb-1">{data.workout_suggestion.title}</span>
                                        <div className="flex gap-1 text-[10px] shrink-0">
                                            <span className="text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">{data.workout_suggestion.duration}m</span>
                                            <span className="text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">{data.workout_suggestion.intensity}</span>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-neutral-400 mb-1.5 italic">{data.workout_suggestion.coaching_tips}</p>
                                    {data.workout_suggestion.exercises && data.workout_suggestion.exercises.length > 0 && (
                                        <ul className="text-[10px] space-y-0.5 ml-2 border-l border-white/10 pl-2">
                                            {data.workout_suggestion.exercises.map((ex: any, i: number) => (
                                                <li key={i} className="text-neutral-300">
                                                    <span className="text-white font-medium">{ex.name}</span>
                                                    <span className="text-neutral-500 ml-1">- {ex.sets} sets x {ex.reps}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        )}

                        {data.caffeine_advice && (
                            <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg text-xs">
                                <span className="font-bold text-amber-400">☕ Caffeine: </span>
                                {data.caffeine_advice}
                            </div>
                        )}
                    </div>
                );
            }
        }
    } catch (e) {
        // Fall back to text if not parsable or incomplete
    }
    return <p className="text-sm whitespace-pre-wrap">{text}</p>;
}

function MessagesContent() {
    const queryClient = useQueryClient();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [selectedChat, setSelectedChat] = useState<string | null>(null);
    const [newMessage, setNewMessage] = useState('');
    const [search, setSearch] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const targetUserId = searchParams.get('userId');

    const createConversationMutation = useMutation({
        mutationFn: (userId: string) => startConversation(userId),
        onSuccess: (res) => {
            const newConvId = res.data.data?.id || res.data?.id;
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            if (newConvId) {
                setSelectedChat(newConvId);
                router.replace('/dashboard/messages');
            }
        }
    });

    useEffect(() => {
        if (targetUserId && !createConversationMutation.isPending && !createConversationMutation.isSuccess) {
            createConversationMutation.mutate(targetUserId);
        }
    }, [targetUserId]);

    // ─── Fetch conversations from API ─────────────────────────────────────────
    const { data: conversations = [], isLoading: loadingConversations } = useQuery({
        queryKey: ['conversations'],
        queryFn: async () => {
            try {
                const { data } = await getConversations();
                return (data || []).map((conv: any) => ({
                    id: conv.id,
                    name: conv.participantName || conv.name || 'Unknown',
                    avatarUrl: conv.avatarUrl || undefined,
                    lastMessage: conv.lastMessage || '',
                    lastTime: conv.lastMessageAt ? formatTime(conv.lastMessageAt) : '',
                    online: conv.isOnline || false,
                    unreadCount: conv.unreadCount || 0,
                    role: conv.role || undefined,
                })) as ChatContact[];
            } catch {
                return [] as ChatContact[];
            }
        },
    });

    // ─── Fetch messages for selected conversation ─────────────────────────────
    const { data: chatMessages = [], isLoading: loadingMessages } = useQuery({
        queryKey: ['messages', selectedChat],
        queryFn: async () => {
            if (!selectedChat) return [] as ChatMessage[];
            try {
                const { data } = await getMessages(selectedChat);
                return (data || []).map((msg: any) => ({
                    id: msg.id,
                    text: msg.text || msg.content || '',
                    sender: msg.isOwn ? ('me' as const) : ('them' as const),
                    time: formatTime(msg.createdAt),
                    status: (msg.status || 'sent') as 'sent' | 'delivered' | 'read',
                    type: 'text' as const,
                })) as ChatMessage[];
            } catch {
                return [] as ChatMessage[];
            }
        },
        enabled: !!selectedChat,
    });

    // ─── Send message mutation ────────────────────────────────────────────────
    const sendMutation = useMutation({
        mutationFn: ({ conversationId, text }: { conversationId: string; text: string }) =>
            sendChatMessage(conversationId, text),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', selectedChat] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
    });

    const selectedContact = conversations.find((c: ChatContact) => c.id === selectedChat);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, selectedChat]);

    const sendMessage = () => {
        if (!newMessage.trim() || !selectedChat) return;
        sendMutation.mutate({ conversationId: selectedChat, text: newMessage.trim() });
        setNewMessage('');
    };

    const filteredContacts = conversations.filter((c: ChatContact) =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    // ─── Chat List View ──────────────────────────────────────────────────────
    const ChatList = () => (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/[0.06]">
                <h1 className="text-2xl font-bold text-white mb-3">Messages</h1>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                    <input
                        type="text"
                        placeholder="Search conversations..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-zinc-500 focus:border-brand-500 outline-none"
                    />
                </div>
            </div>

            {/* Contact List */}
            <div className="flex-1 overflow-y-auto">
                {loadingConversations ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                        <Loader2 className="h-8 w-8 animate-spin mb-4 opacity-50" />
                        <p className="text-sm">Loading conversations...</p>
                    </div>
                ) : filteredContacts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                        <MessageSquare className="h-16 w-16 mb-4 opacity-30" />
                        {conversations.length === 0 ? (
                            <>
                                <p className="text-sm">No conversations yet.</p>
                                <p className="text-xs mt-1">Start chatting with coaches or other athletes.</p>
                            </>
                        ) : (
                            <>
                                <p className="text-sm">No results found.</p>
                                <p className="text-xs mt-1">Try a different search term.</p>
                            </>
                        )}
                    </div>
                ) : (
                    filteredContacts.map((contact, i) => (
                        <motion.button
                            key={contact.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                            onClick={() => setSelectedChat(contact.id)}
                            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.04] transition-all border-b border-white/[0.03]"
                        >
                            {/* Avatar */}
                            <div className="relative shrink-0">
                                <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                                    {contact.avatarUrl ? (
                                        <img src={contact.avatarUrl} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <UserIcon className="h-6 w-6 text-zinc-400" />
                                    )}
                                </div>
                                {contact.online && (
                                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-black" />
                                )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 text-left">
                                <div className="flex items-center justify-between">
                                    <p className="text-white font-semibold text-sm truncate">{contact.name}</p>
                                    <span className="text-zinc-500 text-xs shrink-0 ml-2">{contact.lastTime}</span>
                                </div>
                                <div className="flex items-center justify-between mt-0.5">
                                    <p className="text-zinc-500 text-xs truncate">{contact.lastMessage}</p>
                                    {contact.unreadCount > 0 && (
                                        <span className="bg-brand-500 text-background text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-2 shrink-0">
                                            {contact.unreadCount}
                                        </span>
                                    )}
                                </div>
                                {contact.role && (
                                    <span className="text-[10px] text-brand-400 font-medium">{contact.role}</span>
                                )}
                            </div>
                        </motion.button>
                    ))
                )}
            </div>
        </div>
    );

    // ─── Chat Room View ──────────────────────────────────────────────────────
    const ChatRoom = () => {
        if (!selectedContact) return null;

        return (
            <div className="flex flex-col h-full">
                {/* Chat Header */}
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3 bg-black/40 backdrop-blur-lg">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedChat(null)}
                        className="md:hidden text-white hover:bg-white/10 rounded-xl shrink-0"
                    >
                        <ChevronLeft size={20} />
                    </Button>

                    <div className="relative shrink-0">
                        <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                            <UserIcon className="h-5 w-5 text-zinc-400" />
                        </div>
                        {selectedContact.online && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-black" />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm">{selectedContact.name}</p>
                        <p className="text-xs text-green-400">{selectedContact.online ? 'Online' : 'Offline'}</p>
                    </div>

                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl">
                            <Video size={18} />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl">
                            <Phone size={18} />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl">
                            <MoreVertical size={18} />
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loadingMessages ? (
                        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                            <Loader2 className="h-8 w-8 animate-spin mb-4 opacity-50" />
                            <p className="text-sm">Loading messages...</p>
                        </div>
                    ) : chatMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                            <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
                            <p className="text-sm">No messages yet.</p>
                            <p className="text-xs mt-1">Send a message to start the conversation.</p>
                        </div>
                    ) : (
                        chatMessages.map((msg, i) => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ delay: i * 0.02 }}
                                className={cn(
                                    'flex',
                                    msg.sender === 'me' ? 'justify-end' : 'justify-start'
                                )}
                            >
                                <div className={cn(
                                    'max-w-[75%] px-4 py-2.5 rounded-2xl',
                                    msg.sender === 'me'
                                        ? 'bg-brand-500 text-background rounded-br-md'
                                        : 'bg-white/10 text-white rounded-bl-md'
                                )}>
                                    {renderMessageText(msg.text)}
                                    <div className={cn(
                                        'flex items-center gap-1 mt-1',
                                        msg.sender === 'me' ? 'justify-end' : 'justify-start'
                                    )}>
                                        <span className="text-[10px] opacity-60">{msg.time}</span>
                                        {msg.sender === 'me' && (
                                            msg.status === 'read' ? <CheckCheck size={12} className="text-blue-300" /> :
                                                msg.status === 'delivered' ? <CheckCheck size={12} className="opacity-60" /> :
                                                    <Check size={12} className="opacity-60" />
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Bar */}
                <div className="px-3 py-3 border-t border-white/[0.06] bg-black/40 backdrop-blur-lg">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white shrink-0 rounded-xl">
                            <Smile size={20} />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white shrink-0 rounded-xl">
                            <Paperclip size={20} />
                        </Button>
                        <input
                            type="text"
                            placeholder="Type a message..."
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && sendMessage()}
                            className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-full text-white text-sm placeholder-zinc-500 focus:border-brand-500 outline-none"
                        />
                        {newMessage.trim() ? (
                            <Button
                                onClick={sendMessage}
                                size="icon"
                                disabled={sendMutation.isPending}
                                className="bg-brand-500 hover:bg-brand-600 text-background rounded-full shrink-0"
                            >
                                {sendMutation.isPending ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <Send size={16} />
                                )}
                            </Button>
                        ) : (
                            <Button
                                onClick={() => setIsRecording(!isRecording)}
                                size="icon"
                                className={cn(
                                    'rounded-full shrink-0',
                                    isRecording ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-brand-500 hover:bg-brand-600 text-background'
                                )}
                            >
                                <Mic size={16} />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="h-[calc(100vh-64px)] md:h-screen flex bg-transparent">
            {/* Desktop: Side-by-side layout */}
            <div className={cn(
                'w-full md:w-[340px] md:border-r md:border-white/[0.06] shrink-0',
                selectedChat && 'hidden md:block'
            )}>
                <ChatList />
            </div>
            <div className={cn(
                'flex-1',
                !selectedChat && 'hidden md:flex md:items-center md:justify-center'
            )}>
                {selectedChat ? (
                    <ChatRoom />
                ) : (
                    <div className="text-center text-zinc-500">
                        <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-30" />
                        <p className="text-sm">Select a conversation to start chatting</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function MessagesPage() {
    return (
        <Suspense fallback={
            <div className="h-[calc(100vh-64px)] md:h-screen flex items-center justify-center text-zinc-500">
                <Loader2 className="h-8 w-8 animate-spin opacity-50" />
            </div>
        }>
            <MessagesContent />
        </Suspense>
    );
}
