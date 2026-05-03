'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Dumbbell,
    CheckCircle2,
    Circle,
    Play,
    Trophy,
    Timer,
    Flame,
    ClipboardList,
    ChevronRight,
    Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { logWorkout } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Exercise {
    name: string;
    sets: number;
    reps: string;
    notes?: string;
}

interface WorkoutSuggestion {
    title: string;
    duration: string;
    intensity: string;
    exercises: Exercise[];
    coaching_tips: string;
}

interface WorkoutLogHubProps {
    suggestion: WorkoutSuggestion | null;
    userId: string;
}

export default function WorkoutLogHub({ suggestion, userId }: WorkoutLogHubProps) {
    const [completedExercises, setCompletedExercises] = useState<number[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);

    if (!suggestion) return null;

    const toggleExercise = (index: number) => {
        if (completedExercises.includes(index)) {
            setCompletedExercises(completedExercises.filter(i => i !== index));
        } else {
            setCompletedExercises([...completedExercises, index]);
        }
    };

    const handleCompleteWorkout = async () => {
        if (completedExercises.length === 0 || !suggestion) return;
        setIsSubmitting(true);
        try {
            const durationStr: string = suggestion.duration || '45';
            await logWorkout({
                userId,
                type: 'STRENGTH',
                title: suggestion.title,
                duration: parseInt(String(suggestion.duration || '45').split(' ')[0] ?? '45') || 45,
                intensity: suggestion.intensity,
                exercises: suggestion.exercises.map((e, idx) => {
                    const repsStr: string = e.reps || '10';
                    return {
                        name: e.name,
                        sets: e.sets,
                        reps: parseInt(repsStr.split('-')[0] ?? '10') || 10,
                        order: idx
                    };
                })
            });
            setIsCompleted(true);
        } catch (e) {
            console.error("Workout logging failed", e);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isCompleted) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-card p-8 border-brand-500/30 bg-brand-500/10 text-center space-y-4"
            >
                <div className="flex justify-center">
                    <div className="bg-brand-500/20 p-4 rounded-full">
                        <Trophy className="h-12 w-12 text-brand-400" />
                    </div>
                </div>
                <h3 className="text-2xl font-black text-white">WORKOUT COMPLETE!</h3>
                <p className="text-neutral-400 text-sm italic">"Great intensity tonight. Your protocol for tomorrow will adjust based on this session."</p>
                <Button
                    className="w-full bg-brand-500 hover:bg-brand-600 font-bold"
                    onClick={() => setIsCompleted(false)}
                >
                    DONE
                </Button>
            </motion.div>
        );
    }

    return (
        <Card className="glass-panel border-blue-500/20 bg-black/40 overflow-hidden">
            <CardHeader className="border-b border-white/5 bg-white/5 py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-blue-400 flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 fill-blue-400" />
                    Interactive Training Session
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <div className="p-6 bg-gradient-to-br from-blue-600/10 to-transparent flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-black text-white uppercase">{suggestion.title}</h3>
                        <div className="flex gap-4 mt-1">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-neutral-400 uppercase">
                                <Timer className="h-3 w-3" /> {suggestion.duration}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-neutral-400 uppercase">
                                <Flame className="h-3 w-3" /> {suggestion.intensity} INTENSITY
                            </span>
                        </div>
                    </div>
                    <div className="hidden sm:block">
                        <div className="text-[10px] font-black text-blue-400 uppercase tracking-tighter text-right mb-1">Coach Tip</div>
                        <p className="max-w-[200px] text-[10px] text-neutral-400 italic text-right leading-tight">
                            "{suggestion.coaching_tips}"
                        </p>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                            <ClipboardList className="h-3.5 w-3.5 text-blue-400" />
                            Exercise Checklist
                        </h4>
                        <span className="text-[10px] font-bold text-neutral-500">
                            {completedExercises.length} / {suggestion.exercises.length}
                        </span>
                    </div>

                    <div className="space-y-2">
                        {suggestion.exercises.map((ex, i) => {
                            const isDone = completedExercises.includes(i);
                            return (
                                <motion.button
                                    key={i}
                                    whileTap={{ scale: 0.99 }}
                                    onClick={() => toggleExercise(i)}
                                    className={cn(
                                        "w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left group",
                                        isDone
                                            ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                            : "bg-white/5 border-white/10 text-neutral-300 hover:border-white/20"
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "h-5 w-5 rounded-full border flex items-center justify-center transition-colors",
                                            isDone ? "bg-blue-500 border-blue-400" : "border-white/20"
                                        )}>
                                            {isDone && <CheckCircle2 className="h-4 w-4 text-white" />}
                                        </div>
                                        <div>
                                            <p className={cn("text-xs font-bold uppercase tracking-tight", isDone && "line-through opacity-50")}>
                                                {ex.name}
                                            </p>
                                            <div className="flex gap-3 text-[10px] text-neutral-500 font-medium">
                                                <span>{ex.sets} Sets</span>
                                                <span>{ex.reps} Reps</span>
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronRight className={cn("h-4 w-4 opacity-20 group-hover:opacity-100 transition-opacity", isDone && "hidden")} />
                                </motion.button>
                            );
                        })}
                    </div>

                    <Button
                        className={cn(
                            "w-full font-bold h-12 mt-4 tracking-widest",
                            completedExercises.length === suggestion.exercises.length
                                ? "bg-blue-600 hover:bg-blue-700 text-white"
                                : "bg-white/10 text-neutral-500 hover:bg-white/15"
                        )}
                        disabled={isSubmitting || completedExercises.length === 0}
                        onClick={handleCompleteWorkout}
                    >
                        {isSubmitting ? "LOGGING..." : "COMPLETE WORKOUT"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
