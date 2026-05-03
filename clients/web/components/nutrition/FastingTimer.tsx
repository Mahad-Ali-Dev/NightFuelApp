'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Timer, Play, Pause, RotateCcw, UtensilsCrossed, Moon, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { mealApi } from '@/lib/api';

// ─── Protocols ───────────────────────────────────────────────────────────────

interface FastingProtocol {
    id: string;
    name: string;
    fastHours: number;
    eatHours: number;
    description: string;
    color: string;
}

const PROTOCOLS: FastingProtocol[] = [
    { id: '16-8', name: '16:8', fastHours: 16, eatHours: 8, description: 'Most popular — skip breakfast, eat noon to 8pm', color: 'text-emerald-400' },
    { id: '18-6', name: '18:6', fastHours: 18, eatHours: 6, description: 'Intermediate — eat 12pm to 6pm', color: 'text-blue-400' },
    { id: '20-4', name: '20:4', fastHours: 20, eatHours: 4, description: 'Warrior Diet — eat 2pm to 6pm', color: 'text-amber-400' },
    { id: '14-10', name: '14:10', fastHours: 14, eatHours: 10, description: 'Gentle — great for beginners', color: 'text-violet-400' },
];

const STORAGE_KEY = 'nightfuel-fasting-state';

interface FastingState {
    isActive: boolean;
    startTime: number | null;
    protocol: string;
}

function loadState(): FastingState {
    if (typeof window === 'undefined') return { isActive: false, startTime: null, protocol: '16-8' };
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return { isActive: false, startTime: null, protocol: '16-8' };
}

function saveState(state: FastingState) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ─── Component ───────────────────────────────────────────────────────────────

interface FastingTimerProps {
    compact?: boolean;
}

export function FastingTimer({ compact = false }: FastingTimerProps) {
    const [state, setState] = useState<FastingState>(loadState);
    const [now, setNow] = useState(Date.now());

    const protocol = PROTOCOLS.find((p) => p.id === state.protocol) ?? PROTOCOLS[0]!;
    const totalMs = protocol.fastHours * 3600 * 1000;

    // Tick every second
    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const elapsedMs = state.isActive && state.startTime ? now - state.startTime : 0;
    const remainingMs = Math.max(totalMs - elapsedMs, 0);
    const progress = Math.min(elapsedMs / totalMs, 1);
    const isComplete = progress >= 1;

    const isFasting = state.isActive && !isComplete;
    const isEatingWindow = isComplete && state.isActive;

    const formatTime = (ms: number) => {
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const startFast = useCallback(() => {
        const newState: FastingState = { isActive: true, startTime: Date.now(), protocol: state.protocol };
        setState(newState);
        saveState(newState);
        mealApi.post('/fasting/start', { targetHours: protocol.fastHours }).catch(console.error);
        toast.success(`${protocol.name} fast started!`);
    }, [state.protocol, protocol.name, protocol.fastHours]);

    const stopFast = useCallback(() => {
        const newState: FastingState = { isActive: false, startTime: null, protocol: state.protocol };
        setState(newState);
        saveState(newState);
        mealApi.post('/fasting/end').catch(console.error);
    }, [state.protocol]);

    const selectProtocol = useCallback((id: string) => {
        const newState: FastingState = { isActive: false, startTime: null, protocol: id };
        setState(newState);
        saveState(newState);
    }, []);

    // ─── Compact Mode ─────────────────────────────────────────────────────
    if (compact) {
        return (
            <motion.div
                whileHover={{ y: -2 }}
                className="glass-card p-5 rounded-2xl border-violet-500/10 bg-violet-500/5 hover:bg-violet-500/10 transition-all"
            >
                <div className="flex items-center gap-3 mb-3">
                    <div className="p-2.5 rounded-xl bg-violet-500/20">
                        <Timer size={18} className="text-violet-400" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-white font-bold text-sm">Fasting</h3>
                        <p className="text-neutral-500 text-xs">{protocol.name} protocol</p>
                    </div>
                    {state.isActive ? (
                        <span className={cn(
                            'text-[10px] font-bold px-2 py-1 rounded-full',
                            isComplete ? 'bg-emerald-500/20 text-emerald-400' : 'bg-violet-500/20 text-violet-400'
                        )}>
                            {isComplete ? 'Eat!' : 'Fasting'}
                        </span>
                    ) : (
                        <button
                            onClick={startFast}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-violet-500 text-white hover:bg-violet-600 transition-all"
                        >
                            Start
                        </button>
                    )}
                </div>

                {state.isActive && (
                    <>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-2">
                            <motion.div
                                className={cn(
                                    'h-full rounded-full',
                                    isComplete ? 'bg-emerald-500' : 'bg-gradient-to-r from-violet-500 to-purple-400'
                                )}
                                animate={{ width: `${progress * 100}%` }}
                                transition={{ duration: 0.5 }}
                            />
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-neutral-500">Elapsed: {formatTime(elapsedMs)}</span>
                            <span className="text-neutral-500">{isComplete ? 'Done!' : `Left: ${formatTime(remainingMs)}`}</span>
                        </div>
                    </>
                )}
            </motion.div>
        );
    }

    // ─── Full Mode ────────────────────────────────────────────────────────
    const circumference = 2 * Math.PI * 90; // radius 90

    return (
        <div className="space-y-6">

            {/* Protocol Selector */}
            {!state.isActive && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {PROTOCOLS.map((p) => (
                        <motion.button
                            key={p.id}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => selectProtocol(p.id)}
                            className={cn(
                                'p-4 rounded-2xl border text-left transition-all',
                                state.protocol === p.id
                                    ? 'bg-white/[0.06] border-white/15'
                                    : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.05]'
                            )}
                        >
                            <p className={cn('font-black text-lg', p.color)}>{p.name}</p>
                            <p className="text-neutral-500 text-[10px] mt-1 leading-relaxed">{p.description}</p>
                        </motion.button>
                    ))}
                </div>
            )}

            {/* Circular Timer */}
            <div className="flex flex-col items-center py-4">
                <div className="relative w-52 h-52">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                        {/* Background ring */}
                        <circle
                            cx="100" cy="100" r="90"
                            fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8"
                        />
                        {/* Progress ring */}
                        <motion.circle
                            cx="100" cy="100" r="90"
                            fill="none"
                            stroke={isComplete ? '#10b981' : '#8b5cf6'}
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            animate={{ strokeDashoffset: circumference * (1 - progress) }}
                            transition={{ duration: 0.5 }}
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {isComplete ? (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="text-center"
                            >
                                <Check size={32} className="text-emerald-400 mx-auto mb-2" />
                                <p className="text-emerald-400 font-bold text-lg">Fast Complete!</p>
                                <p className="text-neutral-500 text-xs">Eating window open</p>
                            </motion.div>
                        ) : (
                            <>
                                <p className="text-white font-black text-3xl tracking-tight">
                                    {state.isActive ? formatTime(remainingMs) : formatTime(totalMs)}
                                </p>
                                <p className="text-neutral-500 text-xs mt-1">
                                    {state.isActive ? 'remaining' : 'total fast time'}
                                </p>
                            </>
                        )}
                    </div>
                </div>

                {/* Status badges */}
                <div className="flex gap-4 mt-4">
                    <div className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold',
                        isFasting
                            ? 'bg-violet-500/15 text-violet-400 border-violet-500/20'
                            : 'bg-white/[0.03] text-neutral-600 border-white/[0.04]'
                    )}>
                        <Moon size={14} />
                        Fasting ({protocol.fastHours}h)
                    </div>
                    <div className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold',
                        isEatingWindow
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                            : 'bg-white/[0.03] text-neutral-600 border-white/[0.04]'
                    )}>
                        <UtensilsCrossed size={14} />
                        Eating ({protocol.eatHours}h)
                    </div>
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-center gap-3">
                {!state.isActive ? (
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={startFast}
                        className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-violet-500 hover:bg-violet-600 text-white font-bold text-base shadow-lg shadow-violet-500/25 transition-all"
                    >
                        <Play size={18} fill="white" /> Start {protocol.name} Fast
                    </motion.button>
                ) : (
                    <>
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={stopFast}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500/15 text-red-400 border border-red-500/20 font-bold text-sm hover:bg-red-500/25 transition-all"
                        >
                            <Pause size={16} /> End Fast
                        </motion.button>
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { stopFast(); startFast(); }}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 text-neutral-400 border border-white/10 font-bold text-sm hover:bg-white/10 transition-all"
                        >
                            <RotateCcw size={16} /> Restart
                        </motion.button>
                    </>
                )}
            </div>
        </div>
    );
}
