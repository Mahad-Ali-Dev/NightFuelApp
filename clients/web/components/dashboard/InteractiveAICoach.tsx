'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/auth-context';
import { chatWithCoach } from '@/lib/api';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, X, Send, Loader2, MessageSquare, RefreshCw, AlertTriangle, Moon, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'error';
    content: string;
    timestamp?: number;
}

// ─── Suggested prompts ────────────────────────────────────────────────────────
const SUGGESTIONS = [
    { icon: Moon, text: 'What should I eat on a night shift?' },
    { icon: Zap, text: 'How do I boost energy without caffeine?' },
    { icon: Sparkles, text: 'Create a meal plan for my shift' },
];

// ─── Offline fallback responses ───────────────────────────────────────────────
const OFFLINE_RESPONSES = [
    "I'm currently offline, but here's a general tip: for night shifts, eat a protein-rich meal before your shift starts and keep healthy snacks like nuts and fruits handy.",
    "The AI service is temporarily unavailable. Quick tip: avoid heavy carbs mid-shift — they can spike your blood sugar and cause a crash around 3-4 AM.",
    "I'm having trouble connecting right now. General advice: stay hydrated during night shifts. Dehydration is a major contributor to fatigue and brain fog.",
    "Service is temporarily down. Night shift nutrition tip: your body's insulin sensitivity is lower at night — prioritize fiber and protein over simple carbs.",
];

let offlineIndex = 0;
const getOfflineResponse = () => {
    const r = OFFLINE_RESPONSES[offlineIndex % OFFLINE_RESPONSES.length];
    offlineIndex++;
    return r + '\n\n*(AI service temporarily offline — this is a cached response)*';
};

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: ChatMessage }) {
    if (msg.role === 'user') {
        return (
            <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm bg-brand-500 text-white">
                    {msg.content}
                </div>
            </div>
        );
    }

    if (msg.role === 'error') {
        return (
            <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm bg-red-500/10 border border-red-500/20 text-red-300 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                    <span>{msg.content}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm bg-white/10 border border-white/5 text-neutral-200 whitespace-pre-wrap leading-relaxed">
                {msg.content}
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function InteractiveAICoach() {
    const { user, isAuthenticated } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [mounted, setMounted] = useState(false);
    const [unread, setUnread] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Prevent hydration mismatch
    useEffect(() => { setMounted(true); }, []);

    // Initial greeting when first opened
    useEffect(() => {
        if (isOpen && messages.length === 0 && user) {
            const name = user.email?.split('@')[0] ?? 'there';
            setMessages([{
                id: 'greeting',
                role: 'assistant',
                content: `Hey ${name}! I'm Ria, your AI nutrition & fitness coach. 🌙\n\nI specialize in helping night shift workers stay healthy, energized, and on track with their goals. What can I help you with today?`,
                timestamp: Date.now(),
            }]);
        }
    }, [isOpen, messages.length, user]);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [messages]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 200);
            setUnread(0);
        }
    }, [isOpen]);

    // ── Chat mutation ──────────────────────────────────────────────────────────
    const chatMutation = useMutation({
        mutationFn: async (text: string) => {
            if (!user) throw new Error('Not authenticated');

            const history = messages
                .filter(m => m.role !== 'error')
                .slice(-10) // last 10 messages for context window
                .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

            const context = {
                shiftType: user.currentShiftId ? 'WORKING' : 'OFF',
                primaryGoal: user.primaryGoal ?? 'general_health',
                dietaryPreference: user.dietaryPreference ?? 'ANY',
            };

            const res = await chatWithCoach({ userId: user.id, message: text, history, context });
            return res.data;
        },
        onSuccess: (data) => {
            const reply = data?.reply ?? data?.message ?? 'I received your message but had trouble forming a response. Please try again.';
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: reply,
                timestamp: Date.now(),
            }]);
            if (!isOpen) setUnread(u => u + 1);
        },
        onError: (err: any) => {
            // Check if it's a network/service error → use offline fallback
            const isServiceDown = !err.response || err.response?.status >= 500;

            if (isServiceDown) {
                // Graceful degradation with cached response
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: getOfflineResponse(),
                    timestamp: Date.now(),
                }]);
            } else {
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'error',
                    content: 'Failed to reach Ria. Please check your connection and try again.',
                    timestamp: Date.now(),
                }]);
                toast.error('AI Coach unavailable', { description: 'Please try again in a moment.' });
            }
        },
    });

    // ── Send handler ───────────────────────────────────────────────────────────
    const handleSend = useCallback((text?: string) => {
        const message = (text ?? inputValue).trim();
        if (!message || chatMutation.isPending) return;

        setInputValue('');
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'user',
            content: message,
            timestamp: Date.now(),
        }]);
        chatMutation.mutate(message);
    }, [inputValue, chatMutation]);

    // ── Clear chat ─────────────────────────────────────────────────────────────
    const handleClear = () => {
        setMessages([]);
        toast.success('Chat cleared');
    };

    if (!mounted || !isAuthenticated) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {/* ── Chat Window ───────────────────────────────────────────────── */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.96 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="mb-4 w-[360px] sm:w-[400px] bg-neutral-900/95 border border-white/10 shadow-2xl rounded-2xl overflow-hidden flex flex-col"
                        style={{ height: '520px', maxHeight: 'calc(100dvh - 120px)' }}
                    >
                        {/* Header */}
                        <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-gradient-to-r from-brand-900/60 to-indigo-900/60 border-b border-white/10">
                            <div className="flex items-center gap-3">
                                <div className="relative h-10 w-10 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
                                    <Sparkles className="h-4 w-4 text-brand-400" />
                                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-neutral-900" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white leading-none">Ria Coach</h3>
                                    <p className="text-[10px] text-emerald-400 mt-0.5">AI • Night Shift Specialist</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-neutral-500 hover:text-neutral-300 hover:bg-white/10 rounded-lg"
                                    onClick={handleClear}
                                    title="Clear chat"
                                >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full"
                                    onClick={() => setIsOpen(false)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto px-4 py-4 space-y-3 hide-scrollbar bg-neutral-950/50"
                        >
                            {messages.map(msg => (
                                <MessageBubble key={msg.id} msg={msg} />
                            ))}

                            {/* Typing indicator */}
                            {chatMutation.isPending && (
                                <div className="flex justify-start">
                                    <div className="bg-white/10 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                        <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                        <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Suggestion chips — show only when no user messages yet */}
                        {messages.length <= 1 && (
                            <div className="shrink-0 px-4 pb-3 flex gap-2 overflow-x-auto hide-scrollbar">
                                {SUGGESTIONS.map(({ icon: Icon, text }) => (
                                    <button
                                        key={text}
                                        onClick={() => handleSend(text)}
                                        className="shrink-0 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-neutral-400 hover:text-brand-300 hover:border-brand-500/30 transition-colors"
                                    >
                                        <Icon className="h-3 w-3" />
                                        {text}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Input */}
                        <div className="shrink-0 px-3 pb-3 pt-2 border-t border-white/10 bg-neutral-900">
                            <form
                                onSubmit={e => { e.preventDefault(); handleSend(); }}
                                className="flex gap-2 items-center rounded-full bg-black/50 border border-white/10 pl-4 pr-1 py-1"
                            >
                                <Input
                                    ref={inputRef}
                                    value={inputValue}
                                    onChange={e => setInputValue(e.target.value)}
                                    placeholder="Ask Ria anything..."
                                    className="border-0 bg-transparent text-sm h-9 p-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-neutral-600 text-white flex-1"
                                    disabled={chatMutation.isPending}
                                />
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={!inputValue.trim() || chatMutation.isPending}
                                    className="h-8 w-8 rounded-full shrink-0 bg-brand-500 hover:bg-brand-400 text-white disabled:opacity-30 transition-all hover:scale-105 active:scale-95"
                                >
                                    {chatMutation.isPending
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <Send className="h-3.5 w-3.5 ml-0.5" />
                                    }
                                </Button>
                            </form>
                            <p className="text-center mt-2 text-[9px] text-neutral-700">
                                AI responses may be inaccurate. Not medical advice.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── FAB Button ─────────────────────────────────────────────────── */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { setIsOpen(!isOpen); setUnread(0); }}
                className="group relative h-14 w-14 rounded-full bg-brand-500 text-white flex items-center justify-center shadow-xl shadow-brand-500/30 overflow-hidden"
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-brand-600 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <AnimatePresence mode="wait">
                    {isOpen
                        ? <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} className="relative z-10">
                            <X className="h-5 w-5" />
                        </motion.div>
                        : <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} className="relative z-10">
                            <MessageSquare className="h-5 w-5" />
                        </motion.div>
                    }
                </AnimatePresence>

                {/* Unread badge */}
                {unread > 0 && !isOpen && (
                    <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 border-2 border-neutral-900 text-[10px] font-bold flex items-center justify-center z-20"
                    >
                        {unread}
                    </motion.span>
                )}
            </motion.button>
        </div>
    );
}
