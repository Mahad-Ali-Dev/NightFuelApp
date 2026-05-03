'use client';
import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { progressApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, TrendingUp, Award, Flame, Calendar, Activity, Zap, Scale, Dumbbell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BodyMetricsLog } from '@/components/BodyMetricsLog';
import { StrengthAnalytics } from '@/components/StrengthAnalytics';
import { TrackMacros } from '@/components/nutrition/TrackMacros';
import { HabitChallenges } from '@/components/progress/HabitChallenges';
import { Shield } from 'lucide-react';

export default function PerformanceHub() {
    const { isAuthenticated } = useAuth();
    const [activeTab, setActiveTab] = useState('nutrition');

    const { data: today, isLoading: todayLoading, isError: todayError } = useQuery({
        queryKey: ['progress-today'],
        queryFn: async () => {
            try {
                const res = await progressApi.get('/today');
                return res.data?.data ?? res.data ?? null;
            } catch { return null; }
        },
        enabled: isAuthenticated,
        retry: 1,
    });

    const { data: streak, isLoading: streakLoading } = useQuery({
        queryKey: ['progress-streak'],
        queryFn: async () => {
            try {
                const res = await progressApi.get('/streak');
                return res.data?.data ?? res.data ?? { currentStreak: 0, longestStreak: 0 };
            } catch { return { currentStreak: 0, longestStreak: 0 }; }
        },
        enabled: isAuthenticated,
        retry: 1,
    });

    const { data: stats, isLoading: statsLoading } = useQuery({
        queryKey: ['progress-stats'],
        queryFn: async () => {
            try {
                const res = await progressApi.get('/stats?days=30');
                return res.data?.data ?? res.data ?? { adherencePercent: 0 };
            } catch { return { adherencePercent: 0 }; }
        },
        enabled: isAuthenticated,
        retry: 1,
    });

    if (todayLoading || streakLoading || statsLoading) {
        return (
            <div className="flex h-screen items-center justify-center text-white">
                <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8 relative z-10">
            {/* Background elements */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-brand-500/10 rounded-full blur-[150px]" />
                <div className="absolute bottom-0 left-0 w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[150px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mx-auto max-w-6xl space-y-8 relative z-10"
            >
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-6 rounded-2xl">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                            <TrendingUp className="h-7 w-7 text-brand-500" /> Performance Hub
                        </h1>
                        <p className="text-neutral-400 mt-1">Your journey towards optimal circadian health.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="glass-card px-6 py-3 flex items-center gap-3">
                            <Flame className="h-6 w-6 text-orange-500 fill-orange-500/20" />
                            <div>
                                <p className="text-2xl font-bold text-white leading-tight">{streak?.currentStreak || 0}</p>
                                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Day Streak</p>
                            </div>
                        </div>
                        <div className="glass-card px-6 py-3 flex items-center gap-3 border-brand/20 bg-brand/5">
                            <Award className="h-6 w-6 text-brand-400" />
                            <div>
                                <p className="text-2xl font-bold text-white leading-tight">{Math.round(stats?.adherencePercent || 0)}%</p>
                                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Adherence</p>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl w-fit">
                    <TabButton active={activeTab === 'nutrition'} onClick={() => setActiveTab('nutrition')} icon={<Zap className="h-4 w-4" />} label="Nutrition" />
                    <TabButton active={activeTab === 'body'} onClick={() => setActiveTab('body')} icon={<Scale className="h-4 w-4" />} label="Body" />
                    <TabButton active={activeTab === 'strength'} onClick={() => setActiveTab('strength')} icon={<Dumbbell className="h-4 w-4" />} label="Strength" />
                    <TabButton active={activeTab === 'habits'} onClick={() => setActiveTab('habits')} icon={<Shield className="h-4 w-4" />} label="Habits" />
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === 'nutrition' && (
                        <motion.div
                            key="nutrition"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-8"
                        >

                            <div className="grid gap-6 md:grid-cols-3">
                                {/* Today's Snapshot / Track Macros */}
                                <div className="md:col-span-1">
                                    <TrackMacros today={today} />
                                </div>

                                {/* Weekly Trends */}
                                <Card className="glass-card md:col-span-2">
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <div>
                                            <CardTitle className="text-white text-lg">30-Day Activity</CardTitle>
                                            <CardDescription className="text-neutral-500">Adherence and calorie tracking</CardDescription>
                                        </div>
                                        <Calendar className="h-5 w-5 text-neutral-500" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="h-64 w-full flex items-end gap-2 pb-6 justify-between">
                                            {/* Simulated Chart Bars */}
                                            {[85, 90, 60, 100, 40, 80, 95, 70, 85, 90, 100, 30, 60, 80, 90, 95, 100, 85, 70, 90, 100, 80, 60, 85, 90, 95, 100, 85, 90, 95].map((val, i) => (
                                                <motion.div
                                                    key={i}
                                                    initial={{ height: 0 }}
                                                    animate={{ height: `${val}%` }}
                                                    transition={{ duration: 0.5, delay: i * 0.02 }}
                                                    className={`flex-1 rounded-t-sm ${val === 100 ? 'bg-brand-500/50' : 'bg-white/5'}`}
                                                />
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-6 border-t border-white/5 text-center">
                                            <StatItem label="Days Tracked" value={stats?.daysTracked || 0} />
                                            <StatItem label="Avg Calories" value={Math.round(stats?.avgCaloriesActual || 0)} />
                                            <StatItem label="Meals Total" value={stats?.totalMealsLogged || 0} />
                                            <StatItem label="Avg Protein" value={`${Math.round(stats?.avgProteinActual || 0)}g`} />
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'body' && (
                        <motion.div
                            key="body"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-8"
                        >
                            <BodyMetricsLog />
                        </motion.div>
                    )}

                    {activeTab === 'strength' && (
                        <motion.div
                            key="strength"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-8"
                        >
                            <StrengthAnalytics />
                        </motion.div>
                    )}
                    {activeTab === 'habits' && (
                        <motion.div
                            key="habits"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-8"
                        >
                            <HabitChallenges />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}

function TabButton({ active, onClick, icon, label }: any) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
                active ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20" : "text-neutral-500 hover:text-white hover:bg-white/5"
            )}
        >
            {icon}
            {label}
        </button>
    );
}

function MacroRing({ label, current, target, color }: any) {
    const percent = Math.min((current / (target || 100)) * 100, 100);
    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative h-12 w-12">
                <svg className="h-full w-full rotate-[-90deg]" viewBox="0 0 100 100">
                    <circle className="text-white/5 stroke-current" strokeWidth="12" fill="transparent" r="40" cx="50" cy="50" />
                    <motion.circle
                        initial={{ strokeDashoffset: 251.2 }}
                        animate={{ strokeDashoffset: 251.2 - (251.2 * (percent / 100)) }}
                        transition={{ duration: 1 }}
                        className={`${color} stroke-current`}
                        strokeWidth="12"
                        strokeDasharray="251.2"
                        fill="transparent"
                        r="40"
                        cx="50"
                        cy="50"
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white">{label}</div>
            </div>
            <span className="text-[10px] text-neutral-500 font-bold">{Math.round(percent)}%</span>
        </div>
    );
}

function StatItem({ label, value }: any) {
    return (
        <div>
            <p className="text-lg font-bold text-white">{value}</p>
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">{label}</p>
        </div>
    );
}

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(' ');
}
