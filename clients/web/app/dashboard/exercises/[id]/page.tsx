'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { exerciseApi } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft, Target, Dumbbell, CheckCircle2,
    Zap, List, BookOpen, BarChart3, Share2,
    ChevronRight, Loader2, AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { KEGEL_EXERCISES, BODY_PART_LABELS, type Exercise } from '@/lib/exercisedb';
import type { FreeExercise } from '@/app/api/exercises-free/route';

// ─── Unified Exercise Type ─────────────────────────────────────────────────────

type AnyExercise = FreeExercise | Exercise;

function isKegel(ex: AnyExercise): ex is Exercise {
    return 'gifUrl' in ex;
}

// ─── Category styling ──────────────────────────────────────────────────────────

function getCategoryStyle(bodyPart: string) {
    const bp = bodyPart?.toLowerCase() ?? '';
    if (['chest', 'back', 'shoulders', 'upper arms', 'lower arms'].includes(bp))
        return { color: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/20', label: 'Gym' };
    if (bp === 'cardio')
        return { color: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/20', label: 'Cardio' };
    if (bp === 'pelvic floor')
        return { color: 'text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/20', label: 'Kegel' };
    return { color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/20', label: 'Home' };
}

const LEVEL_COLORS: Record<string, string> = {
    beginner: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    intermediate: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    expert: 'text-red-400 bg-red-500/10 border-red-500/20',
};

// ─── Fetch exercise by ID from our free API ────────────────────────────────────

async function fetchExerciseById(id: string): Promise<AnyExercise | null> {
    // Check kegel first (no API needed)
    const kegel = KEGEL_EXERCISES.find(ex => ex.id === id);
    if (kegel) return kegel;

    try {
        const res = await fetch(`/api/exercises-free?id=${encodeURIComponent(id)}`);
        if (!res.ok) return null;
        return await res.json() as FreeExercise;
    } catch {
        return null;
    }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();

    const [exercise, setExercise] = useState<AnyExercise | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [activeTab, setActiveTab] = useState<'instructions' | 'muscles' | 'tips' | 'analytics'>('instructions');
    const [activeImage, setActiveImage] = useState(0); // 0 = start position, 1 = end position
    const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

    const { data: analytics = [] } = useQuery({
        queryKey: ['exercise', 'analytics', exercise?.name],
        queryFn: async () => {
            if (!exercise?.name) return [];
            const res = await exerciseApi.get(`/analytics/${encodeURIComponent(exercise.name)}`);
            return res.data;
        },
        enabled: !!exercise?.name
    });

    useEffect(() => {
        fetchExerciseById(id).then(ex => {
            if (ex) setExercise(ex);
            else setError(true);
        }).catch(() => setError(true)).finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={32} className="text-brand-500 animate-spin" />
            </div>
        );
    }

    if (error || !exercise) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-5 text-center px-4">
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
                    <AlertCircle size={32} className="text-red-400" />
                </div>
                <div>
                    <h2 className="text-white font-bold text-xl">Exercise not found</h2>
                    <p className="text-neutral-500 text-sm mt-1">This exercise may not be in our library.</p>
                </div>
                <button
                    onClick={() => router.push('/dashboard/exercises')}
                    className="bg-brand-500 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-brand-600 transition-colors"
                >
                    Browse Exercises
                </button>
            </div>
        );
    }

    // ── Data extraction (handles both exercise types) ─────────────────────────
    const bodyPart = isKegel(exercise) ? (exercise as Exercise).bodyPart : (exercise as FreeExercise).bodyPart;
    const target = isKegel(exercise) ? (exercise as Exercise).target : (exercise as FreeExercise).target;
    const secondaryMuscles = exercise.secondaryMuscles;
    const instructions = exercise.instructions;
    const equipment = isKegel(exercise)
        ? (exercise as Exercise).equipment
        : ((exercise as FreeExercise).equipment ?? 'body only');
    const level = !isKegel(exercise) ? (exercise as FreeExercise).level : null;

    const images: string[] = isKegel(exercise)
        ? [(exercise as Exercise).gifUrl].filter(Boolean)
        : [
            (exercise as FreeExercise).imageUrl,
            (exercise as FreeExercise).imageUrl2,
        ].filter(Boolean);

    const style = getCategoryStyle(bodyPart);
    const bodyPartLabel = BODY_PART_LABELS[bodyPart] ?? bodyPart;
    const equipmentLabel = equipment === 'body only' ? 'Bodyweight' :
        (equipment ?? '').replace(/\b\w/g, c => c.toUpperCase());

    const progressPercent = instructions.length > 0
        ? Math.round((completedSteps.size / instructions.length) * 100)
        : 0;

    const toggleStep = (idx: number) => {
        const next = new Set(completedSteps);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        setCompletedSteps(next);
    };

    return (
        <div className="min-h-screen bg-transparent">

            {/* ── Sticky Header ──────────────────────────────────────────── */}
            <div className="sticky top-14 md:top-0 z-30 flex items-center gap-3 px-4 py-3 bg-background/85 backdrop-blur-xl border-b border-white/[0.06]">
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all shrink-0"
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="flex-1 min-w-0">
                    <h2 className="text-white font-bold text-sm leading-tight truncate">{exercise.name}</h2>
                    <p className="text-neutral-500 text-xs">{style.label} · {bodyPartLabel}</p>
                </div>
                {level && (
                    <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-lg border capitalize shrink-0", LEVEL_COLORS[level])}>
                        {level}
                    </span>
                )}
            </div>

            <div className="max-w-3xl mx-auto px-4 md:px-8 pb-20">

                {/* ── Image Viewer ─────────────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-5 mb-5"
                >
                    {/* Main image */}
                    <div className="relative rounded-3xl overflow-hidden bg-black/50 border border-white/[0.06] aspect-video flex items-center justify-center">
                        <AnimatePresence mode="wait">
                            {images.length > 0 ? (
                                <motion.img
                                    key={activeImage}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.25 }}
                                    src={images[activeImage]}
                                    alt={`${exercise.name} — position ${activeImage + 1}`}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-3 text-neutral-700 py-12">
                                    <Dumbbell size={52} />
                                    <span className="text-sm font-medium">Exercise Guide</span>
                                </div>
                            )}
                        </AnimatePresence>

                        {/* Exercise name overlay */}
                        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
                            <h1 className="text-white font-black text-xl md:text-2xl leading-tight">{exercise.name}</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={cn("text-xs font-bold", style.color)}>{style.label}</span>
                                <span className="text-neutral-600">·</span>
                                <span className="text-neutral-400 text-xs capitalize">{bodyPartLabel}</span>
                            </div>
                        </div>
                    </div>

                    {/* Position thumbnails (start / end) */}
                    {images.length > 1 && (
                        <div className="flex gap-2 mt-3">
                            {images.map((img, i) => (
                                <button
                                    key={i}
                                    onClick={() => setActiveImage(i)}
                                    className={cn(
                                        "flex-1 rounded-2xl overflow-hidden border-2 transition-all h-20",
                                        activeImage === i
                                            ? "border-brand-500 opacity-100"
                                            : "border-white/10 opacity-50 hover:opacity-80"
                                    )}
                                >
                                    <img src={img} alt={`Position ${i + 1}`} className="w-full h-full object-cover" />
                                </button>
                            ))}
                            <div className="flex flex-col justify-center items-center gap-0.5 px-3 text-center">
                                <span className="text-[10px] text-neutral-600 font-semibold uppercase tracking-wider">
                                    {activeImage === 0 ? 'Start' : 'End'}
                                </span>
                                <span className="text-neutral-700 text-[10px]">Position</span>
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* ── Quick Stats ───────────────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-3 gap-3 mb-5"
                >
                    {[
                        { label: 'Target', value: bodyPartLabel, color: style.color, icon: Target },
                        {
                            label: 'Equipment', value: equipmentLabel,
                            color: 'text-blue-400', icon: Dumbbell
                        },
                        {
                            label: 'Steps', value: `${instructions.length} steps`,
                            color: 'text-emerald-400', icon: List
                        },
                    ].map(s => (
                        <div key={s.label} className="bg-white/[0.04] border border-white/[0.05] rounded-2xl p-3 text-center">
                            <s.icon size={16} className={cn("mx-auto mb-1.5", s.color)} />
                            <p className="text-white text-xs font-bold leading-tight">{s.value}</p>
                            <p className="text-neutral-700 text-[10px] mt-0.5 uppercase tracking-wider">{s.label}</p>
                        </div>
                    ))}
                </motion.div>

                {/* ── Step Progress Bar ─────────────────────────────────────── */}
                <AnimatePresence>
                    {completedSteps.size > 0 && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-5 bg-white/[0.04] border border-white/[0.05] rounded-2xl p-4 overflow-hidden"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-white text-xs font-semibold">Study Progress</span>
                                <span className={cn("text-xs font-black", style.color)}>{progressPercent}%</span>
                            </div>
                            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-brand-500 rounded-full"
                                    animate={{ width: `${progressPercent}%` }}
                                    transition={{ type: 'spring', stiffness: 200 }}
                                />
                            </div>
                            {progressPercent === 100 && (
                                <p className="text-emerald-400 text-xs font-semibold mt-2 flex items-center gap-1.5">
                                    <CheckCircle2 size={12} /> All steps reviewed — ready to perform!
                                </p>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Tabs ─────────────────────────────────────────────────── */}
                <div className="flex gap-1 p-1 bg-white/[0.04] border border-white/[0.05] rounded-2xl mb-5">
                    {([
                        { id: 'instructions', label: 'How to Perform', icon: List },
                        { id: 'muscles', label: 'Muscles', icon: Target },
                        { id: 'tips', label: 'Pro Tips', icon: BookOpen },
                        { id: 'analytics', label: 'Progress', icon: BarChart3 },
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all',
                                activeTab === tab.id
                                    ? 'bg-white text-gray-950 shadow-sm'
                                    : 'text-neutral-600 hover:text-neutral-300'
                            )}
                        >
                            <tab.icon size={13} />
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* ── Tab Content ───────────────────────────────────────────── */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                    >

                        {/* Instructions */}
                        {activeTab === 'instructions' && (
                            <div className="space-y-2">
                                {instructions.map((step, idx) => (
                                    <motion.button
                                        key={idx}
                                        onClick={() => toggleStep(idx)}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.04 }}
                                        className={cn(
                                            "w-full text-left flex items-start gap-3.5 p-4 rounded-2xl border transition-all",
                                            completedSteps.has(idx)
                                                ? "bg-emerald-500/8 border-emerald-500/20"
                                                : "bg-white/[0.03] border-white/[0.05] hover:bg-white/[0.06]"
                                        )}
                                    >
                                        <div className={cn(
                                            "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black border transition-all mt-0.5",
                                            completedSteps.has(idx)
                                                ? "bg-emerald-500 border-emerald-500 text-white"
                                                : "border-white/20 text-neutral-600"
                                        )}>
                                            {completedSteps.has(idx)
                                                ? <CheckCircle2 size={12} />
                                                : idx + 1}
                                        </div>
                                        <p className={cn(
                                            "text-sm leading-relaxed transition-colors",
                                            completedSteps.has(idx)
                                                ? "text-emerald-300 line-through decoration-emerald-500/40"
                                                : "text-neutral-200"
                                        )}>
                                            {step}
                                        </p>
                                    </motion.button>
                                ))}
                            </div>
                        )}

                        {/* Muscles */}
                        {activeTab === 'muscles' && (
                            <div className="space-y-3">
                                {/* Primary */}
                                <div className={cn("rounded-2xl border p-4", style.bg, style.border)}>
                                    <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Primary Muscle</p>
                                    <div className="flex items-center gap-3">
                                        <Target size={18} className={style.color} />
                                        <div>
                                            <p className={cn("font-black text-base capitalize", style.color)}>{target}</p>
                                            <p className="text-neutral-500 text-xs capitalize">{bodyPartLabel} — main target</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Secondary */}
                                {secondaryMuscles.length > 0 && (
                                    <div className="bg-white/[0.04] border border-white/[0.05] rounded-2xl p-4">
                                        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">Secondary Muscles</p>
                                        <div className="flex flex-wrap gap-2">
                                            {secondaryMuscles.map(m => (
                                                <span
                                                    key={m}
                                                    className="px-3 py-1.5 bg-white/[0.06] border border-white/10 rounded-xl text-xs font-medium text-neutral-300 capitalize"
                                                >
                                                    {m}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Equipment */}
                                <div className="bg-white/[0.04] border border-white/[0.05] rounded-2xl p-4">
                                    <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">Equipment Required</p>
                                    <div className="flex items-center gap-3">
                                        <Dumbbell size={18} className="text-amber-400" />
                                        <div>
                                            <p className="text-white font-bold capitalize">{equipmentLabel}</p>
                                            {equipment === 'body only' && (
                                                <p className="text-emerald-400 text-xs mt-0.5">✓ No gym required</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Pro Tips */}
                        {activeTab === 'tips' && (
                            <div className="space-y-3">
                                {[
                                    {
                                        emoji: '🎯',
                                        title: 'Form First',
                                        tip: 'Perfect technique beats heavy weight every time. Lower the load and focus on feeling the target muscle work through the full range of motion.',
                                        color: 'border-blue-500/20 bg-blue-500/5',
                                    },
                                    {
                                        emoji: '⏱️',
                                        title: 'Control the Eccentric',
                                        tip: 'Take 2-3 seconds on the lowering phase. This creates more tension, more muscle damage (good!), and forces proper control of the movement.',
                                        color: 'border-brand-500/20 bg-brand-500/5',
                                    },
                                    {
                                        emoji: '🧠',
                                        title: 'Mind-Muscle Connection',
                                        tip: `Actively think about squeezing your ${target} throughout every rep. Studies show this can increase muscle activation by up to 25%.`,
                                        color: 'border-violet-500/20 bg-violet-500/5',
                                    },
                                    {
                                        emoji: '📈',
                                        title: 'Progressive Overload',
                                        tip: 'Add small amounts of weight (1-2 kg) or 1-2 reps each week. Track your sessions so you can see consistent improvement over time.',
                                        color: 'border-emerald-500/20 bg-emerald-500/5',
                                    },
                                    {
                                        emoji: '🌙',
                                        title: 'Night Shift Tip',
                                        tip: 'If training post-shift, prioritize compound lifts first when energy is highest. End with isolation work. Your circadian rhythm affects strength output by up to 20%.',
                                        color: 'border-indigo-500/20 bg-indigo-500/5',
                                    },
                                ].map((tip, idx) => (
                                    <motion.div
                                        key={tip.title}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.06 }}
                                        className={cn("rounded-2xl border p-4 flex gap-3", tip.color)}
                                    >
                                        <span className="text-xl shrink-0 mt-0.5">{tip.emoji}</span>
                                        <div>
                                            <p className="text-white font-bold text-sm mb-1">{tip.title}</p>
                                            <p className="text-neutral-400 text-sm leading-relaxed">{tip.tip}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {/* Analytics */}
                        {activeTab === 'analytics' && (
                            <div className="space-y-4">
                                {analytics.length === 0 ? (
                                    <div className="bg-white/[0.04] border border-white/[0.05] rounded-2xl p-8 text-center">
                                        <BarChart3 size={32} className="mx-auto text-neutral-600 mb-3" />
                                        <p className="text-white font-bold">No data yet</p>
                                        <p className="text-neutral-500 text-sm mt-1">Log this exercise to see your progression over time.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="bg-white/[0.04] border border-white/[0.05] rounded-2xl p-4">
                                            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-4">Max Weight History</p>
                                            <div className="h-48">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={analytics}>
                                                        <XAxis
                                                            dataKey="date"
                                                            tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                            stroke="#525252"
                                                            fontSize={10}
                                                            tickMargin={10}
                                                        />
                                                        <Tooltip
                                                            contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', borderRadius: '12px' }}
                                                            itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                                        />
                                                        <Line type="monotone" dataKey="maxWeight" name="Weight (kg)" stroke="#f97316" strokeWidth={3} dot={{ r: 4, fill: '#f97316' }} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        <div className="bg-white/[0.04] border border-white/[0.05] rounded-2xl p-4">
                                            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-4">Volume Progression</p>
                                            <div className="h-48">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={analytics}>
                                                        <XAxis
                                                            dataKey="date"
                                                            tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                            stroke="#525252"
                                                            fontSize={10}
                                                            tickMargin={10}
                                                        />
                                                        <Tooltip
                                                            contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', borderRadius: '12px' }}
                                                            itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                                        />
                                                        <Line type="monotone" dataKey="volume" name="Volume (kg)" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                    </motion.div>
                </AnimatePresence>

                {/* ── CTA Buttons ───────────────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="mt-8 flex gap-3"
                >
                    <button
                        onClick={() => router.push('/dashboard/exercise')}
                        className="flex-1 bg-brand-500 hover:bg-brand-600 text-white py-4 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2"
                    >
                        <Dumbbell size={16} />
                        Log This Exercise
                    </button>
                    <button
                        onClick={() => router.push('/dashboard/exercises')}
                        className="px-5 bg-white/[0.05] hover:bg-white/10 border border-white/10 rounded-2xl text-neutral-400 hover:text-white transition-all"
                    >
                        <ChevronLeft size={18} />
                    </button>
                </motion.div>
            </div>
        </div>
    );
}
