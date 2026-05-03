'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
    ChevronLeft, TrendingUp, Search, Calendar,
    Activity, Dumbbell, Target, History, Trophy, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getRecentWorkouts, getExerciseAnalytics } from '@/lib/api';
import {
    LineChart, Line, AreaChart, Area,
    XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid
} from 'recharts';

interface ExerciseData {
    name: string;
    category: string;
    metrics: {
        oneRepMax: number;
        totalVolume: number;
        bestSet: string;
        frequency: string;
    };
    history: { date: string; maxWeight: number; volume: number }[];
}

export default function ExerciseProgressPage() {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [selectedName, setSelectedName] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'Weight' | 'Volume'>('Weight');

    // ── Fetch all workouts to build exercise list ──────────────────────────
    const { data: workoutsRes, isLoading: loadingWorkouts } = useQuery({
        queryKey: ['workouts', 200],
        queryFn: async () => {
            try {
                const res = await getRecentWorkouts(200);
                return res.data?.data ?? res.data ?? [];
            } catch { return []; }
        },
        staleTime: 5 * 60 * 1000,
    });

    // Extract unique exercise names from workouts
    const exerciseNames = useMemo(() => {
        const workouts = workoutsRes ?? [];
        const nameSet = new Set<string>();
        for (const w of workouts as any[]) {
            const exercises = w.exercises ?? w.sets ?? [];
            for (const ex of exercises) {
                const name = ex.exerciseName ?? ex.name;
                if (name) nameSet.add(name);
            }
        }
        return Array.from(nameSet).sort();
    }, [workoutsRes]);

    // Auto-select first exercise
    useEffect(() => {
        if (!selectedName && exerciseNames.length > 0) {
            setSelectedName(exerciseNames[0]!);
        }
    }, [exerciseNames, selectedName]);

    // ── Fetch analytics for selected exercise ─────────────────────────────
    const { data: analyticsRes, isLoading: loadingAnalytics } = useQuery({
        queryKey: ['exerciseAnalytics', selectedName],
        queryFn: async () => {
            if (!selectedName) return null;
            try {
                const res = await getExerciseAnalytics(selectedName);
                return res.data?.data ?? res.data ?? null;
            } catch { return null; }
        },
        enabled: !!selectedName,
        staleTime: 5 * 60 * 1000,
    });

    // Build display data from analytics response, with fallback
    const selectedExercise = useMemo<ExerciseData | null>(() => {
        if (!selectedName) return null;

        const a = analyticsRes as any;
        if (a) {
            return {
                name: selectedName,
                category: a.category ?? a.muscleGroup ?? 'General',
                metrics: {
                    oneRepMax: a.estimated1RM ?? a.oneRepMax ?? 0,
                    totalVolume: a.totalVolume ?? 0,
                    bestSet: a.bestSet ?? `${a.maxWeight ?? 0}kg`,
                    frequency: a.frequency ?? `${a.sessionCount ?? 0} sessions`,
                },
                history: (a.history ?? a.sessions ?? []).map((h: any) => ({
                    date: h.date ? new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
                    maxWeight: h.maxWeight ?? h.weight ?? 0,
                    volume: h.volume ?? h.totalVolume ?? 0,
                })),
            };
        }

        // Fallback: build from workout data
        const workouts = (workoutsRes ?? []) as any[];
        const history: { date: string; maxWeight: number; volume: number }[] = [];
        let maxW = 0;
        let totalVol = 0;
        for (const w of workouts) {
            const exs = (w.exercises ?? w.sets ?? []).filter((e: any) => (e.exerciseName ?? e.name) === selectedName);
            if (exs.length === 0) continue;
            let wMax = 0;
            let wVol = 0;
            for (const e of exs) {
                const weight = e.weightKg ?? e.weight ?? 0;
                const reps = e.reps ?? 0;
                const sets = e.sets ?? 1;
                wMax = Math.max(wMax, weight);
                wVol += weight * reps * sets;
            }
            maxW = Math.max(maxW, wMax);
            totalVol += wVol;
            history.push({
                date: w.createdAt ? new Date(w.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
                maxWeight: wMax,
                volume: wVol,
            });
        }

        return {
            name: selectedName,
            category: 'General',
            metrics: {
                oneRepMax: Math.round(maxW * 1.1),
                totalVolume: totalVol,
                bestSet: `${maxW}kg`,
                frequency: `${history.length} sessions`,
            },
            history: history.slice(-12),
        };
    }, [selectedName, analyticsRes, workoutsRes]);

    const filteredNames = exerciseNames.filter(n =>
        n.toLowerCase().includes(search.toLowerCase())
    );

    const isLoading = loadingWorkouts;

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="bg-white/5 hover:bg-white/10 text-white rounded-xl">
                        <ChevronLeft size={20} />
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-3xl font-black text-white flex items-center gap-3">
                            <TrendingUp className="text-brand-500" /> Exercise Analytics
                        </h1>
                        <p className="text-neutral-400 text-sm mt-0.5">Track your 1RM, volume, and performance trends</p>
                    </div>
                </header>

                {isLoading ? (
                    <div className="flex items-center justify-center py-32">
                        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
                        <span className="ml-3 text-neutral-400">Loading your exercise data…</span>
                    </div>
                ) : exerciseNames.length === 0 ? (
                    <div className="text-center py-32 space-y-4">
                        <Dumbbell className="w-16 h-16 mx-auto text-neutral-700" />
                        <h3 className="text-white font-bold text-lg">No workouts logged yet</h3>
                        <p className="text-neutral-500 text-sm">Complete a workout to see analytics here</p>
                        <Button onClick={() => router.push('/dashboard/training')} className="bg-brand-500 hover:bg-brand-600 text-white rounded-xl">
                            Start a Workout
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                        {/* Sidebar / Exercise List */}
                        <div className="lg:col-span-1 space-y-4">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                                <Input
                                    placeholder="Search exercises..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full bg-white/5 border-white/10 text-white pl-9 rounded-xl text-sm"
                                />
                            </div>

                            <div className="space-y-2 h-[600px] overflow-y-auto custom-scrollbar pr-2">
                                {filteredNames.map(name => (
                                    <button
                                        key={name}
                                        onClick={() => setSelectedName(name)}
                                        className={cn(
                                            'w-full text-left p-3 rounded-xl transition-all border flex items-center justify-between',
                                            selectedName === name
                                                ? 'bg-brand-500/10 border-brand-500/30'
                                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                                        )}
                                    >
                                        <div>
                                            <h3 className={cn("font-bold text-sm", selectedName === name ? 'text-brand-400' : 'text-white')}>
                                                {name}
                                            </h3>
                                        </div>
                                        {selectedExercise && selectedName === name && (
                                            <div className="text-right">
                                                <span className="text-xs font-bold text-white block">{selectedExercise.metrics.oneRepMax} kg</span>
                                                <span className="text-[10px] text-emerald-400 font-bold block">Max</span>
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Main Chart Area */}
                        <div className="lg:col-span-3">
                            {loadingAnalytics ? (
                                <div className="flex items-center justify-center py-32">
                                    <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                                </div>
                            ) : selectedExercise ? (
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={selectedExercise.name}
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        className="space-y-6"
                                    >
                                        {/* Stat Cards */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div className="glass-card p-4 rounded-xl border-white/[0.04]">
                                                <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                                    <Trophy size={12} className="text-amber-400" /> Est. 1RM
                                                </p>
                                                <p className="text-white font-black text-2xl">
                                                    {selectedExercise.metrics.oneRepMax}<span className="text-sm text-neutral-600 font-bold ml-1">kg</span>
                                                </p>
                                            </div>
                                            <div className="glass-card p-4 rounded-xl border-white/[0.04]">
                                                <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                                    <Activity size={12} className="text-blue-400" /> Best Set
                                                </p>
                                                <p className="text-white font-black text-xl md:text-2xl tracking-tighter">
                                                    {selectedExercise.metrics.bestSet}
                                                </p>
                                            </div>
                                            <div className="glass-card p-4 rounded-xl border-white/[0.04]">
                                                <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                                    <Dumbbell size={12} className="text-emerald-400" /> Total Volume
                                                </p>
                                                <p className="text-white font-black text-2xl">
                                                    {selectedExercise.metrics.totalVolume > 1000
                                                        ? `${(selectedExercise.metrics.totalVolume / 1000).toFixed(1)}`
                                                        : selectedExercise.metrics.totalVolume
                                                    }
                                                    <span className="text-sm text-neutral-600 font-bold ml-1">
                                                        {selectedExercise.metrics.totalVolume > 1000 ? 'ton' : 'kg'}
                                                    </span>
                                                </p>
                                            </div>
                                            <div className="glass-card p-4 rounded-xl border-white/[0.04]">
                                                <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                                    <Calendar size={12} className="text-purple-400" /> Frequency
                                                </p>
                                                <p className="text-white font-black text-xl tracking-tight">
                                                    {selectedExercise.metrics.frequency}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Chart Card */}
                                        {selectedExercise.history.length > 0 ? (
                                            <div className="glass-card p-6 rounded-2xl border-white/[0.04]">
                                                <div className="flex items-center justify-between mb-8">
                                                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                                        <Target size={18} className="text-brand-500" /> Progress Over Time
                                                    </h3>
                                                    <div className="flex bg-white/5 p-1 rounded-xl">
                                                        {(['Weight', 'Volume'] as const).map(tab => (
                                                            <button
                                                                key={tab}
                                                                onClick={() => setActiveTab(tab)}
                                                                className={cn(
                                                                    'px-4 py-1.5 rounded-lg text-xs font-bold transition-all',
                                                                    activeTab === tab
                                                                        ? 'bg-neutral-800 text-white shadow-md border border-white/10'
                                                                        : 'text-neutral-500 hover:text-neutral-300'
                                                                )}
                                                            >
                                                                {tab}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="h-72 w-full">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        {activeTab === 'Weight' ? (
                                                            <LineChart data={selectedExercise.history} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                                                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                                                <XAxis dataKey="date" stroke="#ffffff20" tick={{ fill: '#737373', fontSize: 10 }} dy={10} />
                                                                <YAxis stroke="#ffffff20" tick={{ fill: '#737373', fontSize: 10 }} domain={['dataMin - 10', 'dataMax + 10']} />
                                                                <Tooltip
                                                                    contentStyle={{ backgroundColor: '#171717', borderColor: '#ffffff10', borderRadius: '12px' }}
                                                                    itemStyle={{ color: '#f97316', fontSize: '14px', fontWeight: 'bold' }}
                                                                    labelStyle={{ color: '#737373', fontSize: '12px', marginBottom: '4px' }}
                                                                />
                                                                <Line
                                                                    type="monotone"
                                                                    dataKey="maxWeight"
                                                                    name="Max Weight (kg)"
                                                                    stroke="#f97316"
                                                                    strokeWidth={4}
                                                                    dot={{ fill: '#171717', stroke: '#f97316', strokeWidth: 2, r: 4 }}
                                                                    activeDot={{ r: 6, fill: '#f97316', stroke: '#fff' }}
                                                                />
                                                            </LineChart>
                                                        ) : (
                                                            <AreaChart data={selectedExercise.history} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
                                                                <defs>
                                                                    <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                                                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                                    </linearGradient>
                                                                </defs>
                                                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                                                <XAxis dataKey="date" stroke="#ffffff20" tick={{ fill: '#737373', fontSize: 10 }} dy={10} />
                                                                <YAxis stroke="#ffffff20" tick={{ fill: '#737373', fontSize: 10 }} />
                                                                <Tooltip
                                                                    contentStyle={{ backgroundColor: '#171717', borderColor: '#ffffff10', borderRadius: '12px' }}
                                                                    itemStyle={{ color: '#10b981', fontSize: '14px', fontWeight: 'bold' }}
                                                                    labelStyle={{ color: '#737373', fontSize: '12px', marginBottom: '4px' }}
                                                                />
                                                                <Area
                                                                    type="monotone"
                                                                    dataKey="volume"
                                                                    name="Volume (kg)"
                                                                    stroke="#10b981"
                                                                    strokeWidth={3}
                                                                    fillOpacity={1}
                                                                    fill="url(#colorVol)"
                                                                />
                                                            </AreaChart>
                                                        )}
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="glass-card p-12 rounded-2xl border-white/[0.04] text-center">
                                                <Target className="w-12 h-12 mx-auto text-neutral-700 mb-3" />
                                                <p className="text-neutral-400">No history data for this exercise yet</p>
                                            </div>
                                        )}

                                        {/* Recent History Table */}
                                        {selectedExercise.history.length > 0 && (
                                            <div className="glass-card rounded-2xl border-white/[0.04] overflow-hidden">
                                                <div className="p-4 border-b border-white/[0.04] flex items-center gap-2">
                                                    <History size={16} className="text-brand-400" />
                                                    <h3 className="text-white font-bold text-sm">Recent Sessions</h3>
                                                </div>
                                                <table className="w-full text-left text-sm">
                                                    <thead className="bg-white/[0.02] text-neutral-500 text-[10px] font-bold uppercase tracking-widest">
                                                        <tr>
                                                            <th className="px-5 py-3">Date</th>
                                                            <th className="px-5 py-3 text-right">Top Set</th>
                                                            <th className="px-5 py-3 text-right">Volume</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/[0.04]">
                                                        {[...selectedExercise.history].reverse().map((h, i) => (
                                                            <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                                                                <td className="px-5 py-3 font-medium text-white">{h.date}</td>
                                                                <td className="px-5 py-3 text-right text-brand-400 font-bold">{h.maxWeight} kg</td>
                                                                <td className="px-5 py-3 text-right text-emerald-400 font-bold">{h.volume} kg</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                            ) : null}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
