'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { exerciseApi } from '@/lib/api';
import { motion } from 'framer-motion';
import {
    ChevronLeft, Calendar, List, Dumbbell,
    Clock, Flame, TrendingUp, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface Workout {
    id: string;
    title: string;
    type: string;
    duration: number;
    intensity: string;
    exercises: { name: string; sets: number; reps: number; weight?: number }[];
    createdAt: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WorkoutHistoryPage() {
    const router = useRouter();
    const [view, setView] = useState<'calendar' | 'list'>('calendar');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const { data: workouts = [], isLoading } = useQuery<Workout[]>({
        queryKey: ['exercises', 'history'],
        queryFn: async () => {
            try {
                const res = await exerciseApi.get('/', { params: { limit: 200 } });
                return res.data ?? [];
            } catch {
                return [];
            }
        },
        staleTime: 60_000,
    });

    // Group workouts by date
    const workoutsByDate = useMemo(() => {
        const map = new Map<string, Workout[]>();
        workouts.forEach((w) => {
            const date = (w.createdAt || '').split('T')[0];
            if (!date) return;
            const existing = map.get(date) ?? [];
            existing.push(w);
            map.set(date, existing);
        });
        return map;
    }, [workouts]);

    // Calendar grid
    const calendarDays = useMemo(() => {
        const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();
        const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        const cells: (number | null)[] = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        return cells;
    }, [selectedMonth, selectedYear]);

    // Stats
    const totalWorkouts = workouts.length;
    const totalDuration = workouts.reduce((sum, w) => sum + (w.duration || 0), 0);
    const totalVolume = workouts.reduce((sum, w) => {
        return sum + (w.exercises?.reduce((es, e) => es + (e.sets || 0) * (e.reps || 0) * (e.weight || 0), 0) ?? 0);
    }, 0);

    const prevMonth = () => {
        if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); }
        else setSelectedMonth(selectedMonth - 1);
    };
    const nextMonth = () => {
        if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); }
        else setSelectedMonth(selectedMonth + 1);
    };

    const today = new Date();

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="bg-white/5 hover:bg-white/10 text-white rounded-xl">
                        <ChevronLeft size={20} />
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-3xl font-black text-white">Workout History</h1>
                        <p className="text-neutral-400 text-sm mt-0.5">Track your training journey</p>
                    </div>
                    <div className="flex bg-white/[0.04] rounded-xl border border-white/[0.06] p-1">
                        {[
                            { val: 'calendar' as const, icon: Calendar },
                            { val: 'list' as const, icon: List },
                        ].map(({ val, icon: Icon }) => (
                            <button
                                key={val}
                                onClick={() => setView(val)}
                                className={cn(
                                    'p-2 rounded-lg transition-all',
                                    view === val ? 'bg-brand-500 text-white' : 'text-neutral-500 hover:text-white'
                                )}
                            >
                                <Icon size={16} />
                            </button>
                        ))}
                    </div>
                </header>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label: 'Total Workouts', value: totalWorkouts, icon: Dumbbell, color: 'text-brand-400' },
                        { label: 'Total Duration', value: `${Math.round(totalDuration / 60)}h`, icon: Clock, color: 'text-blue-400' },
                        { label: 'Total Volume', value: `${Math.round(totalVolume / 1000)}k kg`, icon: TrendingUp, color: 'text-emerald-400' },
                    ].map((s) => (
                        <div key={s.label} className="glass-card p-4 rounded-xl text-center">
                            <s.icon size={16} className={cn('mx-auto mb-1', s.color)} />
                            <p className="text-white font-black text-lg">{s.value}</p>
                            <p className="text-neutral-600 text-[10px] uppercase tracking-widest font-bold">{s.label}</p>
                        </div>
                    ))}
                </div>

                {view === 'calendar' ? (
                    /* ─── Calendar View ───────────────────────────────────── */
                    <div className="glass-card rounded-2xl border-white/[0.04] overflow-hidden">
                        {/* Month navigator */}
                        <div className="flex items-center justify-between p-4 border-b border-white/[0.04]">
                            <button onClick={prevMonth} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 transition-all">
                                <ChevronLeft size={16} />
                            </button>
                            <h3 className="text-white font-bold">{MONTHS[selectedMonth]} {selectedYear}</h3>
                            <button onClick={nextMonth} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 transition-all">
                                <ChevronRight size={16} />
                            </button>
                        </div>

                        {/* Day headers */}
                        <div className="grid grid-cols-7 border-b border-white/[0.04]">
                            {DAYS.map((d) => (
                                <div key={d} className="text-center py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                                    {d}
                                </div>
                            ))}
                        </div>

                        {/* Calendar grid */}
                        <div className="grid grid-cols-7">
                            {calendarDays.map((day, i) => {
                                if (day === null) return <div key={i} className="h-16" />;
                                const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                const dayWorkouts = workoutsByDate.get(dateStr);
                                const isToday = day === today.getDate() && selectedMonth === today.getMonth() && selectedYear === today.getFullYear();

                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            'h-16 border-b border-r border-white/[0.02] p-1.5 relative transition-colors hover:bg-white/[0.03]',
                                            isToday && 'bg-brand-500/5'
                                        )}
                                    >
                                        <span className={cn(
                                            'text-xs font-bold',
                                            isToday ? 'text-brand-400' : 'text-neutral-500'
                                        )}>
                                            {day}
                                        </span>
                                        {dayWorkouts && (
                                            <div className="mt-1 space-y-0.5">
                                                {dayWorkouts.slice(0, 2).map((w, idx) => (
                                                    <div key={idx} className="h-1.5 rounded-full bg-brand-500/60"
                                                        title={w.title || w.type || 'Workout'} />
                                                ))}
                                                {dayWorkouts.length > 2 && (
                                                    <span className="text-[8px] text-brand-400 font-bold">+{dayWorkouts.length - 2}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    /* ─── List View ────────────────────────────────────────── */
                    <div className="space-y-3">
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="glass-card h-20 rounded-xl animate-pulse" />
                            ))
                        ) : workouts.length === 0 ? (
                            <div className="glass-card p-12 text-center rounded-2xl">
                                <Dumbbell size={32} className="text-neutral-700 mx-auto mb-3" />
                                <p className="text-neutral-500">No workouts logged yet</p>
                                <Link href="/dashboard/exercise">
                                    <Button className="mt-4 bg-brand-500 text-white rounded-xl">Log a Workout</Button>
                                </Link>
                            </div>
                        ) : (
                            workouts.map((w, i) => (
                                <motion.div
                                    key={w.id || i}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.03 }}
                                    className="glass-card p-4 rounded-xl border-white/[0.04] hover:bg-white/[0.03] transition-all"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 rounded-xl bg-brand-500/15">
                                                <Dumbbell size={16} className="text-brand-400" />
                                            </div>
                                            <div>
                                                <p className="text-white font-bold text-sm">{w.title || w.type || 'Workout'}</p>
                                                <p className="text-neutral-500 text-xs">
                                                    {new Date(w.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                                    {w.duration ? ` · ${w.duration} min` : ''}
                                                    {w.exercises ? ` · ${w.exercises.length} exercises` : ''}
                                                </p>
                                            </div>
                                        </div>
                                        {w.intensity && (
                                            <span className={cn(
                                                'text-[10px] font-bold px-2 py-1 rounded-lg border',
                                                w.intensity === 'high' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                                                    w.intensity === 'medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                                                        'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                            )}>
                                                {w.intensity}
                                            </span>
                                        )}
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
