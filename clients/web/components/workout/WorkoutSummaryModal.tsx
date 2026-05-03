'use client';

import React from 'react';
import { useWorkout } from '../../context/workout-context';
import { X, Trophy, Flame, Dumbbell, Star, ChevronRight } from 'lucide-react';

interface WorkoutSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function WorkoutSummaryModal({ isOpen, onClose }: WorkoutSummaryModalProps) {
    const { totalVolume, completedSets, activeWorkoutPlan } = useWorkout();

    if (!isOpen) return null;

    const totalExercises = new Set(completedSets.map(s => s.exerciseId)).size;
    const isCompleted = activeWorkoutPlan && totalExercises >= (activeWorkoutPlan.exercises?.length || 1);

    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gray-950/95 backdrop-blur-md p-4 animate-in slide-in-from-bottom duration-500">
            <button
                onClick={onClose}
                className="absolute top-8 right-8 p-3 bg-gray-900 text-gray-400 hover:text-white rounded-full transition-colors"
            >
                <X size={24} />
            </button>

            <div className="w-full max-w-sm flex flex-col items-center">
                {/* Hero Icon */}
                <div className="relative mb-8">
                    <div className="absolute inset-0 bg-orange-500 blur-3xl opacity-20 rounded-full animate-pulse"></div>
                    <div className="w-32 h-32 bg-gray-900 border-4 border-orange-500 rounded-full flex items-center justify-center shadow-2xl shadow-orange-900/50 relative z-10">
                        <Trophy size={64} className="text-orange-500" />
                    </div>
                </div>

                <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Workout Complete!</h1>
                <p className="text-gray-400 font-medium mb-10">You crushed {activeWorkoutPlan?.name || "your session"}.</p>

                {/* Post-Workout Stars */}
                <div className="flex gap-2 mb-10">
                    {[1, 2, 3].map((star) => (
                        <Star
                            key={star}
                            size={40}
                            fill={isCompleted ? "currentColor" : "none"}
                            className={isCompleted ? "text-orange-500" : "text-gray-700"}
                        />
                    ))}
                </div>

                {/* Stat Grid */}
                <div className="grid grid-cols-2 gap-4 w-full mb-10">
                    <div className="bg-gray-900 p-5 rounded-3xl border border-gray-800 shadow-lg flex flex-col items-center text-center">
                        <Dumbbell size={28} className="text-gray-500 mb-3" />
                        <div className="text-3xl font-black text-white mb-1">{totalVolume} <span className="text-sm font-bold text-gray-600">kg</span></div>
                        <div className="text-xs font-bold uppercase tracking-widest text-gray-500">Total Volume</div>
                    </div>

                    <div className="bg-gray-900 p-5 rounded-3xl border border-gray-800 shadow-lg flex flex-col items-center text-center">
                        <Flame size={28} className="text-gray-500 mb-3" />
                        <div className="text-3xl font-black text-white mb-1">{completedSets.length}</div>
                        <div className="text-xs font-bold uppercase tracking-widest text-gray-500">Sets Logged</div>
                    </div>
                </div>

                {/* Primary Button */}
                <button
                    onClick={onClose}
                    className="w-full py-5 bg-orange-500 hover:bg-orange-400 text-gray-950 rounded-2xl font-black text-xl shadow-2xl shadow-orange-900/50 flex items-center justify-center gap-2 group transition-all"
                >
                    Finish Session
                    <ChevronRight size={24} className="group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>
    );
}
