'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplets, Plus, Minus, Target, Waves } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { progressApi } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WaterTrackerProps {
    /** Daily goal in ml */
    goal?: number;
    /** Compact mode for dashboard widget */
    compact?: boolean;
}

const QUICK_AMOUNTS = [250, 500, 750];

export function WaterTracker({ goal = 3000, compact = false }: WaterTrackerProps) {
    const queryClient = useQueryClient();

    // Fetch today's hydration from progress API
    const { data: todayData } = useQuery({
        queryKey: ['today-progress'],
        queryFn: async () => {
            const res = await progressApi.get('/today');
            return res.data;
        },
        staleTime: 30_000,
    });

    const currentMl = todayData?.hydrationActual ?? 0;
    const percentage = Math.min((currentMl / goal) * 100, 100);
    const remaining = Math.max(goal - currentMl, 0);
    const glasses = Math.floor(currentMl / 250);

    const mutation = useMutation({
        mutationFn: async (amount: number) => {
            const res = await progressApi.post('/hydration', { amount });
            return res.data;
        },
        onMutate: async (amount) => {
            await queryClient.cancelQueries({ queryKey: ['today-progress'] });
            const prev = queryClient.getQueryData(['today-progress']);
            queryClient.setQueryData(['today-progress'], (old: any) => ({
                ...(old ?? {}),
                hydrationActual: (old?.hydrationActual ?? 0) + amount,
            }));
            return { prev };
        },
        onError: (_err, _amount, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(['today-progress'], ctx.prev);
            toast.error('Failed to log water');
        },
        onSuccess: () => toast.success('Water logged! 💧'),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['today-progress'] }),
    });

    const addWater = (amount: number) => mutation.mutate(amount);

    // ─── Compact Widget (for Dashboard) ───────────────────────────────────
    if (compact) {
        return (
            <motion.div
                whileHover={{ y: -2 }}
                className="glass-card p-5 rounded-2xl border-blue-500/10 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500/25 transition-all cursor-pointer"
            >
                <div className="flex items-center gap-3 mb-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/20">
                        <Droplets size={18} className="text-blue-400" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-white font-bold text-sm">Hydration</h3>
                        <p className="text-neutral-500 text-xs">{currentMl}ml / {goal}ml</p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-black text-blue-400">{Math.round(percentage)}%</p>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-3">
                    <motion.div
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                    />
                </div>

                {/* Quick add buttons */}
                <div className="flex gap-2">
                    {QUICK_AMOUNTS.map((amount) => (
                        <button
                            key={amount}
                            onClick={(e) => { e.stopPropagation(); addWater(amount); }}
                            disabled={mutation.isPending}
                            className="flex-1 py-1.5 text-[10px] font-bold text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-all disabled:opacity-50"
                        >
                            +{amount}ml
                        </button>
                    ))}
                </div>
            </motion.div>
        );
    }

    // ─── Full Water Tracker ───────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Glass Visualization */}
            <div className="flex flex-col items-center">
                <div className="relative w-32 h-48 mb-4">
                    {/* Glass container */}
                    <div className="absolute inset-0 rounded-b-3xl rounded-t-xl border-2 border-blue-400/30 bg-white/[0.03] overflow-hidden">
                        {/* Water fill */}
                        <motion.div
                            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-600/60 via-blue-500/40 to-cyan-400/30"
                            initial={{ height: 0 }}
                            animate={{ height: `${percentage}%` }}
                            transition={{ duration: 1.2, ease: 'easeOut' }}
                        >
                            {/* Wave effect */}
                            <div className="absolute -top-2 left-0 right-0 h-4 overflow-hidden">
                                <motion.div
                                    className="w-[200%] h-4"
                                    animate={{ x: [0, '-50%'] }}
                                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                                >
                                    <svg viewBox="0 0 400 20" className="h-full w-full fill-blue-500/40">
                                        <path d="M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 T250 10 T300 10 T350 10 T400 10 V20 H0 Z" />
                                    </svg>
                                </motion.div>
                            </div>

                            {/* Bubbles */}
                            {percentage > 10 && (
                                <>
                                    <motion.div
                                        className="absolute bottom-2 left-6 w-2 h-2 rounded-full bg-white/20"
                                        animate={{ y: [-4, -20], opacity: [0.6, 0] }}
                                        transition={{ duration: 2, repeat: Infinity, delay: 0 }}
                                    />
                                    <motion.div
                                        className="absolute bottom-4 right-8 w-1.5 h-1.5 rounded-full bg-white/15"
                                        animate={{ y: [-4, -16], opacity: [0.4, 0] }}
                                        transition={{ duration: 1.8, repeat: Infinity, delay: 0.6 }}
                                    />
                                    <motion.div
                                        className="absolute bottom-1 left-14 w-1 h-1 rounded-full bg-white/25"
                                        animate={{ y: [-2, -12], opacity: [0.5, 0] }}
                                        transition={{ duration: 2.2, repeat: Infinity, delay: 1.2 }}
                                    />
                                </>
                            )}
                        </motion.div>

                        {/* Percentage text */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-3xl font-black text-white drop-shadow-lg">
                                {Math.round(percentage)}%
                            </span>
                        </div>
                    </div>
                </div>

                <p className="text-white font-bold text-lg">{currentMl}ml <span className="text-neutral-500 font-normal">/ {goal}ml</span></p>
                <p className="text-neutral-500 text-sm mt-1">
                    {remaining > 0
                        ? `${remaining}ml remaining · ${glasses} glasses today`
                        : '🎉 Goal reached! Great job staying hydrated!'}
                </p>
            </div>

            {/* Quick Add Buttons */}
            <div className="grid grid-cols-3 gap-3">
                {QUICK_AMOUNTS.map((amount) => (
                    <motion.button
                        key={amount}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => addWater(amount)}
                        disabled={mutation.isPending}
                        className="flex flex-col items-center gap-1.5 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all disabled:opacity-50"
                    >
                        <Droplets size={20} className="text-blue-400" />
                        <span className="text-white font-bold text-sm">+{amount}ml</span>
                        <span className="text-neutral-500 text-[10px]">{amount === 250 ? '1 Glass' : amount === 500 ? '2 Glasses' : '3 Glasses'}</span>
                    </motion.button>
                ))}
            </div>

            {/* Custom amount */}
            <CustomAmountInput onAdd={addWater} isPending={mutation.isPending} />
        </div>
    );
}

function CustomAmountInput({ onAdd, isPending }: { onAdd: (ml: number) => void; isPending: boolean }) {
    const [custom, setCustom] = useState(100);

    return (
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
            <button
                onClick={() => setCustom(Math.max(50, custom - 50))}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 transition-colors"
            >
                <Minus size={16} />
            </button>
            <div className="flex-1 text-center">
                <input
                    type="number"
                    value={custom}
                    onChange={(e) => setCustom(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-20 text-center text-white font-bold text-lg bg-transparent border-none outline-none"
                    min={0}
                    step={50}
                />
                <span className="text-neutral-500 text-xs">ml</span>
            </div>
            <button
                onClick={() => setCustom(custom + 50)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 transition-colors"
            >
                <Plus size={16} />
            </button>
            <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => onAdd(custom)}
                disabled={isPending || custom <= 0}
                className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm transition-all disabled:opacity-50"
            >
                Add
            </motion.button>
        </div>
    );
}
