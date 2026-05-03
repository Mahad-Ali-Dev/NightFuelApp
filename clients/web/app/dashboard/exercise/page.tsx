'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { exerciseApi } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dumbbell,
    Zap,
    Timer,
    Flame,
    Plus,
    Trash2,
    ChevronLeft,
    CheckCircle2,
    Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

interface LibraryExercise {
    id: string;
    name: string;
    muscleGroup: string;
    equipment?: string;
}

interface ExerciseInput {
    name: string;
    sets?: number;
    reps?: number;
    weight?: number;
}

export default function LogExercisePage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [title, setTitle] = useState('');
    const [type, setType] = useState('STRENGTH');
    const [duration, setDuration] = useState(60);
    const [intensity, setIntensity] = useState('MODERATE');
    const [exercises, setExercises] = useState<ExerciseInput[]>([{ name: '', sets: 3, reps: 10 }]);
    const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

    // Fetch library exercises based on search query
    const { data: libraryOptions = [] } = useQuery({
        queryKey: ['exercise-library', searchQueries[focusedIndex ?? -1]],
        queryFn: async () => {
            const query = searchQueries[focusedIndex ?? -1];
            if (!query || query.length < 1) return [];
            const res = await exerciseApi.get('/library', { params: { query, limit: 10 } });
            return res.data as LibraryExercise[];
        },
        enabled: focusedIndex !== null && !!searchQueries[focusedIndex],
    });

    const addExercise = () => {
        setExercises([...exercises, { name: '', sets: 3, reps: 10 }]);
    };

    const removeExercise = (index: number) => {
        setExercises(exercises.filter((_, i) => i !== index));
    };

    const updateExercise = (index: number, field: keyof ExerciseInput, value: any) => {
        const newExercises = [...exercises];
        newExercises[index] = { ...newExercises[index], [field]: value } as ExerciseInput;
        setExercises(newExercises);
    };

    const mutation = useMutation({
        mutationFn: (data: any) => exerciseApi.post('/', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['exercises'] });
            toast.success('Workout logged successfully!');
            router.push('/dashboard');
        },
        onError: (e) => {
            console.error(e);
            toast.error('Failed to log workout');
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title) return toast.error('Please enter a workout title');

        mutation.mutate({
            title,
            type,
            duration,
            intensity,
            exercises: exercises.filter(ex => ex.name.trim() !== ''),
        });
    };

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8 relative">
            <div className="max-w-4xl mx-auto space-y-8">
                <header className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.back()}
                            className="bg-white/5 hover:bg-white/10 text-white rounded-xl"
                        >
                            <ChevronLeft size={20} />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                                <Dumbbell className="text-brand-500" /> Log Workout
                            </h1>
                            <p className="text-zinc-400">Track your progress and intensity.</p>
                        </div>
                    </div>
                </header>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Workout Stats */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="glass-card overflow-hidden border-white/5">
                            <CardHeader className="bg-brand-500/10 border-b border-white/5">
                                <CardTitle className="text-sm font-semibold text-brand-400">Workout Details</CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Workout Title</label>
                                    <Input
                                        placeholder="e.g. Upper Body Power"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="bg-white/5 border-white/10 text-white focus:border-brand-500 rounded-xl"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Type</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {['STRENGTH', 'CARDIO', 'HIIT', 'MOBILITY'].map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => setType(t)}
                                                className={cn(
                                                    "py-2 rounded-xl text-xs font-medium transition-all",
                                                    type === t ? "bg-brand-500 text-white shadow-lg" : "bg-white/5 text-zinc-400 hover:text-white"
                                                )}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Duration (min)</label>
                                        <div className="relative">
                                            <Timer className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                                            <Input
                                                type="number"
                                                value={duration}
                                                onChange={(e) => setDuration(parseInt(e.target.value))}
                                                className="bg-white/5 border-white/10 pl-9 text-white"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Intensity</label>
                                        <select
                                            value={intensity}
                                            onChange={(e) => setIntensity(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white focus:border-brand-500 outline-none"
                                        >
                                            <option value="LOW">Low</option>
                                            <option value="MODERATE">Moderate</option>
                                            <option value="HIGH">High</option>
                                        </select>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Button
                            type="submit"
                            disabled={mutation.isPending}
                            className="w-full py-6 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl shadow-xl shadow-brand-500/20 text-lg font-bold transition-all"
                        >
                            {mutation.isPending ? 'Saving...' : 'Finish Workout'}
                        </Button>
                    </div>

                    {/* Right Column: Exercises */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                <Activity size={20} className="text-brand-500" /> Exercises
                            </h2>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={addExercise}
                                className="bg-white/5 hover:bg-white/10 text-brand-400 h-9 rounded-xl"
                            >
                                <Plus size={16} className="mr-2" /> Add Movement
                            </Button>
                        </div>

                        <div className="space-y-4">
                            <AnimatePresence initial={false}>
                                {exercises.map((ex, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className="glass-panel p-6 rounded-2xl border-white/5 relative group"
                                    >
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                            <div className="md:col-span-6 space-y-2 relative">
                                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Exercise Name</label>
                                                <Input
                                                    placeholder="Search e.g. Bench Press..."
                                                    value={searchQueries[idx] ?? ex.name}
                                                    onFocus={() => setFocusedIndex(idx)}
                                                    onBlur={() => setTimeout(() => setFocusedIndex(null), 200)}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setSearchQueries({ ...searchQueries, [idx]: val });
                                                        updateExercise(idx, 'name', val);
                                                    }}
                                                    className="bg-transparent border-white/10 text-white focus:bg-white/5"
                                                />
                                                {focusedIndex === idx && libraryOptions.length > 0 && (
                                                    <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                        {libraryOptions.map((libEx) => (
                                                            <button
                                                                key={libEx.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    updateExercise(idx, 'name', libEx.name);
                                                                    setSearchQueries({ ...searchQueries, [idx]: libEx.name });
                                                                    setFocusedIndex(null);
                                                                }}
                                                                className="w-full px-4 py-3 text-left hover:bg-brand-500/10 flex flex-col transition-colors border-b border-white/5 last:border-0"
                                                            >
                                                                <span className="text-sm font-medium text-white">{libEx.name}</span>
                                                                <span className="text-[10px] text-zinc-500 font-bold uppercase">{libEx.muscleGroup} • {libEx.equipment?.replace('_', ' ') || 'NONE'}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="md:col-span-2 space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Sets</label>
                                                <Input
                                                    type="number"
                                                    value={ex.sets ?? ''}
                                                    onChange={(e) => updateExercise(idx, 'sets', parseInt(e.target.value))}
                                                    className="bg-transparent border-white/10 text-white text-center"
                                                />
                                            </div>
                                            <div className="md:col-span-2 space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Reps</label>
                                                <Input
                                                    type="number"
                                                    value={ex.reps ?? ''}
                                                    onChange={(e) => updateExercise(idx, 'reps', parseInt(e.target.value))}
                                                    className="bg-transparent border-white/10 text-white text-center"
                                                />
                                            </div>
                                            <div className="md:col-span-2 space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-1">Weight</label>
                                                <Input
                                                    type="number"
                                                    value={ex.weight ?? ''}
                                                    onChange={(e) => updateExercise(idx, 'weight', parseFloat(e.target.value))}
                                                    className="bg-transparent border-white/10 text-white text-center"
                                                />
                                            </div>
                                        </div>
                                        {exercises.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeExercise(idx)}
                                                className="absolute -top-2 -right-2 bg-red-500/20 text-red-400 p-1.5 rounded-full border border-red-500/40 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
