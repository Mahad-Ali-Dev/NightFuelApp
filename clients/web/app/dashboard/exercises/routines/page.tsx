'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
    ChevronLeft, Dumbbell, Clock, Target, Star,
    Flame, Zap, Heart, Shield, Play, ChevronRight,
    Home, Repeat, TrendingUp, Users, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { startWorkoutSession, getRoutines } from '@/lib/api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

// ─── Routine Templates ─────────────────────────────────────────────────────────

interface Exercise {
    name: string;
    sets: number;
    reps: string;
    rest: string;
}

interface RoutineDay {
    name: string;
    focus: string;
    exercises: Exercise[];
}

interface Routine {
    id: string;
    name: string;
    description: string;
    level: 'Beginner' | 'Intermediate' | 'Advanced';
    duration: string;
    frequency: string;
    icon: React.ReactNode;
    color: string;
    bg: string;
    borderColor: string;
    tags: string[];
    days: RoutineDay[];
    isCustom?: boolean;
}

const BUILTIN_ROUTINES: Routine[] = [
    {
        id: 'ppl',
        name: 'Push Pull Legs',
        description: 'Classic 6-day split targeting push, pull, and leg movements for balanced development.',
        level: 'Intermediate',
        duration: '60–75 min',
        frequency: '6x / week',
        icon: <Dumbbell size={20} />,
        color: 'text-orange-400',
        bg: 'bg-orange-500/15',
        borderColor: 'border-orange-500/20',
        tags: ['Hypertrophy', 'Strength'],
        days: [
            {
                name: 'Push A', focus: 'Chest, Shoulders, Triceps',
                exercises: [
                    { name: 'Barbell Bench Press', sets: 4, reps: '8–10', rest: '90s' },
                    { name: 'Overhead Press', sets: 3, reps: '8–10', rest: '90s' },
                    { name: 'Incline Dumbbell Press', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Cable Lateral Raise', sets: 3, reps: '12–15', rest: '45s' },
                    { name: 'Tricep Pushdown', sets: 3, reps: '12–15', rest: '45s' },
                    { name: 'Overhead Tricep Extension', sets: 3, reps: '12–15', rest: '45s' },
                ],
            },
            {
                name: 'Pull A', focus: 'Back, Biceps, Rear Delts',
                exercises: [
                    { name: 'Barbell Row', sets: 4, reps: '8–10', rest: '90s' },
                    { name: 'Pull-ups', sets: 3, reps: '6–10', rest: '90s' },
                    { name: 'Seated Cable Row', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Face Pull', sets: 3, reps: '15–20', rest: '45s' },
                    { name: 'Barbell Curl', sets: 3, reps: '10–12', rest: '45s' },
                    { name: 'Hammer Curl', sets: 3, reps: '10–12', rest: '45s' },
                ],
            },
            {
                name: 'Legs A', focus: 'Quads, Hamstrings, Calves',
                exercises: [
                    { name: 'Barbell Squat', sets: 4, reps: '6–8', rest: '2min' },
                    { name: 'Romanian Deadlift', sets: 3, reps: '8–10', rest: '90s' },
                    { name: 'Leg Press', sets: 3, reps: '10–12', rest: '90s' },
                    { name: 'Leg Curl', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Standing Calf Raise', sets: 4, reps: '12–15', rest: '45s' },
                    { name: 'Walking Lunges', sets: 3, reps: '12 each', rest: '60s' },
                ],
            },
            {
                name: 'Push B', focus: 'Chest, Shoulders, Triceps',
                exercises: [
                    { name: 'Dumbbell Bench Press', sets: 4, reps: '8–10', rest: '90s' },
                    { name: 'Arnold Press', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Cable Fly', sets: 3, reps: '12–15', rest: '45s' },
                    { name: 'Lateral Raise', sets: 4, reps: '12–15', rest: '45s' },
                    { name: 'Close-Grip Bench Press', sets: 3, reps: '8–10', rest: '60s' },
                    { name: 'Skull Crushers', sets: 3, reps: '10–12', rest: '45s' },
                ],
            },
            {
                name: 'Pull B', focus: 'Back, Biceps, Rear Delts',
                exercises: [
                    { name: 'Deadlift', sets: 4, reps: '5–6', rest: '2min' },
                    { name: 'Lat Pulldown', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'One-Arm Dumbbell Row', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Rear Delt Fly', sets: 3, reps: '12–15', rest: '45s' },
                    { name: 'Incline Dumbbell Curl', sets: 3, reps: '10–12', rest: '45s' },
                    { name: 'Preacher Curl', sets: 3, reps: '10–12', rest: '45s' },
                ],
            },
            {
                name: 'Legs B', focus: 'Quads, Glutes, Calves',
                exercises: [
                    { name: 'Front Squat', sets: 4, reps: '6–8', rest: '2min' },
                    { name: 'Hip Thrust', sets: 3, reps: '8–10', rest: '90s' },
                    { name: 'Bulgarian Split Squat', sets: 3, reps: '10 each', rest: '60s' },
                    { name: 'Leg Extension', sets: 3, reps: '12–15', rest: '45s' },
                    { name: 'Seated Calf Raise', sets: 4, reps: '15–20', rest: '45s' },
                    { name: 'Glute Bridge', sets: 3, reps: '12–15', rest: '60s' },
                ],
            },
        ],
    },
    {
        id: 'bro-split',
        name: 'Bro Split',
        description: 'Dedicate each day to one muscle group for maximum volume and focus.',
        level: 'Intermediate',
        duration: '50–60 min',
        frequency: '5x / week',
        icon: <Flame size={20} />,
        color: 'text-red-400',
        bg: 'bg-red-500/15',
        borderColor: 'border-red-500/20',
        tags: ['Bodybuilding', 'Volume'],
        days: [
            {
                name: 'Chest Day', focus: 'Chest',
                exercises: [
                    { name: 'Flat Barbell Bench Press', sets: 4, reps: '8–10', rest: '90s' },
                    { name: 'Incline Dumbbell Press', sets: 4, reps: '10–12', rest: '60s' },
                    { name: 'Decline Dumbbell Press', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Cable Fly', sets: 3, reps: '12–15', rest: '45s' },
                    { name: 'Pec Deck Machine', sets: 3, reps: '15', rest: '45s' },
                ],
            },
            {
                name: 'Back Day', focus: 'Back',
                exercises: [
                    { name: 'Deadlift', sets: 4, reps: '5–6', rest: '2min' },
                    { name: 'Barbell Row', sets: 4, reps: '8–10', rest: '90s' },
                    { name: 'Lat Pulldown', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Seated Cable Row', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Face Pull', sets: 3, reps: '15–20', rest: '45s' },
                ],
            },
            {
                name: 'Shoulders Day', focus: 'Shoulders',
                exercises: [
                    { name: 'Overhead Press', sets: 4, reps: '8–10', rest: '90s' },
                    { name: 'Lateral Raise', sets: 4, reps: '12–15', rest: '45s' },
                    { name: 'Rear Delt Fly', sets: 3, reps: '15', rest: '45s' },
                    { name: 'Arnold Press', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Shrugs', sets: 3, reps: '12–15', rest: '45s' },
                ],
            },
            {
                name: 'Legs Day', focus: 'Legs',
                exercises: [
                    { name: 'Barbell Squat', sets: 4, reps: '6–8', rest: '2min' },
                    { name: 'Romanian Deadlift', sets: 3, reps: '8–10', rest: '90s' },
                    { name: 'Leg Press', sets: 3, reps: '10–12', rest: '90s' },
                    { name: 'Leg Curl', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Calf Raises', sets: 4, reps: '15–20', rest: '45s' },
                ],
            },
            {
                name: 'Arms Day', focus: 'Biceps & Triceps',
                exercises: [
                    { name: 'Barbell Curl', sets: 4, reps: '10–12', rest: '60s' },
                    { name: 'Close-Grip Bench Press', sets: 4, reps: '8–10', rest: '60s' },
                    { name: 'Hammer Curl', sets: 3, reps: '10–12', rest: '45s' },
                    { name: 'Tricep Pushdown', sets: 3, reps: '12–15', rest: '45s' },
                    { name: 'Incline Dumbbell Curl', sets: 3, reps: '10–12', rest: '45s' },
                    { name: 'Overhead Extension', sets: 3, reps: '12–15', rest: '45s' },
                ],
            },
        ],
    },
    {
        id: 'full-body',
        name: 'Full Body',
        description: 'Hit every muscle group each session — perfect for busy schedules or beginners.',
        level: 'Beginner',
        duration: '45–60 min',
        frequency: '3x / week',
        icon: <Zap size={20} />,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/15',
        borderColor: 'border-emerald-500/20',
        tags: ['Beginner', 'Efficient'],
        days: [
            {
                name: 'Workout A', focus: 'Full Body',
                exercises: [
                    { name: 'Barbell Squat', sets: 3, reps: '8–10', rest: '90s' },
                    { name: 'Bench Press', sets: 3, reps: '8–10', rest: '90s' },
                    { name: 'Barbell Row', sets: 3, reps: '8–10', rest: '90s' },
                    { name: 'Overhead Press', sets: 3, reps: '8–10', rest: '60s' },
                    { name: 'Plank', sets: 3, reps: '30–60s', rest: '45s' },
                ],
            },
            {
                name: 'Workout B', focus: 'Full Body',
                exercises: [
                    { name: 'Deadlift', sets: 3, reps: '6–8', rest: '2min' },
                    { name: 'Dumbbell Bench Press', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Pull-ups', sets: 3, reps: 'Max', rest: '90s' },
                    { name: 'Dumbbell Lunges', sets: 3, reps: '10 each', rest: '60s' },
                    { name: 'Hanging Knee Raise', sets: 3, reps: '12–15', rest: '45s' },
                ],
            },
            {
                name: 'Workout C', focus: 'Full Body',
                exercises: [
                    { name: 'Front Squat', sets: 3, reps: '8–10', rest: '90s' },
                    { name: 'Incline Dumbbell Press', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Lat Pulldown', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Romanian Deadlift', sets: 3, reps: '10–12', rest: '90s' },
                    { name: 'Face Pull', sets: 3, reps: '15–20', rest: '45s' },
                ],
            },
        ],
    },
    {
        id: 'upper-lower',
        name: 'Upper / Lower',
        description: '4-day split alternating upper and lower body for balanced strength gains.',
        level: 'Intermediate',
        duration: '55–70 min',
        frequency: '4x / week',
        icon: <Repeat size={20} />,
        color: 'text-blue-400',
        bg: 'bg-blue-500/15',
        borderColor: 'border-blue-500/20',
        tags: ['Balanced', 'Strength'],
        days: [
            {
                name: 'Upper A', focus: 'Chest, Back, Shoulders, Arms',
                exercises: [
                    { name: 'Bench Press', sets: 4, reps: '6–8', rest: '2min' },
                    { name: 'Barbell Row', sets: 4, reps: '6–8', rest: '90s' },
                    { name: 'Overhead Press', sets: 3, reps: '8–10', rest: '90s' },
                    { name: 'Pull-ups', sets: 3, reps: '8–10', rest: '60s' },
                    { name: 'Barbell Curl', sets: 3, reps: '10–12', rest: '45s' },
                    { name: 'Tricep Pushdown', sets: 3, reps: '10–12', rest: '45s' },
                ],
            },
            {
                name: 'Lower A', focus: 'Quads, Hamstrings, Glutes, Calves',
                exercises: [
                    { name: 'Barbell Squat', sets: 4, reps: '6–8', rest: '2min' },
                    { name: 'Romanian Deadlift', sets: 3, reps: '8–10', rest: '90s' },
                    { name: 'Leg Press', sets: 3, reps: '10–12', rest: '90s' },
                    { name: 'Leg Curl', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Standing Calf Raise', sets: 4, reps: '12–15', rest: '45s' },
                ],
            },
            {
                name: 'Upper B', focus: 'Chest, Back, Shoulders, Arms',
                exercises: [
                    { name: 'Dumbbell Bench Press', sets: 4, reps: '8–10', rest: '90s' },
                    { name: 'One-Arm Row', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Arnold Press', sets: 3, reps: '10–12', rest: '60s' },
                    { name: 'Cable Fly', sets: 3, reps: '12–15', rest: '45s' },
                    { name: 'Hammer Curl', sets: 3, reps: '10–12', rest: '45s' },
                    { name: 'Skull Crushers', sets: 3, reps: '10–12', rest: '45s' },
                ],
            },
            {
                name: 'Lower B', focus: 'Quads, Glutes, Calves',
                exercises: [
                    { name: 'Front Squat', sets: 4, reps: '8–10', rest: '90s' },
                    { name: 'Hip Thrust', sets: 3, reps: '10–12', rest: '90s' },
                    { name: 'Bulgarian Split Squat', sets: 3, reps: '10 each', rest: '60s' },
                    { name: 'Leg Extension', sets: 3, reps: '12–15', rest: '45s' },
                    { name: 'Seated Calf Raise', sets: 4, reps: '15–20', rest: '45s' },
                ],
            },
        ],
    },
    {
        id: 'home-hiit',
        name: 'Home HIIT',
        description: 'No equipment needed — burn fat and build endurance from anywhere.',
        level: 'Beginner',
        duration: '25–35 min',
        frequency: '4–5x / week',
        icon: <Home size={20} />,
        color: 'text-amber-400',
        bg: 'bg-amber-500/15',
        borderColor: 'border-amber-500/20',
        tags: ['No Equipment', 'Fat Burn'],
        days: [
            {
                name: 'HIIT A', focus: 'Full Body Cardio',
                exercises: [
                    { name: 'Burpees', sets: 4, reps: '10', rest: '30s' },
                    { name: 'Mountain Climbers', sets: 4, reps: '20', rest: '30s' },
                    { name: 'Jump Squats', sets: 4, reps: '15', rest: '30s' },
                    { name: 'Push-ups', sets: 4, reps: '12–15', rest: '30s' },
                    { name: 'High Knees', sets: 4, reps: '30s', rest: '30s' },
                    { name: 'Plank Hold', sets: 3, reps: '45s', rest: '15s' },
                ],
            },
            {
                name: 'HIIT B', focus: 'Core & Lower Body',
                exercises: [
                    { name: 'Squat Jumps', sets: 4, reps: '12', rest: '30s' },
                    { name: 'Walking Lunges', sets: 3, reps: '12 each', rest: '30s' },
                    { name: 'Bicycle Crunches', sets: 4, reps: '20', rest: '20s' },
                    { name: 'Glute Bridge', sets: 4, reps: '15', rest: '30s' },
                    { name: 'Side Plank', sets: 3, reps: '30s each', rest: '15s' },
                    { name: 'Flutter Kicks', sets: 3, reps: '20', rest: '20s' },
                ],
            },
            {
                name: 'HIIT C', focus: 'Upper Body & Core',
                exercises: [
                    { name: 'Diamond Push-ups', sets: 4, reps: '10', rest: '30s' },
                    { name: 'Pike Push-ups', sets: 3, reps: '8', rest: '30s' },
                    { name: 'Dips (Chair)', sets: 4, reps: '12', rest: '30s' },
                    { name: 'Commandos', sets: 3, reps: '10 each', rest: '30s' },
                    { name: 'V-ups', sets: 3, reps: '12', rest: '20s' },
                    { name: 'Superman Hold', sets: 3, reps: '30s', rest: '15s' },
                ],
            },
        ],
    },
];

const LEVEL_STYLES: Record<string, string> = {
    Beginner: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    Intermediate: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    Advanced: 'text-red-400 bg-red-500/10 border-red-500/20',
};

// ─── Page Component ─────────────────────────────────────────────────────────

export default function RoutinesPage() {
    const router = useRouter();
    const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
    const [selectedDayIdx, setSelectedDayIdx] = useState(0);

    const startMutation = useMutation({
        mutationFn: async (routineId: string) => {
            const res = await startWorkoutSession(routineId);
            return res.data?.data ?? res.data;
        },
        onSuccess: (session: any) => {
            // Store current routine exercises in localStorage for workout page
            if (selectedRoutine) {
                const day = selectedRoutine.days[selectedDayIdx];
                localStorage.setItem('nf_active_workout', JSON.stringify({
                    sessionId: session?.id ?? session?.sessionId,
                    routineName: selectedRoutine.name,
                    dayName: day?.name,
                    exercises: day?.exercises ?? [],
                }));
            }
            toast.success('Workout session started!');
            router.push('/dashboard/training/workout');
        },
        onError: () => {
            toast.error('Failed to start workout session');
        },
    });

    // Fetch user-created routines from the API
    const { data: dbRoutines = [] } = useQuery({
        queryKey: ['routines'],
        queryFn: async () => {
            const { data } = await getRoutines();
            return (data?.data ?? data ?? []);
        },
    });

    // Map DB routines to the same shape as built-in routines
    const userRoutines: Routine[] = (dbRoutines as any[]).map((r: any) => ({
        id: r.id,
        name: r.title,
        description: r.description || 'Custom routine',
        level: 'Intermediate' as const,
        duration: '45-60 min',
        frequency: `${(r.exercises?.length || 1)}x / week`,
        icon: <Star size={20} />,
        color: 'text-purple-400',
        bg: 'bg-purple-500/15',
        borderColor: 'border-purple-500/20',
        tags: r.muscleGroups || ['Custom'],
        isCustom: true,
        days: Array.isArray(r.exercises) ? r.exercises.map((d: any, idx: number) => ({
            name: d.name || `Day ${idx + 1}`,
            focus: d.focus || r.splitType || 'General',
            exercises: (d.exercises || []).map((ex: any) => ({
                name: ex.name,
                sets: ex.sets || 3,
                reps: ex.reps || '8-10',
                rest: ex.rest || '60s',
            })),
        })) : [],
    }));

    // Combine user-created routines (first) with built-in templates
    const allRoutines = [...userRoutines, ...BUILTIN_ROUTINES];

    const handleStartWorkout = () => {
        if (!selectedRoutine) return;
        startMutation.mutate(selectedRoutine.id);
    };

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-5xl mx-auto space-y-8">

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
                        <h1 className="text-3xl font-black text-white">Workout Routines</h1>
                        <p className="text-neutral-400 text-sm mt-0.5">Pre-built programs for every goal</p>
                    </div>
                </header>

                <AnimatePresence mode="wait">
                    {!selectedRoutine ? (
                        /* ─── Routine Cards ───────────────────────────────────────── */
                        <motion.div
                            key="list"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="grid gap-4 md:grid-cols-2"
                        >
                            {allRoutines.map((routine, i) => (
                                <motion.div
                                    key={routine.id}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.06 }}
                                    whileHover={{ y: -2 }}
                                    onClick={() => { setSelectedRoutine(routine); setSelectedDayIdx(0); }}
                                    className={cn(
                                        'glass-card p-6 rounded-2xl border cursor-pointer transition-all group',
                                        routine.borderColor, 'hover:bg-white/[0.06]'
                                    )}
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className={cn('p-3 rounded-xl', routine.bg)}>
                                            <span className={routine.color}>{routine.icon}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {routine.isCustom && (
                                                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border text-purple-400 bg-purple-500/10 border-purple-500/20">
                                                    Custom
                                                </span>
                                            )}
                                            <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full border', LEVEL_STYLES[routine.level])}>
                                                {routine.level}
                                            </span>
                                        </div>
                                    </div>
                                    <h3 className="text-white font-black text-lg">{routine.name}</h3>
                                    <p className="text-neutral-500 text-sm mt-1 leading-relaxed">{routine.description}</p>
                                    <div className="flex items-center gap-4 mt-4 text-xs text-neutral-500">
                                        <span className="flex items-center gap-1"><Clock size={12} /> {routine.duration}</span>
                                        <span className="flex items-center gap-1"><Repeat size={12} /> {routine.frequency}</span>
                                        <span className="flex items-center gap-1"><Target size={12} /> {routine.days.length} days</span>
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        {routine.tags.map((tag) => (
                                            <span key={tag} className="text-[10px] font-bold text-neutral-500 bg-white/5 px-2 py-0.5 rounded-lg">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    ) : (
                        /* ─── Routine Detail ──────────────────────────────────────── */
                        <motion.div
                            key="detail"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-6"
                        >
                            {/* Back + routine name */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setSelectedRoutine(null)}
                                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <div className={cn('p-2.5 rounded-xl', selectedRoutine.bg)}>
                                    <span className={selectedRoutine.color}>{selectedRoutine.icon}</span>
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-white">{selectedRoutine.name}</h2>
                                    <p className="text-neutral-500 text-xs">{selectedRoutine.frequency} · {selectedRoutine.duration}</p>
                                </div>
                            </div>

                            {/* Day tabs */}
                            <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                                {selectedRoutine.days.map((day, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedDayIdx(idx)}
                                        className={cn(
                                            'px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all border',
                                            idx === selectedDayIdx
                                                ? `${selectedRoutine.bg} ${selectedRoutine.color} ${selectedRoutine.borderColor}`
                                                : 'text-neutral-500 bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
                                        )}
                                    >
                                        {day.name}
                                    </button>
                                ))}
                            </div>

                            {/* Day detail */}
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={selectedDayIdx}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    className="glass-card rounded-2xl border-white/[0.06] overflow-hidden"
                                >
                                    <div className={cn('p-5 border-b border-white/[0.06]', selectedRoutine.bg)}>
                                        <h3 className="text-white font-bold">{selectedRoutine.days[selectedDayIdx]?.name}</h3>
                                        <p className="text-neutral-400 text-sm">{selectedRoutine.days[selectedDayIdx]?.focus}</p>
                                    </div>

                                    <div className="divide-y divide-white/[0.04]">
                                        {selectedRoutine.days[selectedDayIdx]?.exercises.map((ex, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ opacity: 0, x: -8 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.04 }}
                                                className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-neutral-500 text-xs font-bold">
                                                        {i + 1}
                                                    </div>
                                                    <div>
                                                        <p className="text-white font-medium text-sm">{ex.name}</p>
                                                        <p className="text-neutral-500 text-xs mt-0.5">
                                                            {ex.sets} × {ex.reps} · Rest {ex.rest}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Link href={`/dashboard/exercises`}>
                                                    <ChevronRight size={16} className="text-neutral-600 hover:text-white transition-colors" />
                                                </Link>
                                            </motion.div>
                                        ))}
                                    </div>

                                    {/* Start workout button */}
                                    <div className="p-4">
                                        <Button
                                            onClick={handleStartWorkout}
                                            disabled={startMutation.isPending}
                                            className={cn(
                                                'w-full py-6 rounded-2xl text-white font-bold text-base shadow-lg transition-all',
                                                'bg-brand-500 hover:bg-brand-600 shadow-brand-500/25'
                                            )}
                                        >
                                            {startMutation.isPending ? (
                                                <Loader2 size={18} className="mr-2 animate-spin" />
                                            ) : (
                                                <Play size={18} className="mr-2" />
                                            )}
                                            Start {selectedRoutine.days[selectedDayIdx]?.name}
                                        </Button>
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
