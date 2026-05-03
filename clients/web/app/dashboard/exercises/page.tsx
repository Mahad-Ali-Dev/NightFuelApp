'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Dumbbell, Home, Activity, Waves, Search,
    Filter, ChevronRight, Flame, Target, X,
    Loader2, RefreshCw, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { KEGEL_EXERCISES, type Exercise } from '@/lib/exercisedb';
import type { FreeExercise } from '@/app/api/exercises-free/route';

// ─── Category Config ─────────────────────────────────────────────────────────

type AppCategory = 'gym' | 'home' | 'cardio' | 'kegel';

const CATEGORIES: {
    id: AppCategory;
    label: string;
    icon: React.ReactNode;
    color: string;
    activeBg: string;
    badge: string;
    description: string;
    gradient: string;
}[] = [
        {
            id: 'gym', label: 'Gym Workout', icon: <Dumbbell size={20} />,
            color: 'text-orange-400', activeBg: 'bg-orange-500/20',
            badge: '500+', gradient: 'from-orange-500/10 to-transparent',
            description: 'Barbell · Dumbbell · Cables · Machines',
        },
        {
            id: 'home', label: 'Home Workout', icon: <Home size={20} />,
            color: 'text-emerald-400', activeBg: 'bg-emerald-500/20',
            badge: '200+', gradient: 'from-emerald-500/10 to-transparent',
            description: 'Zero equipment · Anywhere · Anytime',
        },
        {
            id: 'cardio', label: 'Cardio', icon: <Activity size={20} />,
            color: 'text-blue-400', activeBg: 'bg-blue-500/20',
            badge: '80+', gradient: 'from-blue-500/10 to-transparent',
            description: 'HIIT · Intervals · Endurance · Fat burn',
        },
        {
            id: 'kegel', label: 'Kegel / Pelvic', icon: <Waves size={20} />,
            color: 'text-purple-400', activeBg: 'bg-purple-500/20',
            badge: '5', gradient: 'from-purple-500/10 to-transparent',
            description: 'Pelvic floor · Core stability · Bladder control',
        },
    ];

// ─── Muscle Group Filter Pills (per category) ─────────────────────────────────

const BODY_PART_FILTERS: Record<AppCategory, { label: string; value: string }[]> = {
    gym: [
        { label: 'All', value: '' },
        { label: 'Chest', value: 'chest' },
        { label: 'Back', value: 'back' },
        { label: 'Shoulders', value: 'shoulders' },
        { label: 'Arms', value: 'upper arms' },
        { label: 'Legs', value: 'upper legs' },
        { label: 'Calves', value: 'lower legs' },
        { label: 'Core', value: 'waist' },
    ],
    home: [
        { label: 'All', value: '' },
        { label: 'Chest', value: 'chest' },
        { label: 'Legs', value: 'upper legs' },
        { label: 'Core', value: 'waist' },
        { label: 'Shoulders', value: 'shoulders' },
        { label: 'Arms', value: 'upper arms' },
        { label: 'Back', value: 'back' },
    ],
    cardio: [
        { label: 'All', value: '' },
        { label: 'Cardio', value: 'cardio' },
    ],
    kegel: [
        { label: 'All', value: '' },
    ],
};

// ─── Level Filter ─────────────────────────────────────────────────────────────

const LEVEL_FILTERS = [
    { label: 'All', value: '' },
    { label: 'Beginner', value: 'beginner' },
    { label: 'Intermediate', value: 'intermediate' },
    { label: 'Expert', value: 'expert' },
];

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fetchExercises(
    category: AppCategory,
    bodyPart: string,
    q: string,
    level: string
): Promise<FreeExercise[]> {
    if (category === 'kegel') return [];

    const params = new URLSearchParams();
    params.set('category', category);
    params.set('limit', '150');
    if (bodyPart) params.set('bodyPart', bodyPart);
    if (q) params.set('q', q);
    if (level) params.set('level', level);

    const res = await fetch(`/api/exercises-free?${params}`);
    if (!res.ok) throw new Error('Failed to load exercises');
    const data = await res.json();
    return data.exercises as FreeExercise[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExercisesPage() {
    const router = useRouter();
    const [activeCategory, setActiveCategory] = useState<AppCategory>('gym');
    const [bodyPartFilter, setBodyPartFilter] = useState('');
    const [levelFilter, setLevelFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    const activeCat = CATEGORIES.find(c => c.id === activeCategory)!;

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ['exercises-free', activeCategory, bodyPartFilter, searchQuery, levelFilter],
        queryFn: () => fetchExercises(activeCategory, bodyPartFilter, searchQuery, levelFilter),
        staleTime: 1000 * 60 * 60, // 1 hour
        enabled: activeCategory !== 'kegel',
    });

    const exercises: (FreeExercise | Exercise)[] = useMemo(() => {
        if (activeCategory === 'kegel') return KEGEL_EXERCISES;
        return data ?? [];
    }, [activeCategory, data]);

    const handleCategoryChange = useCallback((id: AppCategory) => {
        setActiveCategory(id);
        setBodyPartFilter('');
        setLevelFilter('');
        setSearchQuery('');
        setShowSearch(false);
    }, []);

    const handleExerciseClick = useCallback((ex: FreeExercise | Exercise) => {
        router.push(`/dashboard/exercises/${ex.id}`);
    }, [router]);

    return (
        <div className="min-h-screen bg-transparent">

            {/* ── Sticky Header with Categories ───────────────────────────── */}
            <div className={cn(
                "relative overflow-hidden bg-gradient-to-b pt-5 pb-0",
                activeCat.gradient
            )}>
                <div className="px-4 md:px-8 max-w-5xl mx-auto">

                    {/* Title row */}
                    <div className="flex items-start justify-between mb-5">
                        <div>
                            <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
                                <span className={cn("p-2 rounded-xl", activeCat.activeBg)}>
                                    <span className={activeCat.color}>{activeCat.icon}</span>
                                </span>
                                Exercise Library
                            </h1>
                            <p className={cn("text-sm mt-1 ml-1", activeCat.color)}>{activeCat.description}</p>
                        </div>
                        <button
                            onClick={() => setShowSearch(s => !s)}
                            className={cn(
                                "p-2.5 rounded-xl transition-all shrink-0",
                                showSearch
                                    ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25"
                                    : "bg-white/5 border border-white/10 text-neutral-400 hover:text-white hover:bg-white/10"
                            )}
                        >
                            {showSearch ? <X size={18} /> : <Search size={18} />}
                        </button>
                    </div>

                    {/* Search Bar */}
                    <AnimatePresence>
                        {showSearch && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden mb-4"
                            >
                                <div className="relative">
                                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                                    <input
                                        autoFocus
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder={`Search ${activeCat.label.toLowerCase()}...`}
                                        className="w-full bg-white/[0.06] border border-white/10 rounded-2xl py-3 pl-11 pr-10 text-sm text-white placeholder:text-neutral-600 focus:border-brand-500/50 focus:bg-white/[0.08] outline-none transition-all"
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white">
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Category Tabs */}
                    <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-4 -mx-4 px-4">
                        {CATEGORIES.map(cat => (
                            <motion.button
                                key={cat.id}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleCategoryChange(cat.id)}
                                className={cn(
                                    'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all whitespace-nowrap shrink-0 border',
                                    activeCategory === cat.id
                                        ? 'bg-white text-gray-950 border-white shadow-lg'
                                        : `bg-white/[0.04] border-white/[0.08] ${cat.color} hover:border-white/20 hover:bg-white/[0.08]`
                                )}
                            >
                                {cat.icon}
                                {cat.label}
                                <span className={cn(
                                    "text-[10px] font-black px-1.5 py-0.5 rounded-full",
                                    activeCategory === cat.id ? "bg-black/10 text-gray-800" : "bg-white/10 text-white/50"
                                )}>
                                    {cat.badge}
                                </span>
                            </motion.button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Filter Pills ─────────────────────────────────────────────── */}
            <div className="sticky top-14 md:top-0 z-20 bg-background/85 backdrop-blur-xl border-b border-white/[0.05]">
                <div className="px-4 md:px-8 max-w-5xl mx-auto py-2.5 space-y-2">
                    {/* Body part filter */}
                    <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
                        <Filter size={13} className="text-neutral-600 shrink-0" />
                        {BODY_PART_FILTERS[activeCategory]?.map(f => (
                            <button
                                key={f.value}
                                onClick={() => setBodyPartFilter(f.value === bodyPartFilter ? '' : f.value)}
                                className={cn(
                                    "whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0",
                                    bodyPartFilter === f.value
                                        ? "bg-white text-gray-950 border-white"
                                        : "bg-transparent text-neutral-500 border-white/10 hover:border-white/25 hover:text-white"
                                )}
                            >
                                {f.label}
                            </button>
                        ))}

                        {/* Level filter */}
                        {activeCategory !== 'kegel' && (
                            <>
                                <div className="h-4 w-px bg-white/10 shrink-0 mx-1" />
                                {LEVEL_FILTERS.map(f => (
                                    <button
                                        key={f.value}
                                        onClick={() => setLevelFilter(f.value === levelFilter ? '' : f.value)}
                                        className={cn(
                                            "whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0",
                                            levelFilter === f.value && f.value
                                                ? f.value === 'beginner' ? "bg-emerald-500 text-white border-emerald-500"
                                                    : f.value === 'intermediate' ? "bg-brand-500 text-white border-brand-500"
                                                        : "bg-red-500 text-white border-red-500"
                                                : "bg-transparent text-neutral-600 border-white/[0.06] hover:border-white/20 hover:text-neutral-300"
                                        )}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Exercise Grid ────────────────────────────────────────────── */}
            <div className="px-4 md:px-8 max-w-5xl mx-auto pt-5 pb-10">

                {/* Loading */}
                {isLoading && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className="bg-white/[0.03] rounded-2xl overflow-hidden animate-pulse">
                                <div className="h-36 bg-white/[0.04]" />
                                <div className="p-3 space-y-2">
                                    <div className="h-3 bg-white/[0.04] rounded-full w-4/5" />
                                    <div className="h-2.5 bg-white/[0.03] rounded-full w-3/5" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Error */}
                {isError && (
                    <div className="flex flex-col items-center py-20 text-center gap-4">
                        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
                            <Info size={28} className="text-red-400" />
                        </div>
                        <div>
                            <p className="text-white font-bold">Failed to load exercises</p>
                            <p className="text-neutral-500 text-sm mt-1">Check your connection and try again</p>
                        </div>
                        <button
                            onClick={() => refetch()}
                            className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-neutral-300 hover:text-white hover:bg-white/10 transition-all"
                        >
                            <RefreshCw size={14} /> Retry
                        </button>
                    </div>
                )}

                {/* Results */}
                {!isLoading && !isError && (
                    <>
                        {exercises.length > 0 && (
                            <p className="text-neutral-600 text-xs mb-4 font-medium">
                                {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}
                                {searchQuery && (
                                    <span> — searching "<span className="text-neutral-400">{searchQuery}</span>"</span>
                                )}
                                {bodyPartFilter && (
                                    <span> — <span className="text-neutral-400 capitalize">{bodyPartFilter}</span></span>
                                )}
                            </p>
                        )}

                        <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            <AnimatePresence mode="popLayout">
                                {exercises.map((ex, idx) => (
                                    <motion.div
                                        key={ex.id}
                                        layout
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.18, delay: Math.min(idx * 0.025, 0.4) }}
                                    >
                                        <ExerciseCard
                                            exercise={ex}
                                            activeCat={activeCat}
                                            onClick={() => handleExerciseClick(ex)}
                                        />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </motion.div>

                        {exercises.length === 0 && !isLoading && (
                            <div className="flex flex-col items-center py-24 gap-4 text-center">
                                <Dumbbell size={48} className="text-neutral-800" />
                                <div>
                                    <p className="text-neutral-500 font-semibold">No exercises found</p>
                                    <p className="text-neutral-700 text-sm mt-1">Try clearing filters or a different search</p>
                                </div>
                                <button
                                    onClick={() => { setBodyPartFilter(''); setLevelFilter(''); setSearchQuery(''); }}
                                    className="text-brand-400 text-sm hover:underline"
                                >
                                    Clear all filters
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Exercise Card ────────────────────────────────────────────────────────────

type AnyExercise = FreeExercise | Exercise;

function isKegel(ex: AnyExercise): ex is Exercise {
    return (ex as Exercise).gifUrl !== undefined;
}

function ExerciseCard({
    exercise,
    activeCat,
    onClick,
}: {
    exercise: AnyExercise;
    activeCat: typeof CATEGORIES[number];
    onClick: () => void;
}) {
    const [imgError, setImgError] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);

    const imageUrl = isKegel(exercise)
        ? (exercise as Exercise).gifUrl
        : (exercise as FreeExercise).imageUrl;

    const target = isKegel(exercise)
        ? (exercise as Exercise).target
        : (exercise as FreeExercise).target;

    const level = !isKegel(exercise)
        ? (exercise as FreeExercise).level
        : null;

    const levelColors: Record<string, string> = {
        beginner: 'text-emerald-400 bg-emerald-500/10',
        intermediate: 'text-amber-400 bg-amber-500/10',
        expert: 'text-red-400 bg-red-500/10',
    };

    return (
        <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={onClick}
            className="w-full text-left bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] hover:border-white/20 rounded-2xl overflow-hidden transition-all group"
        >
            {/* Image */}
            <div className="relative h-36 bg-black/40 overflow-hidden">
                {imageUrl && !imgError ? (
                    <>
                        {!imgLoaded && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-6 h-6 border-2 border-white/10 border-t-white/30 rounded-full animate-spin" />
                            </div>
                        )}
                        <img
                            src={imageUrl}
                            alt={exercise.name}
                            className={cn(
                                "w-full h-full object-cover transition-all duration-300 group-hover:scale-105",
                                imgLoaded ? "opacity-100" : "opacity-0"
                            )}
                            onLoad={() => setImgLoaded(true)}
                            onError={() => setImgError(true)}
                        />
                    </>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-neutral-800">
                        <Dumbbell size={28} />
                        <span className="text-[10px] font-medium">Exercise</span>
                    </div>
                )}

                {/* Level badge */}
                {level && (
                    <div className="absolute top-2 left-2">
                        <span className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded-md capitalize",
                            levelColors[level] ?? "text-neutral-400 bg-neutral-800"
                        )}>
                            {level}
                        </span>
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="p-3">
                <h3 className={cn(
                    "text-white font-bold text-xs leading-snug mb-2 line-clamp-2 group-hover:transition-colors",
                    "group-hover:text-brand-300"
                )}>
                    {exercise.name}
                </h3>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                        <Target size={10} className={cn("shrink-0", activeCat.color)} />
                        <span className={cn("text-[10px] font-bold uppercase tracking-wide truncate", activeCat.color)}>
                            {target}
                        </span>
                    </div>
                    <ChevronRight size={12} className="text-neutral-700 group-hover:text-neutral-400 transition-colors shrink-0" />
                </div>
            </div>
        </motion.button>
    );
}
