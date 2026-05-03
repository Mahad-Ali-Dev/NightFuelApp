'use client';

import React, { useState, useEffect } from 'react';
import { X, Search, Activity, Home, Dumbbell, Droplets, Filter } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { searchExerciseLibrary } from '@/lib/api';

interface ExerciseLibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectExercise?: (exerciseId: string) => void;
}

type RootCategory = 'Gym' | 'Home' | 'Cardio' | 'Kegel';
type FilterTag = 'Chest' | 'Back' | 'Legs' | 'Barbell' | 'Dumbbell' | 'Bodyweight' | 'Cable';

export default function ExerciseLibraryModal({ isOpen, onClose, onSelectExercise }: ExerciseLibraryModalProps) {
    const [activeCategory, setActiveCategory] = useState<RootCategory>('Gym');
    const [activeFilter, setActiveFilter] = useState<FilterTag | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const searchTerm = [activeCategory !== 'Gym' ? activeCategory : '', activeFilter || '', searchQuery].filter(Boolean).join(' ').trim() || 'exercise';

    const { data: exercises = [], isLoading } = useQuery({
        queryKey: ['exerciseLibrary', searchTerm],
        queryFn: async () => {
            const { data } = await searchExerciseLibrary(searchTerm);
            return (data?.data ?? data ?? []).map((ex: any) => ({
                id: ex.id,
                name: ex.name,
                category: ex.equipment === 'Bodyweight' ? 'Home' : 'Gym',
                target: ex.muscleGroup || 'General',
                equip: ex.equipment || 'None',
                oneRm: null,
            }));
        },
        enabled: isOpen,
    });

    const filteredExercises = exercises;

    if (!isOpen) return null;

    const categories: { id: RootCategory, icon: React.ReactNode, label: string }[] = [
        { id: 'Gym', icon: <Dumbbell size={18} />, label: 'Gym Workout' },
        { id: 'Home', icon: <Home size={18} />, label: 'Home Workout' },
        { id: 'Cardio', icon: <Activity size={18} />, label: 'Cardio' },
        { id: 'Kegel', icon: <Droplets size={18} />, label: 'Kegel / Pelvic' },
    ];

    const filterTags: FilterTag[] = ['Chest', 'Back', 'Legs', 'Barbell', 'Dumbbell', 'Bodyweight', 'Cable'];

    return (
        <div className="fixed inset-0 z-[70] flex flex-col bg-gray-950 text-white animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <header className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900">
                <h2 className="text-xl font-black">Exercise Library</h2>
                <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors">
                    <X size={24} />
                </button>
            </header>

            {/* Root Categories */}
            <div className="flex overflow-x-auto hide-scrollbar p-4 gap-3 border-b border-gray-800 bg-gray-950">
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => {
                            setActiveCategory(cat.id);
                            setActiveFilter(null); // reset filter on category change
                        }}
                        className={`flex whitespace-nowrap items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${activeCategory === cat.id
                            ? 'bg-orange-500 text-gray-950 shadow-lg shadow-orange-900/50'
                            : 'bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800'
                            }`}
                    >
                        {cat.icon} {cat.label}
                    </button>
                ))}
            </div>

            {/* Search Bar */}
            <div className="p-4 bg-gray-950 border-b border-gray-900 sticky top-0 z-10">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search exercises..."
                        className="w-full bg-gray-900 border border-gray-800 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-gray-600 focus:border-orange-500 outline-none"
                    />
                </div>

                {/* Smart Filter Pills */}
                <div className="flex items-center gap-2 mt-4 overflow-x-auto hide-scrollbar pb-2">
                    <div className="flex items-center justify-center p-2 bg-gray-900 rounded-xl border border-gray-800 text-gray-500 shrink-0">
                        <Filter size={16} />
                    </div>
                    {filterTags.map(tag => (
                        <button
                            key={tag}
                            onClick={() => setActiveFilter(activeFilter === tag ? null : tag)}
                            className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold border ${activeFilter === tag
                                ? 'bg-gray-200 text-gray-950 border-gray-200'
                                : 'bg-transparent text-gray-400 border-gray-800 hover:border-gray-600'
                                }`}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            </div>

            {/* Exercise List */}
            <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                        <div className="w-6 h-6 border-2 border-gray-600 border-t-orange-500 rounded-full animate-spin mb-4" />
                        <p>Searching exercises...</p>
                    </div>
                ) : filteredExercises.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                        <Dumbbell size={48} className="mb-4 opacity-20" />
                        <p>No exercises found.</p>
                    </div>
                ) : (
                    filteredExercises.map((ex: any) => (
                        <button
                            key={ex.id}
                            onClick={() => onSelectExercise && onSelectExercise(ex.id)}
                            className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center justify-between hover:border-orange-500 transition-colors text-left group"
                        >
                            <div>
                                <h3 className="text-white font-bold text-lg mb-1">{ex.name}</h3>
                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                                    <span className="text-orange-500/80">{ex.target}</span> • <span>{ex.equip}</span>
                                </div>
                            </div>

                            {/* 1RM Extractor display */}
                            {ex.oneRm && (
                                <div className="text-right bg-gray-950 p-2 rounded-xl border border-gray-800 group-hover:border-orange-500/50 transition-colors">
                                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-none mb-1">Estimated 1RM</div>
                                    <div className="text-orange-400 font-black text-sm">{ex.oneRm}</div>
                                </div>
                            )}
                        </button>
                    ))
                )}
            </main>
        </div>
    );
}
