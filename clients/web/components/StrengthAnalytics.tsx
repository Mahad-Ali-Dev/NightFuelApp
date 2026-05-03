'use client';

import { useQuery } from '@tanstack/react-query';
import { exerciseApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dumbbell, TrendingUp, Zap, History } from 'lucide-react';
import { motion } from 'framer-motion';

function getWeekNumber(d: Date) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function StrengthAnalytics() {
    const { data: workouts, isLoading } = useQuery({
        queryKey: ['recent-workouts'],
        queryFn: async () => {
            const res = await exerciseApi.get('/?limit=20');
            return res.data;
        },
    });

    if (isLoading) return <div className="h-64 glass-card animate-pulse rounded-2xl" />;

    const exerciseTrends: Record<string, { weight: number, date: string, oneRM: number }[]> = {};
    const volumeHistory: { date: string, volume: number }[] = [];

    // Feature 7 trackers
    const muscleTargets: Record<'Chest' | 'Back' | 'Legs' | 'Arms' | 'Core', number> = { Chest: 0, Back: 0, Legs: 0, Arms: 0, Core: 0 };
    const frequencyMap: Record<string, number> = {};

    if (!workouts) return <div className="h-64 glass-card animate-pulse rounded-2xl" />;

    workouts.forEach((workout: any) => {
        const dateObj = workout.completedAt ? new Date(workout.completedAt) : new Date();
        const date = dateObj.toISOString().split('T')[0];

        // Track frequency by week
        const weekStr = `W${getWeekNumber(dateObj)}`;
        frequencyMap[weekStr] = (frequencyMap[weekStr] || 0) + 1;

        let workoutVolume = 0;

        workout.exercises?.forEach((ex: any) => {
            if (ex?.weightKg && ex?.reps && ex?.sets && ex?.name && date) {
                const vol = ex.weightKg * ex.reps * ex.sets;
                workoutVolume += vol;

                // Brzycki 1RM estimation: weight * (36 / (37 - reps))
                const oneRM = ex.reps === 1 ? ex.weightKg : ex.weightKg * (36 / (37 - ex.reps));

                const currentArr = exerciseTrends[ex.name] || [];
                currentArr.push({ weight: ex.weightKg, date, oneRM });
                exerciseTrends[ex.name] = currentArr;

                // Map exercises to Muscle Heatmap loosely
                const n = ex.name.toLowerCase();
                if (n.includes('bench') || n.includes('push') || n.includes('chest') || n.includes('fly')) muscleTargets.Chest += 1;
                else if (n.includes('deadlift') || n.includes('pull') || n.includes('row') || n.includes('back')) muscleTargets.Back += 1;
                else if (n.includes('squat') || n.includes('leg') || n.includes('calf') || n.includes('lunge')) muscleTargets.Legs += 1;
                else if (n.includes('curl') || n.includes('extension') || n.includes('tricep') || n.includes('bicep')) muscleTargets.Arms += 1;
                else if (n.includes('crunch') || n.includes('plank') || n.includes('core')) muscleTargets.Core += 1;
            }
        });

        if (date) {
            volumeHistory.push({ date, volume: workoutVolume });
        }
    });

    // Formatting for display
    const trainingFrequency = Object.entries(frequencyMap)
        .map(([week, count]) => ({ week, count }))
        .slice(-12); // last 12 weeks

    // Aggregate some "Power Items"
    const topExercises = Object.entries(exerciseTrends)
        .map(([name, logs]) => ({
            name,
            max1RM: Math.max(...logs.map(l => l.oneRM)),
            lastWeight: logs[0]?.weight
        }))
        .sort((a, b) => b.max1RM - a.max1RM)
        .slice(0, 3);

    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
                {topExercises.map((ex, i) => (
                    <Card key={i} className="glass-card border-brand-500/10 bg-brand-500/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                <Zap className="h-3 w-3 text-brand-400" /> {ex.name}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-white">{Math.round(ex.max1RM)}kg</span>
                                <span className="text-[10px] text-neutral-500 font-bold">Est. 1RM</span>
                            </div>
                            <p className="text-[10px] text-neutral-400 mt-1">Last seen at {ex.lastWeight}kg</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="glass-card">
                <CardHeader>
                    <CardTitle className="text-white text-lg flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-brand-500" /> Volume Progression
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-48 flex items-end gap-2 pb-2">
                        {volumeHistory.slice(0, 10).reverse().map((vh, i) => (
                            <motion.div
                                key={i}
                                initial={{ height: 0 }}
                                animate={{ height: `${Math.min((vh.volume / 10000) * 100, 100)}%` }}
                                className="flex-1 bg-brand-500/40 rounded-t-sm relative group"
                            >
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-900 text-[10px] text-white px-2 py-1 rounded border border-white/10 whitespace-nowrap z-50">
                                    {Math.round(vh.volume)} kg
                                </div>
                            </motion.div>
                        ))}
                    </div>
                    <div className="flex justify-between mt-2 pt-4 border-t border-white/5 text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                        <span>Past Workouts</span>
                        <span className="flex items-center gap-1"><History className="h-3 w-3" /> Recent Trend</span>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Workout Frequency */}
                <Card className="glass-card">
                    <CardHeader>
                        <CardTitle className="text-white text-lg flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-brand-500" /> Workout Consistency
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end justify-between h-32 gap-1 pb-2">
                            {trainingFrequency.map((tf, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                                    <div className="w-full flex items-end justify-center h-full relative">
                                        <div
                                            className="w-full max-w-[12px] bg-brand-500/80 rounded-t-sm transition-all group-hover:bg-brand-400 group-hover:scale-x-110"
                                            style={{ height: `${Math.max(10, (tf.count / 7) * 100)}%` }}
                                        />
                                        <span className="absolute -top-6 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-900 px-2 py-1 rounded">
                                            {tf.count}
                                        </span>
                                    </div>
                                    <span className="text-[8px] text-neutral-500 font-bold uppercase">{tf.week}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Muscle Target Heatmap */}
                <Card className="glass-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-white text-lg flex justify-between items-center">
                            <span className="flex items-center gap-2"><Dumbbell className="h-5 w-5 text-brand-500" /> Muscle Heatmap</span>
                            <span className="text-[10px] px-2 py-1 bg-brand-500/20 text-brand-400 rounded-full">This Week</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-3 mt-4">
                            {Object.entries(muscleTargets).map(([muscle, count]) => {
                                const maxCount = Math.max(...Object.values(muscleTargets), 1);
                                const percentage = (count / maxCount) * 100;
                                return (
                                    <div key={muscle} className="flex items-center justify-between gap-4">
                                        <div className="text-xs font-bold text-neutral-400 w-16 text-right uppercase tracking-wider">{muscle}</div>
                                        <div className="flex-1 h-3 bg-neutral-900 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${percentage}%` }}
                                                className={`h-full rounded-full ${percentage > 70 ? 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]' : percentage > 30 ? 'bg-orange-700' : 'bg-neutral-700'}`}
                                            />
                                        </div>
                                        <div className="text-[10px] text-neutral-500 font-bold w-4">{count}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
