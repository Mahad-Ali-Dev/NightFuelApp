'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { getRecentWorkouts, getExerciseHeatmap } from '@/lib/api';
import {
    ChevronLeft, ChevronRight, TrendingUp, Timer, Weight, Calendar,
    ChevronDown, Dumbbell, Scale
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Body Heatmap SVG Component ──────────────────────────────────────────────
function BodyHeatmap({ muscleData }: { muscleData: Record<string, number> }) {
    const getColor = (muscle: string) => {
        const val = muscleData[muscle] || 0;
        if (val === 0) return '#1e293b';
        if (val <= 2) return '#3b82f680';
        if (val <= 5) return '#3b82f6';
        return '#1d4ed8';
    };

    const muscles = [
        { id: 'chest', label: 'Chest', x: 85, y: 90, w: 50, h: 30 },
        { id: 'abs', label: 'Abs', x: 90, y: 125, w: 40, h: 45 },
        { id: 'shoulders', label: 'Shoulders', x: 60, y: 70, w: 100, h: 20 },
        { id: 'biceps', label: 'Biceps', x: 55, y: 100, w: 20, h: 35 },
        { id: 'biceps_r', label: 'Biceps R', x: 145, y: 100, w: 20, h: 35 },
        { id: 'quadriceps', label: 'Quads', x: 75, y: 180, w: 25, h: 50 },
        { id: 'quadriceps_r', label: 'Quads R', x: 120, y: 180, w: 25, h: 50 },
        { id: 'calves', label: 'Calves', x: 78, y: 240, w: 20, h: 35 },
        { id: 'calves_r', label: 'Calves R', x: 122, y: 240, w: 20, h: 35 },
    ];

    const backMuscles = [
        { id: 'back', label: 'Back', x: 285, y: 85, w: 50, h: 40 },
        { id: 'triceps', label: 'Triceps', x: 255, y: 100, w: 20, h: 35 },
        { id: 'triceps_r', label: 'Triceps R', x: 345, y: 100, w: 20, h: 35 },
        { id: 'glutes', label: 'Glutes', x: 280, y: 150, w: 60, h: 30 },
        { id: 'hamstrings', label: 'Hams', x: 275, y: 190, w: 25, h: 45 },
        { id: 'hamstrings_r', label: 'Hams R', x: 320, y: 190, w: 25, h: 45 },
    ];

    return (
        <div className="flex items-center justify-center gap-8 py-4">
            <svg width="200" height="300" viewBox="0 0 220 300" className="opacity-90">
                {/* Body outline - Front */}
                <ellipse cx="110" cy="30" rx="25" ry="30" fill="#334155" stroke="#475569" strokeWidth="1" />
                <rect x="70" y="60" rx="15" width="80" height="120" fill="#334155" stroke="#475569" strokeWidth="1" />
                <rect x="50" y="65" rx="8" width="25" height="80" fill="#334155" stroke="#475569" strokeWidth="1" />
                <rect x="145" y="65" rx="8" width="25" height="80" fill="#334155" stroke="#475569" strokeWidth="1" />
                <rect x="75" y="175" rx="10" width="28" height="100" fill="#334155" stroke="#475569" strokeWidth="1" />
                <rect x="117" y="175" rx="10" width="28" height="100" fill="#334155" stroke="#475569" strokeWidth="1" />
                {/* Muscle overlays */}
                {muscles.map(m => (
                    <rect
                        key={m.id}
                        x={m.x} y={m.y} width={m.w} height={m.h}
                        rx="6"
                        fill={getColor(m.id.replace('_r', ''))}
                        opacity="0.8"
                    />
                ))}
            </svg>
            <svg width="200" height="300" viewBox="200 0 220 300" className="opacity-90">
                {/* Body outline - Back */}
                <ellipse cx="310" cy="30" rx="25" ry="30" fill="#334155" stroke="#475569" strokeWidth="1" />
                <rect x="270" y="60" rx="15" width="80" height="120" fill="#334155" stroke="#475569" strokeWidth="1" />
                <rect x="250" y="65" rx="8" width="25" height="80" fill="#334155" stroke="#475569" strokeWidth="1" />
                <rect x="345" y="65" rx="8" width="25" height="80" fill="#334155" stroke="#475569" strokeWidth="1" />
                <rect x="275" y="175" rx="10" width="28" height="100" fill="#334155" stroke="#475569" strokeWidth="1" />
                <rect x="317" y="175" rx="10" width="28" height="100" fill="#334155" stroke="#475569" strokeWidth="1" />
                {backMuscles.map(m => (
                    <rect
                        key={m.id}
                        x={m.x} y={m.y} width={m.w} height={m.h}
                        rx="6"
                        fill={getColor(m.id.replace('_r', ''))}
                        opacity="0.8"
                    />
                ))}
            </svg>
        </div>
    );
}

// ─── Workout Chart ───────────────────────────────────────────────────────────
function WeeklyChart({ data }: { data: number[] }) {
    const max = Math.max(...data, 1);
    const weeks = ['5 JAN', '12 JAN', '19 JAN', '26 JAN', '2 FEB', '9 FEB', '16 FEB', '23 FEB'];
    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-zinc-400 text-xs mb-1">2026</p>
            <p className="text-white font-semibold text-sm mb-4">Workout times per week</p>
            <div className="flex items-end justify-between gap-2 h-32">
                {data.map((val, i) => (
                    <div key={i} className="flex flex-col items-center gap-1 flex-1">
                        <span className="text-xs text-white font-bold">{val > 0 ? val : ''}</span>
                        <div
                            className="w-full rounded-t-md bg-brand-500 transition-all"
                            style={{ height: `${(val / max) * 100}%`, minHeight: val > 0 ? '4px' : '0px' }}
                        />
                        <span className="text-[9px] text-zinc-500 mt-1">{weeks[i]}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function ReportPage() {
    const router = useRouter();
    const [period, setPeriod] = useState<'This Week' | 'This Month'>('This Week');

    // Fetch recent workouts from API
    const { data: recentWorkouts = [] } = useQuery({
        queryKey: ['recentWorkouts'],
        queryFn: async () => {
            try {
                const res = await getRecentWorkouts(50);
                return res.data || [];
            } catch {
                return [];
            }
        },
    });

    // Fetch heatmap data from API
    const { data: heatmapData } = useQuery({
        queryKey: ['exerciseHeatmap'],
        queryFn: async () => {
            try {
                const res = await getExerciseHeatmap();
                return res.data || {};
            } catch {
                return {};
            }
        },
    });

    // Compute stats from real data
    const totalWorkouts = recentWorkouts.length;
    const totalTime = recentWorkouts.reduce((sum: number, w: any) => sum + (w.duration || 0), 0);
    const totalVolume = recentWorkouts.reduce((sum: number, w: any) => {
        const exercises = w.exercises || [];
        return sum + exercises.reduce((eSum: number, e: any) =>
            eSum + ((e.sets || 0) * (e.reps || 0) * (e.weightKg || 0)), 0);
    }, 0);

    // Compute weekly chart data
    const weeklyData = useMemo(() => {
        const weeks = Array(8).fill(0);
        const now = new Date();
        recentWorkouts.forEach((w: any) => {
            const created = new Date(w.completedAt || w.createdAt);
            const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
            const weekIdx = 7 - Math.floor(diffDays / 7);
            if (weekIdx >= 0 && weekIdx < 8) weeks[weekIdx]!++;
        });
        return weeks;
    }, [recentWorkouts]);

    const currentWeight = (() => {
        try {
            const w = localStorage.getItem('nf_current_weight');
            return w ? parseFloat(w) : 0;
        } catch {
            return 0;
        }
    })();

    const muscleData: Record<string, number> = (heatmapData as Record<string, number>) || {};

    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1);
    const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const weekDates = days.map((_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d.getDate();
    });

    // Build history from real workouts
    const history = recentWorkouts.slice(0, 10).map((w: any) => {
        const date = new Date(w.completedAt || w.createdAt);
        const volume = (w.exercises || []).reduce((sum: number, e: any) =>
            sum + ((e.sets || 0) * (e.reps || 0) * (e.weightKg || 0)), 0);
        const durationMin = Math.floor((w.duration || 0) / 60);
        const durationSec = (w.duration || 0) % 60;
        return {
            name: w.title || 'Workout',
            time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            duration: `${String(durationMin).padStart(2, '0')}:${String(durationSec).padStart(2, '0')}`,
            volume: `${volume.toLocaleString()} kg`,
        };
    });

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-3xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="bg-white/5 hover:bg-white/10 text-white rounded-xl">
                        <ChevronLeft size={20} />
                    </Button>
                    <h1 className="text-2xl font-bold text-white">REPORT</h1>
                </div>

                {/* Total Stats */}
                <div className="space-y-3">
                    <h2 className="text-lg font-bold text-white">Total</h2>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <p className="text-zinc-400 text-xs">Workouts</p>
                            <p className="text-brand-500 text-2xl font-black">{totalWorkouts}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <p className="text-zinc-400 text-xs">Time(min)</p>
                            <p className="text-brand-500 text-2xl font-black">{totalTime}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <p className="text-zinc-400 text-xs">Volume(kg)</p>
                            <p className="text-brand-500 text-2xl font-black">{totalVolume.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                {/* Weekly Chart */}
                <WeeklyChart data={weeklyData} />

                {/* This Week Calendar */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white">This Week</h2>
                        <button className="flex items-center gap-1 text-zinc-400 text-sm">
                            {period} <ChevronDown size={14} />
                        </button>
                    </div>
                    <div className="grid grid-cols-7 gap-2 text-center">
                        {days.map((day, i) => {
                            const isToday = weekDates[i] === today.getDate();
                            return (
                                <div key={i} className="flex flex-col items-center gap-1">
                                    <span className="text-xs text-zinc-500">{day}</span>
                                    <div className={cn(
                                        'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all',
                                        isToday ? 'bg-brand-500 text-white' : 'text-zinc-400'
                                    )}>
                                        {weekDates[i]}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <p className="text-zinc-500 text-xs">Today(min)</p>
                            <p className="text-brand-500 text-3xl font-black">32</p>
                        </div>
                        <div>
                            <p className="text-zinc-500 text-xs">Weekly average(min)</p>
                            <p className="text-brand-500 text-3xl font-black">24.5</p>
                        </div>
                    </div>
                </div>

                {/* Body Heatmap */}
                <div className="space-y-3">
                    <h2 className="text-lg font-bold text-white">Training Frequency</h2>
                    <BodyHeatmap muscleData={muscleData} />
                    <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
                        <span>High</span>
                        <div className="flex gap-1">
                            <div className="w-4 h-3 rounded bg-blue-800" />
                            <div className="w-4 h-3 rounded bg-blue-500" />
                            <div className="w-4 h-3 rounded bg-blue-500/50" />
                            <div className="w-4 h-3 rounded bg-slate-700" />
                        </div>
                        <span>Low</span>
                    </div>
                </div>

                {/* History */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white">History</h2>
                        <button className="text-brand-400 text-sm font-semibold">View all</button>
                    </div>
                    {history.map((workout: any, i: number) => (
                        <motion.div
                            key={`${workout.name}-${i}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="bg-white/5 border border-white/10 rounded-xl p-4"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-white font-bold">{workout.name}</h3>
                                <button className="text-zinc-500">⋯</button>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                                <div>
                                    <p className="text-zinc-500 text-xs">{workout.time}</p>
                                    <p className="text-zinc-400">{workout.date}</p>
                                </div>
                                <div>
                                    <p className="text-zinc-500 text-xs">{workout.duration}</p>
                                    <p className="text-zinc-400">Duration</p>
                                </div>
                                <div>
                                    <p className="text-zinc-500 text-xs">{workout.volume}</p>
                                    <p className="text-zinc-400">Volume</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* My Weight */}
                <div className="space-y-3">
                    <h2 className="text-lg font-bold text-white">My Weight</h2>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-zinc-400 text-xs">Current(kg)</p>
                                <p className="text-brand-500 text-4xl font-black">{currentWeight}</p>
                                <p className="text-zinc-500 text-xs mt-1">Last 30 days —</p>
                            </div>
                            <Button className="bg-brand-500 hover:bg-brand-600 text-white font-bold px-6">
                                <Scale size={16} className="mr-2" /> LOG
                            </Button>
                        </div>
                        {/* Simple weight chart placeholder */}
                        <div className="mt-4 h-20 flex items-end gap-1">
                            {Array.from({ length: 30 }, (_, i) => {
                                const h = 20 + Math.sin(i * 0.3) * 15 + Math.random() * 10;
                                return (
                                    <div
                                        key={i}
                                        className="flex-1 bg-brand-500/30 rounded-t"
                                        style={{ height: `${h}%` }}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
