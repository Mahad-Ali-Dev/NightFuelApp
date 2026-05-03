'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    ChevronLeft, Send, CheckCircle2,
    Video, Phone, MoreVertical, Paperclip, Smile
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'coach';
    timestamp: string;
    status?: 'sent' | 'delivered' | 'read';
}

const COACH_PROFILES = {
    'coach-1': { name: 'Sarah Jenkins', role: 'Strength & Conditioning', avatar: 'SJ', isOnline: true },
    'coach-2': { name: 'Marcus Thorne', role: 'Hypertrophy Specialist', avatar: 'MT', isOnline: false },
    'coach-3': { name: 'Elena Velez', role: 'HIIT Trainer', avatar: 'EV', isOnline: true },
} as const;

type CoachId = keyof typeof COACH_PROFILES;

// ─── Inner component: contains useSearchParams() ──────────────────────────────
function CoachChatInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const coachId = (searchParams?.get('coach') ?? 'coach-1') as CoachId;
    const coach = COACH_PROFILES[coachId] ?? COACH_PROFILES['coach-1']!;

    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        { id: '1', text: 'Hey! I saw you just signed up for the 12-week powerlifting prep.', sender: 'coach', timestamp: '10:42 AM' },
        { id: '2', text: 'Before I build your block, what does your current squat 1RM look like?', sender: 'coach', timestamp: '10:43 AM' },
        { id: '3', text: 'Hi Sarah! Thanks for reaching out. My current max is 140kg, but I struggled with depth on the last rep.', sender: 'user', timestamp: '11:15 AM', status: 'read' },
        { id: '4', text: 'Got it. We will incorporate some pause squats and pin squats to build power out of the hole.', sender: 'coach', timestamp: '11:20 AM' },
    ]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        try {
            const ws = new WebSocket(`ws://localhost:3014/v1/chat/ws`);
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data as string) as { type: string };
                if (data.type === 'new_message') {
                    // Full implementation would append incoming messages here
                }
            };
            wsRef.current = ws;
            return () => ws.close();
        } catch (err) {
            console.error('Failed to connect to chat websocket', err);
        }
    }, [coachId]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const newMsg: Message = {
            id: Date.now().toString(),
            text: input,
            sender: 'user',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'sent',
        };

        setMessages((prev) => [...prev, newMsg]);
        setInput('');

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'send_message',
                conversationId: `conv-${coachId}-user`,
                senderId: 'user-id',
                text: input,
            }));
        }

        setTimeout(() => {
            setMessages((prev) =>
                prev.map((m) => (m.id === newMsg.id ? { ...m, status: 'delivered' } : m)),
            );
        }, 800);

        setTimeout(() => {
            setMessages((prev) =>
                prev.map((m) => (m.id === newMsg.id ? { ...m, status: 'read' } : m)),
            );
        }, 1500);

        setTimeout(() => {
            const reply: Message = {
                id: (Date.now() + 1).toString(),
                text: 'Sounds like a solid plan. Let me review your recent form videos.',
                sender: 'coach',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            setMessages((prev) => [...prev, reply]);
        }, 3000);
    };

    return (
        <div className="min-h-screen bg-transparent p-0 md:p-8 flex flex-col md:block">
            <div className="max-w-4xl mx-auto flex-1 md:glass-card md:rounded-3xl border-0 md:border md:border-white/[0.04] overflow-hidden flex flex-col h-[100dvh] md:h-[85vh]">

                {/* Chat Header */}
                <header className="bg-white/[0.02] border-b border-white/[0.06] p-4 flex items-center justify-between shrink-0 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-neutral-400 hover:text-white shrink-0">
                            <ChevronLeft size={20} />
                        </Button>
                        <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-brand-500/20 text-brand-400 font-bold flex items-center justify-center border border-white/10 shrink-0">
                                {coach.avatar}
                            </div>
                            {coach.isOnline && (
                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background" />
                            )}
                        </div>
                        <div>
                            <h2 className="text-white font-bold leading-tight">{coach.name}</h2>
                            <p className="text-xs text-neutral-500">{coach.role}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="text-neutral-400 hover:text-white rounded-full hidden sm:flex">
                            <Phone size={18} />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-neutral-400 hover:text-brand-400 rounded-full">
                            <Video size={18} />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-neutral-400 hover:text-white rounded-full">
                            <MoreVertical size={18} />
                        </Button>
                    </div>
                </header>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-black/20">
                    <div className="text-center mb-8">
                        <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest bg-white/5 inline-block px-3 py-1 rounded-full">
                            Today
                        </p>
                    </div>

                    {messages.map((msg, i) => {
                        const isUser = msg.sender === 'user';
                        const showAvatar = !isUser && (i === 0 || messages[i - 1]?.sender !== 'coach');
                        return (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}
                            >
                                <div className="flex gap-2 max-w-[85%] md:max-w-[70%]">
                                    {!isUser && (
                                        <div className="w-8 shrink-0">
                                            {showAvatar && (
                                                <div className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-400 font-bold flex items-center justify-center border border-white/10 text-xs">
                                                    {coach.avatar}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className={cn(
                                        'px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                                        isUser
                                            ? 'bg-brand-500 text-white rounded-tr-sm shadow-sm shadow-brand-500/20'
                                            : 'bg-white/[0.06] border border-white/[0.04] text-neutral-100 rounded-tl-sm',
                                    )}>
                                        {msg.text}
                                    </div>
                                </div>
                                <div className={cn('flex items-center gap-1 mt-1 px-1', isUser ? 'pr-2' : 'pl-11')}>
                                    <span className="text-[10px] text-neutral-500 font-medium">{msg.timestamp}</span>
                                    {isUser && msg.status && (
                                        <CheckCircle2
                                            size={10}
                                            className={msg.status === 'read' ? 'text-brand-400' : 'text-neutral-600'}
                                        />
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="p-4 bg-white/[0.02] border-t border-white/[0.06] shrink-0">
                    <form onSubmit={handleSend} className="flex items-end gap-2 max-w-4xl mx-auto">
                        <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl flex items-center focus-within:border-brand-500/50 focus-within:bg-white/10 transition-colors">
                            <button type="button" className="p-3 text-neutral-400 hover:text-white transition-colors">
                                <Paperclip size={18} />
                            </button>
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Message your coach..."
                                className="flex-1 bg-transparent border-none text-white text-sm focus:outline-none py-3"
                            />
                            <button type="button" className="p-3 text-neutral-400 hover:text-white transition-colors">
                                <Smile size={18} />
                            </button>
                        </div>
                        <Button
                            type="submit"
                            disabled={!input.trim()}
                            className={cn(
                                'rounded-2xl h-[46px] w-[46px] shrink-0 p-0 flex items-center justify-center transition-all',
                                input.trim() ? 'bg-brand-500 hover:bg-brand-600 text-white' : 'bg-white/5 text-neutral-500',
                            )}
                        >
                            <Send size={18} className={cn('ml-0.5', input.trim() && 'text-white')} />
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────
function ChatSkeleton() {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );
}

// ─── Page export: Suspense wraps the useSearchParams consumer ─────────────────
export default function CoachChatPage() {
    return (
        <Suspense fallback={<ChatSkeleton />}>
            <CoachChatInner />
        </Suspense>
    );
}
