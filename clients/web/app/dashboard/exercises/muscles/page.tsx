'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Search, Bookmark, Filter, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MUSCLE_GROUPS = [
    { id: 'chest', name: 'Chest', color: 'from-red-500/30 to-red-900/10' },
    { id: 'back', name: 'Back', color: 'from-blue-500/30 to-blue-900/10' },
    { id: 'shoulders', name: 'Shoulders', color: 'from-purple-500/30 to-purple-900/10' },
    { id: 'biceps', name: 'Biceps', color: 'from-orange-500/30 to-orange-900/10' },
    { id: 'triceps', name: 'Triceps', color: 'from-yellow-500/30 to-yellow-900/10' },
    { id: 'forearm', name: 'Forearm', color: 'from-lime-500/30 to-lime-900/10' },
    { id: 'abs', name: 'Abs', color: 'from-cyan-500/30 to-cyan-900/10' },
    { id: 'quadriceps', name: 'Quadriceps', color: 'from-emerald-500/30 to-emerald-900/10' },
    { id: 'hamstrings', name: 'Hamstrings', color: 'from-teal-500/30 to-teal-900/10' },
    { id: 'glutes', name: 'Gluteus', color: 'from-pink-500/30 to-pink-900/10' },
    { id: 'calves', name: 'Calves', color: 'from-indigo-500/30 to-indigo-900/10' },
    { id: 'deltoids', name: 'Deltoids', color: 'from-violet-500/30 to-violet-900/10' },
];

const STRETCHES = [
    { name: "Child's pose stretch", muscleGroup: 'back' },
    { name: 'Deltoids stretch', muscleGroup: 'shoulders' },
    { name: 'Frog stretch', muscleGroup: 'glutes' },
    { name: 'Frontal thigh stretch in prone position', muscleGroup: 'quadriceps' },
    { name: 'Gluteus maximus stretch', muscleGroup: 'glutes' },
    { name: 'Hand and shoulder extensor stretch', muscleGroup: 'forearm' },
    { name: 'Inner thigh stretch', muscleGroup: 'hamstrings' },
    { name: 'Latissimus dorsi back stretch', muscleGroup: 'back' },
    { name: 'Lying gluteal stretch', muscleGroup: 'glutes' },
    { name: 'Lying upper back stretch with turn', muscleGroup: 'back' },
    { name: 'Neck stretch', muscleGroup: 'shoulders' },
    { name: 'Neck stretch side tilt', muscleGroup: 'shoulders' },
    { name: 'Oblique muscle side reach stretch', muscleGroup: 'abs' },
    { name: 'Oblique muscles and back stretch', muscleGroup: 'abs' },
    { name: 'Overhead triceps stretch', muscleGroup: 'triceps' },
    { name: 'Pigeon stretch', muscleGroup: 'glutes' },
];

const EXERCISES_BY_MUSCLE: Record<string, { name: string; equipment: string; sets: string; reps: string }[]> = {
    chest: [
        { name: 'Bench Press · Barbell', equipment: 'Barbell', sets: '4', reps: '8' },
        { name: 'Incline Bench Press · Dumbbell', equipment: 'Dumbbell', sets: '3', reps: '12' },
        { name: 'Standing Chest Fly · Cable', equipment: 'Cable', sets: '3', reps: '12' },
        { name: 'Dumbbell Pullover', equipment: 'Dumbbell', sets: '3', reps: '12' },
        { name: 'Push-Up', equipment: 'Body Weight', sets: '3', reps: '15' },
        { name: 'Chest Dip', equipment: 'Body Weight', sets: '3', reps: '10' },
    ],
    back: [
        { name: 'Bent-over Row · Barbell', equipment: 'Barbell', sets: '4', reps: '8' },
        { name: 'Lat Pulldown · Cable', equipment: 'Cable', sets: '4', reps: '8' },
        { name: 'Deadlift · Barbell', equipment: 'Barbell', sets: '4', reps: '8' },
        { name: 'Back Extension', equipment: 'Body Weight', sets: '4', reps: '12' },
        { name: 'Seated Row · Cable', equipment: 'Cable', sets: '3', reps: '10' },
        { name: 'Pull Up', equipment: 'Body Weight', sets: '3', reps: '8' },
    ],
    shoulders: [
        { name: 'Overhead Press · Barbell', equipment: 'Barbell', sets: '4', reps: '8' },
        { name: 'Lateral Raise · Dumbbell', equipment: 'Dumbbell', sets: '3', reps: '12' },
        { name: 'Front Raise · Dumbbell', equipment: 'Dumbbell', sets: '3', reps: '12' },
        { name: 'Face Pull · Cable', equipment: 'Cable', sets: '3', reps: '15' },
        { name: 'Upright Row · Barbell', equipment: 'Barbell', sets: '3', reps: '10' },
    ],
    biceps: [
        { name: 'Barbell Curl', equipment: 'Barbell', sets: '4', reps: '10' },
        { name: 'Hammer Curl · Dumbbell', equipment: 'Dumbbell', sets: '3', reps: '12' },
        { name: 'Preacher Curl', equipment: 'Barbell', sets: '3', reps: '10' },
        { name: 'Concentration Curl', equipment: 'Dumbbell', sets: '3', reps: '12' },
        { name: 'Cable Curl', equipment: 'Cable', sets: '3', reps: '12' },
    ],
    triceps: [
        { name: 'Tricep Pushdown · Cable', equipment: 'Cable', sets: '4', reps: '12' },
        { name: 'Overhead Tricep Extension', equipment: 'Dumbbell', sets: '3', reps: '12' },
        { name: 'Skull Crusher · Barbell', equipment: 'Barbell', sets: '3', reps: '10' },
        { name: 'Dip', equipment: 'Body Weight', sets: '3', reps: '10' },
        { name: 'Kickback · Dumbbell', equipment: 'Dumbbell', sets: '3', reps: '12' },
    ],
    forearm: [
        { name: 'Wrist Curl · Barbell', equipment: 'Barbell', sets: '3', reps: '15' },
        { name: 'Reverse Wrist Curl', equipment: 'Barbell', sets: '3', reps: '15' },
        { name: "Farmer's Walk · Dumbbell", equipment: 'Dumbbell', sets: '3', reps: '30s' },
    ],
    abs: [
        { name: 'Crunch', equipment: 'Body Weight', sets: '4', reps: '20' },
        { name: 'Hanging Leg Raise', equipment: 'Body Weight', sets: '3', reps: '12' },
        { name: 'Plank', equipment: 'Body Weight', sets: '3', reps: '60s' },
        { name: 'Russian Twist', equipment: 'Body Weight', sets: '3', reps: '20' },
        { name: 'Cable Crunch', equipment: 'Cable', sets: '3', reps: '15' },
        { name: 'Reverse Crunch · Cable', equipment: 'Cable', sets: '3', reps: '15' },
    ],
    quadriceps: [
        { name: 'Squat · Barbell', equipment: 'Barbell', sets: '4', reps: '8' },
        { name: 'Leg Press', equipment: 'Machine', sets: '4', reps: '10' },
        { name: 'Leg Extension', equipment: 'Machine', sets: '3', reps: '12' },
        { name: 'Bulgarian Split Squat', equipment: 'Dumbbell', sets: '3', reps: '10' },
        { name: 'Lunge · Dumbbell', equipment: 'Dumbbell', sets: '3', reps: '12' },
    ],
    hamstrings: [
        { name: 'Romanian Deadlift · Barbell', equipment: 'Barbell', sets: '4', reps: '8' },
        { name: 'Leg Curl · Machine', equipment: 'Machine', sets: '4', reps: '10' },
        { name: 'Good Morning · Barbell', equipment: 'Barbell', sets: '3', reps: '10' },
        { name: 'Nordic Curl', equipment: 'Body Weight', sets: '3', reps: '6' },
    ],
    glutes: [
        { name: 'Hip Thrust · Barbell', equipment: 'Barbell', sets: '4', reps: '10' },
        { name: 'Sumo Deadlift · Barbell', equipment: 'Barbell', sets: '4', reps: '8' },
        { name: 'Glute Kickback · Cable', equipment: 'Cable', sets: '3', reps: '12' },
        { name: 'Step Up · Dumbbell', equipment: 'Dumbbell', sets: '3', reps: '10' },
    ],
    calves: [
        { name: 'Standing Calf Raise', equipment: 'Machine', sets: '4', reps: '15' },
        { name: 'Seated Calf Raise', equipment: 'Machine', sets: '4', reps: '15' },
        { name: 'Donkey Calf Raise', equipment: 'Machine', sets: '3', reps: '15' },
    ],
    deltoids: [
        { name: 'Overhead Press · Barbell', equipment: 'Barbell', sets: '4', reps: '8' },
        { name: 'Arnold Press · Dumbbell', equipment: 'Dumbbell', sets: '3', reps: '10' },
        { name: 'Lateral Raise · Cable', equipment: 'Cable', sets: '3', reps: '15' },
        { name: 'Rear Delt Fly', equipment: 'Dumbbell', sets: '3', reps: '12' },
        { name: 'Cuban Rotation · Dumbbell', equipment: 'Dumbbell', sets: '3', reps: '12' },
    ],
};

type View = 'muscles' | 'exercises' | 'stretching';

export default function MuscleGroupBrowser() {
    const router = useRouter();
    const [view, setView] = useState<View>('muscles');
    const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const filteredExercises = selectedMuscle
        ? (EXERCISES_BY_MUSCLE[selectedMuscle] || []).filter(e =>
            e.name.toLowerCase().includes(search.toLowerCase())
        )
        : [];

    const filteredStretches = STRETCHES.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-3xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            if (view === 'exercises') { setView('muscles'); setSelectedMuscle(null); }
                            else router.back();
                        }}
                        className="bg-white/5 hover:bg-white/10 text-white rounded-xl"
                    >
                        <ChevronLeft size={20} />
                    </Button>
                    <h1 className="text-2xl font-bold text-white flex-1">
                        {view === 'muscles' ? 'Exercises' :
                            view === 'stretching' ? 'Stretching' :
                                MUSCLE_GROUPS.find(m => m.id === selectedMuscle)?.name || 'Exercises'}
                    </h1>
                    <Button variant="ghost" size="icon" className="bg-white/5 hover:bg-white/10 text-white rounded-xl">
                        <Bookmark size={18} />
                    </Button>
                    <Button variant="ghost" size="icon" className="bg-white/5 hover:bg-white/10 text-white rounded-xl">
                        <Filter size={18} />
                    </Button>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input
                        type="text"
                        placeholder="Search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-brand-500 outline-none"
                    />
                </div>

                {/* View Toggle */}
                {view === 'muscles' && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setView('muscles')}
                            className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm font-semibold"
                        >
                            Muscles
                        </button>
                        <button
                            onClick={() => setView('stretching')}
                            className="px-4 py-2 bg-white/5 text-zinc-400 rounded-lg text-sm font-semibold hover:text-white transition"
                        >
                            Stretching
                        </button>
                    </div>
                )}

                <AnimatePresence mode="wait">
                    {/* Muscle Group Grid */}
                    {view === 'muscles' && (
                        <motion.div
                            key="muscles"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-3"
                        >
                            {MUSCLE_GROUPS.filter(m =>
                                m.name.toLowerCase().includes(search.toLowerCase())
                            ).map((muscle, i) => (
                                <motion.button
                                    key={muscle.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.03 }}
                                    onClick={() => { setSelectedMuscle(muscle.id); setView('exercises'); setSearch(''); }}
                                    className={cn(
                                        'w-full flex items-center justify-between p-5 rounded-2xl border border-white/10',
                                        'bg-gradient-to-r', muscle.color,
                                        'hover:border-white/20 transition-all group'
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl">
                                            💪
                                        </div>
                                        <span className="text-white font-bold text-lg">{muscle.name}</span>
                                    </div>
                                    <ChevronRight className="text-zinc-500 group-hover:text-white transition" size={20} />
                                </motion.button>
                            ))}
                        </motion.div>
                    )}

                    {/* Exercise List for Muscle */}
                    {view === 'exercises' && selectedMuscle && (
                        <motion.div
                            key="exercises"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-3"
                        >
                            {filteredExercises.map((ex, i) => (
                                <motion.div
                                    key={ex.name}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.04 }}
                                    className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/[0.08] transition-all cursor-pointer"
                                >
                                    <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center text-xl shrink-0">
                                        🏋️
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-semibold truncate">{ex.name}</p>
                                        <p className="text-zinc-500 text-sm">{ex.equipment}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className="text-white font-bold text-sm">{ex.sets}×{ex.reps}</span>
                                    </div>
                                </motion.div>
                            ))}
                            {filteredExercises.length === 0 && (
                                <p className="text-center text-zinc-500 py-8">No exercises found.</p>
                            )}
                        </motion.div>
                    )}

                    {/* Stretching List */}
                    {view === 'stretching' && (
                        <motion.div
                            key="stretching"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-3"
                        >
                            <div className="flex gap-2 mb-4">
                                <button
                                    onClick={() => setView('muscles')}
                                    className="px-4 py-2 bg-white/5 text-zinc-400 rounded-lg text-sm font-semibold hover:text-white transition"
                                >
                                    Muscles
                                </button>
                                <button
                                    onClick={() => setView('stretching')}
                                    className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm font-semibold"
                                >
                                    Stretching
                                </button>
                            </div>
                            {filteredStretches.map((stretch, i) => (
                                <motion.div
                                    key={stretch.name}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.03 }}
                                    className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/[0.08] transition-all cursor-pointer"
                                >
                                    <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center text-xl shrink-0">
                                        🧘
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-semibold">{stretch.name}</p>
                                        <p className="text-zinc-500 text-xs capitalize">{stretch.muscleGroup}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
