'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    ChevronLeft, Calculator, TrendingUp, Target,
    Dumbbell, Info, BarChart3, Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ─── Formulas ────────────────────────────────────────────────────────────────

function epley(weight: number, reps: number): number {
    if (reps === 1) return weight;
    return weight * (1 + reps / 30);
}

function brzycki(weight: number, reps: number): number {
    if (reps === 1) return weight;
    return weight * (36 / (37 - reps));
}

function lander(weight: number, reps: number): number {
    if (reps === 1) return weight;
    return (100 * weight) / (101.3 - 2.67123 * reps);
}

function getPercentages(oneRM: number): { pct: number; weight: number; reps: string }[] {
    return [
        { pct: 100, weight: oneRM, reps: '1' },
        { pct: 95, weight: oneRM * 0.95, reps: '2' },
        { pct: 90, weight: oneRM * 0.90, reps: '3–4' },
        { pct: 85, weight: oneRM * 0.85, reps: '5–6' },
        { pct: 80, weight: oneRM * 0.80, reps: '7–8' },
        { pct: 75, weight: oneRM * 0.75, reps: '9–10' },
        { pct: 70, weight: oneRM * 0.70, reps: '11–12' },
        { pct: 65, weight: oneRM * 0.65, reps: '13–15' },
        { pct: 60, weight: oneRM * 0.60, reps: '16–20' },
    ];
}

const COMMON_EXERCISES = [
    'Bench Press', 'Squat', 'Deadlift', 'Overhead Press',
    'Barbell Row', 'Front Squat', 'Hip Thrust',
];

export default function CalculatorPage() {
    const router = useRouter();
    const [weight, setWeight] = useState<number>(100);
    const [reps, setReps] = useState<number>(5);
    const [exercise, setExercise] = useState('Bench Press');
    const [unit, setUnit] = useState<'kg' | 'lbs'>('kg');

    const results = useMemo(() => {
        if (weight <= 0 || reps <= 0 || reps > 30) return null;

        const ep = epley(weight, reps);
        const br = brzycki(weight, reps);
        const la = lander(weight, reps);
        const avg = (ep + br + la) / 3;

        return {
            epley: Math.round(ep * 10) / 10,
            brzycki: Math.round(br * 10) / 10,
            lander: Math.round(la * 10) / 10,
            average: Math.round(avg * 10) / 10,
            percentages: getPercentages(avg),
        };
    }, [weight, reps]);

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-3xl mx-auto space-y-8">

                {/* Header */}
                <header className="flex items-center gap-4">
                    <Button
                        variant="ghost" size="icon"
                        onClick={() => router.back()}
                        className="bg-white/5 hover:bg-white/10 text-white rounded-xl"
                    >
                        <ChevronLeft size={20} />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-black text-white flex items-center gap-3">
                            <Calculator className="text-brand-500" size={28} /> 1RM Calculator
                        </h1>
                        <p className="text-neutral-400 text-sm mt-0.5">Estimate your one-rep max from any set</p>
                    </div>
                </header>

                {/* Input Card */}
                <Card className="glass-card border-white/5 overflow-hidden">
                    <CardHeader className="bg-brand-500/5 border-b border-white/5">
                        <CardTitle className="text-white text-base font-semibold flex items-center gap-2">
                            <Dumbbell size={16} className="text-brand-400" />
                            Enter Your Lift
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        {/* Exercise selector */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Exercise</label>
                            <div className="flex flex-wrap gap-2">
                                {COMMON_EXERCISES.map((ex) => (
                                    <button
                                        key={ex}
                                        onClick={() => setExercise(ex)}
                                        className={cn(
                                            'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all',
                                            exercise === ex
                                                ? 'bg-brand-500/20 text-brand-400 border-brand-500/30'
                                                : 'bg-white/[0.03] text-neutral-500 border-white/[0.06] hover:bg-white/[0.06]'
                                        )}
                                    >
                                        {ex}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            {/* Weight */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                                    Weight Lifted
                                </label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        value={weight}
                                        onChange={(e) => setWeight(Number(e.target.value))}
                                        min={0}
                                        step={2.5}
                                        className="bg-white/5 border-white/10 text-white text-xl font-black pr-14 h-14"
                                    />
                                    <div className="absolute right-1 top-1 bottom-1 flex">
                                        {(['kg', 'lbs'] as const).map((u) => (
                                            <button
                                                key={u}
                                                onClick={() => setUnit(u)}
                                                className={cn(
                                                    'px-2 rounded-lg text-xs font-bold transition-all',
                                                    unit === u ? 'bg-brand-500 text-white' : 'text-neutral-500 hover:text-white'
                                                )}
                                            >
                                                {u}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Reps */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                                    Reps Performed
                                </label>
                                <Input
                                    type="number"
                                    value={reps}
                                    onChange={(e) => setReps(Math.min(30, Math.max(1, Number(e.target.value))))}
                                    min={1}
                                    max={30}
                                    className="bg-white/5 border-white/10 text-white text-xl font-black h-14"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Results */}
                {results && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        {/* Big 1RM Display */}
                        <div className="text-center glass-card p-8 rounded-2xl border-brand-500/20 bg-brand-500/5">
                            <p className="text-neutral-400 text-sm font-semibold uppercase tracking-widest mb-2">
                                Estimated 1RM — {exercise}
                            </p>
                            <motion.p
                                key={results.average}
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="text-6xl font-black text-white"
                            >
                                {results.average}
                                <span className="text-2xl text-neutral-500 ml-1">{unit}</span>
                            </motion.p>
                        </div>

                        {/* Formula Breakdown */}
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { name: 'Epley', value: results.epley },
                                { name: 'Brzycki', value: results.brzycki },
                                { name: 'Lander', value: results.lander },
                            ].map((f) => (
                                <div key={f.name} className="glass-card p-4 rounded-xl text-center">
                                    <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest">{f.name}</p>
                                    <p className="text-white font-black text-xl mt-1">{f.value} <span className="text-sm text-neutral-600">{unit}</span></p>
                                </div>
                            ))}
                        </div>

                        {/* Percentage Table */}
                        <Card className="glass-card border-white/5 overflow-hidden">
                            <CardHeader className="bg-white/[0.02] border-b border-white/5 pb-3">
                                <CardTitle className="text-white text-base font-semibold flex items-center gap-2">
                                    <BarChart3 size={16} className="text-brand-400" />
                                    Training Zones
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-white/[0.04]">
                                    {results.percentages.map((row) => (
                                        <div key={row.pct} className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className={cn(
                                                    'w-12 text-right font-black text-sm',
                                                    row.pct >= 90 ? 'text-red-400' : row.pct >= 75 ? 'text-amber-400' : 'text-emerald-400'
                                                )}>
                                                    {row.pct}%
                                                </span>
                                                {/* Visual bar */}
                                                <div className="w-20 h-2 bg-white/5 rounded-full overflow-hidden hidden md:block">
                                                    <motion.div
                                                        className={cn(
                                                            'h-full rounded-full',
                                                            row.pct >= 90 ? 'bg-red-500/60' : row.pct >= 75 ? 'bg-amber-500/60' : 'bg-emerald-500/60'
                                                        )}
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${row.pct}%` }}
                                                        transition={{ duration: 0.5 }}
                                                    />
                                                </div>
                                            </div>
                                            <span className="text-white font-bold text-sm">
                                                {Math.round(row.weight * 10) / 10} {unit}
                                            </span>
                                            <span className="text-neutral-500 text-xs w-16 text-right">
                                                {row.reps} reps
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Info */}
                        <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
                            <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                            <p className="text-neutral-400 text-xs leading-relaxed">
                                1RM estimates are most accurate for 1–10 reps. Results may vary ±5%.
                                Always use a spotter when testing max lifts.
                            </p>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
