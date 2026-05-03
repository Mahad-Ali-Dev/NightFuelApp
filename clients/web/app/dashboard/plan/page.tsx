'use client';

import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { shiftApi, circadianApi, planApi, mealApi, generatePlan, userApi, getWeeklyStats, getTodayProgress, swapMeal } from '@/lib/api';
import InteractiveTrackingHub from '@/components/InteractiveTrackingHub';
import WorkoutLogHub from '@/components/WorkoutLogHub';
import { useQuery } from '@tanstack/react-query';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    LineChart,
    Line,
    ComposedChart,
    Area,
    CartesianGrid
} from 'recharts';
import Link from 'next/link';
import { ArrowLeft, Zap, Coffee, Dumbbell, Utensils, RefreshCw, AlertCircle, CalendarDays, Activity, Droplets, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Shift {
    id: string;
    shiftDate: string;
    startTime: string;
    endTime: string;
    shiftType: string;
    sleepWindowStart: string | null;
    sleepWindowEnd: string | null;
    workIntensity: string;
    commuteMinutes: number;
    isDayOff: boolean;
}

interface CircadianProfile {
    userId: string;
    shiftId: string;
    date: string;
    bodyTemperatureCurve: Record<string, number>;
    insulinSensitivityWindows: Array<{ start: string; end: string }>;
    cortisolRhythm: Record<string, number>;
    melatoninOnset: string | null;
    caffeineMetabolismWindow: { start: string; end: string };
    optimalExerciseWindows: Array<{ start: string; end: string }>;
}

interface MealItem {
    name: string;
    amount: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

interface Meal {
    name: string;
    suggested_time: string;
    recommendation: string;
    items?: MealItem[];
}

interface DayPlan {
    coaching_message: string;
    hydration_goal?: string;
    supplement_suggestions?: string[];
    meals: Meal[];
    workout_suggestion: {
        title: string;
        duration: string;
        intensity: string;
        exercises: {
            name: string;
            sets: number;
            reps: string;
            notes?: string;
        }[];
        coaching_tips: string;
    };
    caffeine_advice: string;
    decisionParameters?: {
        calories: number;
        protein_g: number;
        volume_modifier: number;
        deload: boolean;
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayISO = () => new Date().toISOString().split('T')[0]!;

const fetchShifts = async (date: string): Promise<Shift[]> => {
    // End date is padded to the next day to ensure the query catches the target date robustly regardless of timezone offsets.
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    const endStr = end.toISOString().split('T')[0];

    const res = await shiftApi.get(`/?start=${date}&end=${endStr}`);
    return res.data;
};

const GOAL_OPTIONS = [
    { value: 'ENERGY', label: '⚡ Sustained Energy' },
    { value: 'WEIGHT_LOSS', label: '🔥 Weight Loss' },
    { value: 'MUSCLE_GAIN', label: '💪 Muscle Gain' },
    { value: 'MASS_GAIN', label: '🚀 Mass Gain' },
    { value: 'CUTTING', label: '✂️ Cutting' },
    { value: 'SLEEP_QUALITY', label: '😴 Better Sleep' },
];

const DIET_OPTIONS = [
    { value: 'ANY', label: 'No restriction' },
    { value: 'VEGETARIAN', label: 'Vegetarian' },
    { value: 'VEGAN', label: 'Vegan' },
    { value: 'HIGH_PROTEIN', label: 'High Protein' },
    { value: 'LOW_CARB', label: 'Low Carb' },
    { value: 'ACNE_SAFE', label: '✨ Acne Safe' },
    { value: 'BUDGET', label: '💰 Budget Friendly' },
    { value: 'RAMADAN', label: '🌙 Ramadan/Fasting' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function CircadianSummary({ profile }: { profile: CircadianProfile }) {
    const tempValues = Object.values(profile.bodyTemperatureCurve);
    const peakTempTime = Object.entries(profile.bodyTemperatureCurve).reduce((a, b) =>
        b[1] > a[1] ? b : a
    )[0];

    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel p-5 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Moon className="w-12 h-12 text-violet-500" />
                </div>
                <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-2">Melatonin Onset</p>
                <p className="text-3xl font-bold text-white mb-1">
                    {profile.melatoninOnset ?? '—'}
                </p>
                <p className="text-xs text-neutral-400">Dim lights & wind down</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel p-5 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Coffee className="w-12 h-12 text-amber-500" />
                </div>
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Caffeine Cutoff</p>
                <p className="text-3xl font-bold text-white mb-1">
                    {profile.caffeineMetabolismWindow.end}
                </p>
                <p className="text-xs text-neutral-400">Stop intake for sleep</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-panel p-5 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Droplets className="w-12 h-12 text-blue-500" />
                </div>
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Insulin Window</p>
                <p className="text-2xl font-bold text-white mb-1 mt-1">
                    {profile.insulinSensitivityWindows[0]
                        ? `${profile.insulinSensitivityWindows[0].start} – ${profile.insulinSensitivityWindows[0].end}`
                        : '—'}
                </p>
                <p className="text-xs text-neutral-400">Best time for carbs</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-panel p-5 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Activity className="w-12 h-12 text-rose-500" />
                </div>
                <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">Peak Body Temp</p>
                <p className="text-3xl font-bold text-white mb-1">
                    {peakTempTime}
                </p>
                <p className="text-xs text-neutral-400">
                    {Math.max(...tempValues).toFixed(1)}°C — Ideal exercise
                </p>
            </motion.div>
        </div>
    );
}

function MealCard({ meal, index, onSwap, preferences }: { meal: Meal; index: number; onSwap: (newMeal: Meal) => void; preferences: any }) {
    const totalMacros = meal.items?.reduce((acc, item) => ({
        calories: acc.calories + item.calories,
        protein: acc.protein + item.protein,
        carbs: acc.carbs + item.carbs,
        fat: acc.fat + item.fat
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    const [isSwapping, setIsSwapping] = useState(false);

    const handleSwap = async () => {
        setIsSwapping(true);
        try {
            const res = await swapMeal({
                meal_to_swap: meal,
                preferences: {
                    ...preferences,
                    primaryGoal: preferences.primaryGoal || 'ENERGY',
                    dietaryPreference: preferences.dietaryPreference || 'ANY',
                    dietMode: preferences.dietMode || 'BALANCED'
                }
            });

            if (res.data.alternatives && res.data.alternatives.length > 0) {
                // Update with the first suggestion
                onSwap(res.data.alternatives[0]);
            }
        } catch (e: any) {
            console.error("Meal swap failed", e);
        } finally {
            setIsSwapping(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * index }}
            className="glass-card flex flex-col gap-4 border-l-4 border-l-brand-500 overflow-hidden"
        >
            <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Utensils className="h-4 w-4 text-brand-400" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                            {meal.name}
                        </h3>
                    </div>
                    <p className="text-sm text-neutral-300 leading-relaxed max-w-2xl font-medium">
                        {meal.recommendation}
                    </p>
                </div>
                <div className="flex flex-col md:items-end gap-2">
                    <div className="shrink-0 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/5 shadow-inner">
                        <span className="text-lg font-bold text-brand-400">
                            {meal.suggested_time}
                        </span>
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-[10px] h-7 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 gap-1 border border-brand-500/20"
                        onClick={handleSwap}
                        disabled={isSwapping}
                    >
                        <RefreshCw className={cn("h-3 w-3", isSwapping && "animate-spin")} />
                        {isSwapping ? "SWAPPING..." : "SWAP MEAL"}
                    </Button>
                </div>
            </div>

            {meal.items && meal.items.length > 0 && (
                <div className="px-5 pb-5">
                    <div className="bg-black/20 rounded-xl border border-white/5 overflow-hidden">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/5">
                                    <th className="px-4 py-2 font-semibold text-neutral-400">Item</th>
                                    <th className="px-4 py-2 font-semibold text-neutral-400">Qty</th>
                                    <th className="px-4 py-2 font-semibold text-neutral-400 text-right">Cals</th>
                                    <th className="px-4 py-2 font-semibold text-neutral-400 text-right">P</th>
                                    <th className="px-4 py-2 font-semibold text-neutral-400 text-right">C</th>
                                    <th className="px-4 py-2 font-semibold text-neutral-400 text-right">F</th>
                                </tr>
                            </thead>
                            <tbody>
                                {meal.items.map((item, idx) => (
                                    <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                                        <td className="px-4 py-2 text-white font-medium">{item.name}</td>
                                        <td className="px-4 py-2 text-neutral-400">{item.amount}</td>
                                        <td className="px-4 py-2 text-neutral-100 text-right">{item.calories}</td>
                                        <td className="px-4 py-2 text-emerald-400/80 text-right">{item.protein}g</td>
                                        <td className="px-4 py-2 text-blue-400/80 text-right">{item.carbs}g</td>
                                        <td className="px-4 py-2 text-amber-400/80 text-right">{item.fat}g</td>
                                    </tr>
                                ))}
                            </tbody>
                            {totalMacros && (
                                <tfoot className="bg-brand-500/5 border-t border-white/10">
                                    <tr>
                                        <td colSpan={2} className="px-4 py-2 font-bold text-brand-400 uppercase tracking-tighter">Total Nutrition</td>
                                        <td className="px-4 py-2 font-bold text-white text-right">{totalMacros.calories}</td>
                                        <td className="px-4 py-2 font-bold text-emerald-400 text-right">{totalMacros.protein}g</td>
                                        <td className="px-4 py-2 font-bold text-blue-400 text-right">{totalMacros.carbs}g</td>
                                        <td className="px-4 py-2 font-bold text-amber-400 text-right">{totalMacros.fat}g</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}
        </motion.div>
    );
}

function TrendsSection({ data }: { data: any }) {
    if (!data || !data.chartData || data.chartData.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                <div className="h-px bg-neutral-800 flex-1" />
                Performance Trends (Last 7 Days)
                <div className="h-px bg-neutral-800 flex-1" />
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Calorie Stabilization */}
                <Card className="glass-card border-white/5 bg-black/40 p-6 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                        <Zap className="w-16 h-16 text-brand-500" />
                    </div>
                    <CardHeader className="pb-2 p-0">
                        <CardTitle className="text-md font-bold text-white">Calorie vs Target</CardTitle>
                        <CardDescription className="text-xs text-neutral-500">Stabilization relative to adaptive targets</CardDescription>
                    </CardHeader>
                    <div className="h-[200px] w-full mt-6">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                <XAxis dataKey="date" hide />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#171717', border: '1px solid #333', borderRadius: '12px', fontSize: '10px' }}
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                />
                                <Bar dataKey="caloriesActual" name="Actual" fill="#fb923c" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="caloriesTarget" name="Target" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.3} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* 2. Fatigue Variance */}
                <Card className="glass-card border-white/5 bg-black/40 p-6 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                        <Activity className="w-16 h-16 text-red-500" />
                    </div>
                    <CardHeader className="pb-2 p-0">
                        <CardTitle className="text-md font-bold text-white">Fatigue Variance</CardTitle>
                        <CardDescription className="text-xs text-neutral-500">Self-reported recovery status (0-10)</CardDescription>
                    </CardHeader>
                    <div className="h-[200px] w-full mt-6">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                <XAxis dataKey="date" hide />
                                <YAxis domain={[0, 10]} hide />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#171717', border: '1px solid #333', borderRadius: '12px', fontSize: '10px' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="fatigueScore"
                                    name="Fatigue"
                                    stroke="#ef4444"
                                    strokeWidth={3}
                                    dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#171717' }}
                                    activeDot={{ r: 6, fill: '#ef4444' }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            {/* Weight Correlation */}
            <Card className="glass-card border-white/5 bg-black/40 p-6 overflow-hidden">
                <CardHeader className="pb-2 p-0 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-md font-bold text-white">Weight & Calorie Correlation</CardTitle>
                        <CardDescription className="text-xs text-neutral-500">Cross-referencing intake with body mass trends</CardDescription>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-sm bg-brand-500/20 border border-brand-500/30" />
                            <span className="text-[10px] text-neutral-400 font-medium uppercase tracking-tighter">Calories</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-1 bg-blue-500 rounded-full" />
                            <span className="text-[10px] text-neutral-400 font-medium uppercase tracking-tighter">Weight</span>
                        </div>
                    </div>
                </CardHeader>
                <div className="h-[250px] w-full mt-8">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data.chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                            <XAxis dataKey="date" hide />
                            <YAxis yAxisId="left" hide />
                            <YAxis yAxisId="right" orientation="right" hide />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#171717', border: '1px solid #333', borderRadius: '12px', fontSize: '10px' }}
                            />
                            <Bar yAxisId="left" dataKey="caloriesActual" name="kcal" fill="#fb923c" opacity={0.15} radius={[2, 2, 0, 0]} />
                            <Line
                                yAxisId="right"
                                type="stepAfter"
                                dataKey="weightKg"
                                name="Weight (kg)"
                                stroke="#3b82f6"
                                strokeWidth={4}
                                dot={{ r: 0 }}
                                strokeLinecap="round"
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </Card>
        </motion.div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlanPage() {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();

    const today: string = todayISO();

    const { data: shifts, error: shiftsError, isLoading: shiftsLoading } = useQuery({
        queryKey: ['shifts', today],
        queryFn: () => fetchShifts(today as string),
        enabled: isAuthenticated && !!today,
    });

    const [selectedShiftId, setSelectedShiftId] = useState<string>('');
    const [primaryGoal, setPrimaryGoal] = useState('ENERGY');
    const [dietaryPreference, setDietaryPreference] = useState('ANY');

    const [circadianProfile, setCircadianProfile] = useState<CircadianProfile | null>(null);
    const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'idle' | 'generating' | 'done'>('idle');

    const { data: userStatus, refetch: refetchStatus } = useQuery({
        queryKey: ['userStatus'],
        queryFn: async () => {
            const res = await userApi.get('/me/status');
            return res.data;
        },
        enabled: isAuthenticated,
    });

    const { data: weeklyStats } = useQuery({
        queryKey: ['weeklyStats'],
        queryFn: async () => {
            const res = await getWeeklyStats();
            return res.data;
        },
        enabled: isAuthenticated,
    });

    const { data: todayProgress } = useQuery({
        queryKey: ['today-progress'],
        queryFn: async () => {
            const res = await getTodayProgress();
            return res.data;
        },
        enabled: isAuthenticated && !!dayPlan,
        refetchInterval: 30000, // Refresh every 30s
    });

    if (!isAuthenticated || !user?.id) {
        return <div className="flex min-h-screen items-center justify-center bg-neutral-900 text-white">Loading...</div>;
    }

    const selectedShift = shifts?.find((s) => s.id === selectedShiftId) ?? shifts?.[0] ?? null;

    const handleGenerate = async () => {
        const shift = selectedShift;
        if (!shift) {
            setError('No shift found for today. Add a shift first.');
            return;
        }

        try {
            setStep('generating');
            if (!user?.id) throw new Error("User ID is missing");
            const cleanDate = shift.shiftDate.split('T')[0];

            // ── Unified Orchestration ──────────────────────────────────────
            const response = await generatePlan({
                userId: user.id,
                date: cleanDate,
                shiftId: shift.id,
                shiftType: shift.shiftType,
                profileData: {}, // Optional additional context
            } as any);

            const createdPlan = response.data;
            setDayPlan(createdPlan.plan);
            setStep('done');

            // Refresh status to show latest materialization
            refetchStatus();
        } catch (err: any) {
            const message =
                err?.response?.data?.error ??
                err?.message ??
                'Something went wrong.';
            setError(message);
            setStep('idle');
        } finally {
            setIsGenerating(false);
        }
    };

    const stepLabel =
        step === 'generating'
            ? 'Stabilizing adaptive core...'
            : null;

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8 relative z-10 selection:bg-brand-500 selection:text-white">
            {/* Background elements */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] right-[10%] w-[50%] h-[50%] bg-brand-500/10 rounded-full blur-[150px]" />
                <div className="absolute bottom-[0%] left-[0%] w-[60%] h-[60%] bg-blue-500/10 rounded-full blur-[150px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mx-auto max-w-5xl space-y-8 relative z-10 lg:px-4"
            >
                {/* ── Header ── */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-6 rounded-2xl">
                    <div>
                        <div className="flex items-center gap-3">
                            <Link href="/dashboard">
                                <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full">
                                    <ArrowLeft className="h-5 w-5" />
                                </Button>
                            </Link>
                            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                                <span className="bg-brand-500/20 p-2 rounded-xl text-brand-400">
                                    <Zap className="h-6 w-6" />
                                </span>
                                Chonobiology Plan
                            </h1>
                        </div>
                        <p className="mt-2 pl-16 text-neutral-400">
                            {new Date(today || Date.now()).toLocaleDateString(undefined, {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                            })}
                        </p>
                    </div>
                </header>

                {/* ── Adaptive Core Status Banners ── */}
                {userStatus && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={cn(
                                "p-4 rounded-xl border flex items-center justify-between",
                                userStatus.fatigueScore > 7 ? "bg-red-500/10 border-red-500/30" : "bg-brand-500/10 border-brand-500/30"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <Activity className={cn("h-5 w-5", userStatus.fatigueScore > 7 ? "text-red-400" : "text-brand-400")} />
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Fatigue Score</p>
                                    <p className="text-xl font-bold text-white">{userStatus.fatigueScore}/10</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-neutral-500 uppercase">Status</p>
                                <p className={cn("text-xs font-bold", userStatus.fatigueScore > 7 ? "text-red-400" : "text-emerald-400")}>
                                    {userStatus.fatigueScore > 7 ? "COACH PRESCRIBED: DELOAD" : "OPTIMAL FOR VOLUME"}
                                </p>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.1 }}
                            className="p-4 rounded-xl border bg-blue-500/10 border-blue-500/30 flex items-center justify-between"
                        >
                            <div className="flex items-center gap-3">
                                <Zap className="h-5 w-5 text-blue-400" />
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Adherence Rate</p>
                                    <p className="text-xl font-bold text-white">{Math.round(userStatus.adherenceRate * 100)}%</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-neutral-500 uppercase">Streak</p>
                                <p className="text-xs font-bold text-blue-400">{userStatus.currentStreak} DAYS</p>
                            </div>
                        </motion.div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* ── Sidebar (Controls) ── */}
                    <div className="lg:col-span-4 space-y-6">
                        {/* ── Shift Selector ── */}
                        <Card className="glass-card border-white/5 bg-black/40">
                            <CardHeader className="pb-4 border-b border-white/5">
                                <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
                                    <CalendarDays className="h-5 w-5 text-brand-400" /> Today's Shift
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                {shiftsLoading && <div className="h-10 bg-white/5 animate-pulse rounded-md" />}
                                {shiftsError && (
                                    <p className="text-sm text-red-500 bg-red-500/10 p-3 rounded-md">Failed to load shifts.</p>
                                )}
                                {shifts && shifts.length === 0 && (
                                    <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400 flex flex-col gap-2">
                                        <div className="flex items-center gap-2 font-medium">
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            <span>No shift logged</span>
                                        </div>
                                        <p className="text-red-300">You must log a shift today before generating a plan.</p>
                                        <Link href="/shifts/new">
                                            <Button size="sm" className="w-full mt-2 bg-red-500/20 hover:bg-red-500/30 text-red-100 border border-red-500/30">
                                                Log Shift Now
                                            </Button>
                                        </Link>
                                    </div>
                                )}
                                {shifts && shifts.length > 0 && (
                                    <select
                                        className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow appearance-none cursor-pointer"
                                        value={selectedShiftId || shifts[0]?.id || ''}
                                        onChange={(e) => setSelectedShiftId(e.target.value)}
                                        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em`, paddingRight: `2.5rem` }}
                                    >
                                        {shifts.map((s) => (
                                            <option key={s.id} value={s.id} className="bg-neutral-900 text-white">
                                                {s.shiftType.replace('_', ' ')}: {s.startTime ? new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </CardContent>
                        </Card>

                        {/* ── Preferences ── */}
                        <Card className="glass-card border-white/5 bg-black/40">
                            <CardHeader className="pb-4 border-b border-white/5">
                                <CardTitle className="text-lg font-semibold text-white">Algorithm Preferences</CardTitle>
                                <CardDescription className="text-neutral-400 text-xs">Tune the AI to your specific biology</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-5">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest ml-1">
                                        Primary Goal
                                    </label>
                                    <div className="relative">
                                        <select
                                            className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow appearance-none cursor-pointer"
                                            value={primaryGoal}
                                            onChange={(e) => setPrimaryGoal(e.target.value)}
                                            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em`, paddingRight: `2.5rem` }}
                                        >
                                            {GOAL_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value} className="bg-neutral-900 text-white">
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest ml-1">
                                        Dietary Restrictions
                                    </label>
                                    <div className="relative">
                                        <select
                                            className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow appearance-none cursor-pointer"
                                            value={dietaryPreference}
                                            onChange={(e) => setDietaryPreference(e.target.value)}
                                            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em`, paddingRight: `2.5rem` }}
                                        >
                                            {DIET_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value} className="bg-neutral-900 text-white">
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* ── Generate Button ── */}
                        <Button
                            className="w-full h-14 text-lg font-bold bg-brand-500 hover:bg-brand-600 text-white shadow-[0_0_25px_-5px_hsl(var(--brand)/0.5)] transition-all rounded-xl relative overflow-hidden group"
                            onClick={handleGenerate}
                            disabled={isGenerating || !selectedShift}
                        >
                            {/* Animated sheen effect */}
                            <div className="absolute inset-0 -translate-x-full transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:translate-x-full" />

                            {isGenerating ? (
                                <span className="flex items-center gap-3 relative z-10">
                                    <RefreshCw className="h-5 w-5 animate-spin" />
                                    {step === 'generating' ? 'Stabilizing Core...' : 'Synthesizing Plan...'}
                                </span>
                            ) : (
                                <span className="flex items-center gap-2 relative z-10 text-glow tracking-wide">
                                    <Zap className="h-5 w-5 fill-white" />
                                    GENERATE PLAN
                                </span>
                            )}
                        </Button>

                        {/* ── Error ── */}
                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0, y: -10 }}
                                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400 flex items-start gap-3"
                                >
                                    <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                                    <span>{error}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ── Main Content Area ── */}
                    <div className="lg:col-span-8 space-y-8">

                        {!dayPlan && !circadianProfile && !isGenerating && (
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="h-full min-h-[400px] rounded-2xl border border-white/5 border-dashed bg-white/[0.02] flex flex-col items-center justify-center text-center p-8"
                            >
                                <div className="bg-white/5 p-4 rounded-full mb-4">
                                    <Zap className="h-8 w-8 text-neutral-500" />
                                </div>
                                <h3 className="text-xl font-bold text-neutral-300 mb-2">Ready to optimize your shift?</h3>
                                <p className="text-neutral-500 max-w-sm">
                                    Configure your preferences and hit Generate to receive your chronobiology-aligned nutrition and performance protocol.
                                </p>
                            </motion.div>
                        )}

                        {/* ── Circadian Profile Summary ── */}
                        <AnimatePresence>
                            {circadianProfile && (
                                <motion.section
                                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                    className="space-y-4"
                                >
                                    <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                                        <div className="h-px bg-neutral-800 flex-1" />
                                        Circadian Rhythm Model
                                        <div className="h-px bg-neutral-800 flex-1" />
                                    </h2>
                                    <CircadianSummary profile={circadianProfile} />
                                </motion.section>
                            )}
                        </AnimatePresence>

                        {/* ── Weekly Performance Trends ── */}
                        <AnimatePresence>
                            {weeklyStats && (
                                <TrendsSection data={weeklyStats} />
                            )}
                        </AnimatePresence>

                        {/* ── AI Day Plan ── */}
                        <AnimatePresence>
                            {dayPlan && (
                                <motion.section
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="space-y-8"
                                >
                                    <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                                        <div className="h-px bg-neutral-800 flex-1" />
                                        Performance Protocol
                                        <div className="h-px bg-neutral-800 flex-1" />
                                    </h2>

                                    {/* Decision Engine Parameters Card */}
                                    {dayPlan.decisionParameters && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="glass-card p-4 border-brand-500/20 bg-brand-500/5 grid grid-cols-2 md:grid-cols-4 gap-4"
                                        >
                                            <div className="text-center md:text-left">
                                                <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Calculated TDEE</p>
                                                <p className="text-lg font-black text-white">{dayPlan.decisionParameters.calories} kcal</p>
                                            </div>
                                            <div className="text-center md:text-left">
                                                <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Protein Target</p>
                                                <p className="text-lg font-black text-white">{dayPlan.decisionParameters.protein_g}g</p>
                                            </div>
                                            <div className="text-center md:text-left">
                                                <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Volume Scaling</p>
                                                <p className="text-lg font-black text-white">{Math.round(dayPlan.decisionParameters.volume_modifier * 100)}%</p>
                                            </div>
                                            <div className="text-center md:text-left">
                                                <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Deload Status</p>
                                                <p className={cn("text-lg font-black", dayPlan.decisionParameters.deload ? "text-amber-400" : "text-emerald-400")}>
                                                    {dayPlan.decisionParameters.deload ? "ACTIVE" : "SKIPPED"}
                                                </p>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Coaching message */}
                                    <motion.div
                                        initial={{ scale: 0.95 }}
                                        animate={{ scale: 1 }}
                                        className="rounded-2xl bg-gradient-to-br from-brand-600/20 to-purple-600/20 border border-brand-500/30 p-6 relative overflow-hidden"
                                    >
                                        <Zap className="absolute -right-4 -top-4 h-24 w-24 text-brand-500/10 rotate-12" />
                                        <p className="text-lg font-medium text-brand-100 leading-relaxed relative z-10 italic">
                                            "{dayPlan.coaching_message}"
                                        </p>
                                    </motion.div>

                                    {/* --- Interactive Tracking Hub --- */}
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.3 }}
                                    >
                                        <InteractiveTrackingHub
                                            initialProgress={todayProgress}
                                            suggestedSupps={dayPlan.supplement_suggestions || []}
                                            hydrationTarget={parseFloat(dayPlan.hydration_goal || '3.5')}
                                            isLightExposureRequired={!!circadianProfile}
                                        />
                                    </motion.div>

                                    {/* Meals */}
                                    <div className="space-y-4">
                                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                            <Utensils className="h-5 w-5 text-brand-500" /> Nutrition Schedule
                                        </h3>
                                        {dayPlan.meals.length === 0 ? (
                                            <p className="text-sm text-neutral-500 italic bg-white/5 p-4 rounded-xl text-center">No meals required during this period.</p>
                                        ) : (
                                            <div className="space-y-6">
                                                {dayPlan.meals.map((meal, idx) => (
                                                    <MealCard
                                                        key={idx}
                                                        meal={meal}
                                                        index={idx}
                                                        preferences={{
                                                            primaryGoal,
                                                            dietaryPreference,
                                                            dietMode: userStatus?.preferences?.dietMode
                                                        }}
                                                        onSwap={(newMeal) => {
                                                            const newMeals = [...dayPlan.meals];
                                                            newMeals[idx] = newMeal;
                                                            setDayPlan({ ...dayPlan, meals: newMeals });
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Interactive Workout Hub */}
                                    <WorkoutLogHub
                                        suggestion={dayPlan.workout_suggestion}
                                        userId={user?.id || ''}
                                    />

                                    {/* Stimulants */}
                                    <div className="glass-card border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-6 relative overflow-hidden group">
                                        <Coffee className="absolute -right-6 -bottom-6 h-32 w-32 text-amber-500/5 group-hover:text-amber-500/10 transition-colors" />
                                        <div className="flex items-center gap-3 mb-4 relative z-10">
                                            <div className="bg-amber-500/20 p-2 rounded-lg">
                                                <Coffee className="h-5 w-5 text-amber-400" />
                                            </div>
                                            <h3 className="text-lg font-bold text-white uppercase tracking-wide">
                                                Stimulants
                                            </h3>
                                        </div>
                                        <p className="text-neutral-300 leading-relaxed relative z-10">
                                            {dayPlan.caffeine_advice}
                                        </p>
                                    </div>

                                    <div className="flex justify-center pt-4">
                                        <Button
                                            variant="outline"
                                            className="border-white/10 bg-white/5 hover:bg-white/10 text-white gap-2"
                                            onClick={async () => {
                                                const d = selectedShift?.shiftDate || today;
                                                try {
                                                    const res = await mealApi.get(`/grocery-list?date=${d}`);
                                                    const { list } = res.data;

                                                    if (!list || list.length === 0) {
                                                        alert(`No items found in your active plan for ${d}.`);
                                                        return;
                                                    }

                                                    const formattedList = list.map((l: any) => `- ${l.name} (${l.amount})`).join('\n');
                                                    alert(`Grocery List for ${d}:\n\n${formattedList}`);
                                                } catch (e: any) {
                                                    const msg = e?.response?.data?.error || "Failed to generate grocery list.";
                                                    alert(msg);
                                                }
                                            }}
                                        >
                                            <CalendarDays className="h-4 w-4" /> Generate Grocery List
                                        </Button>
                                    </div>
                                </motion.section>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
