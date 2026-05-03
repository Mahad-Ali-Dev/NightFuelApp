'use client';

import React, { useState } from 'react';
import { useWorkout } from '../../context/workout-context';
import { X, Check, Timer, ChevronRight, ChevronLeft, Disc3, Info } from 'lucide-react';
import RestTimerOverlay from './RestTimerOverlay';
import PlateMathModal from './PlateMathModal';
import ExerciseLibraryModal from './ExerciseLibraryModal';
import WorkoutSummaryModal from './WorkoutSummaryModal';

export default function GuidedPlayer() {
    const {
        isActive,
        currentExerciseIndex,
        currentSetIndex,
        activeWorkoutPlan,
        endWorkout,
        completedSets,
        logSet,
        nextSet,
        prevSet,
        nextExercise,
        prevExercise,
        progressPercentage,
        startRestTimer,
        restDurationSettings
    } = useWorkout();

    const [weight, setWeight] = useState<number>(0);
    const [reps, setReps] = useState<number>(0);
    const [showPlateMath, setShowPlateMath] = useState<boolean>(false);
    const [showExerciseLibrary, setShowExerciseLibrary] = useState<boolean>(false);
    const [showSummary, setShowSummary] = useState<boolean>(false);

    // If workout is not active, render nothing
    if (!isActive || !activeWorkoutPlan) return null;

    const currentExercise = activeWorkoutPlan.exercises[currentExerciseIndex];
    if (!currentExercise) return null;

    const handleLogSet = () => {
        logSet({
            exerciseId: currentExercise.id || `ex-${currentExerciseIndex}`,
            setIndex: currentSetIndex,
            weight,
            reps,
            isCompleted: true
        });

        // Start rest timer after logging
        startRestTimer(restDurationSettings);

        nextSet();
    };

    const isCurrentSetLogged = completedSets.some(
        s => s.exerciseId === (currentExercise.id || `ex-${currentExerciseIndex}`) && s.setIndex === currentSetIndex
    );

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white overflow-hidden animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowSummary(true)}
                        className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                    <div>
                        <h2 className="text-sm font-medium text-gray-400">Current Workout</h2>
                        <h1 className="text-lg font-bold text-orange-500">{activeWorkoutPlan.name || "Custom Workout"}</h1>
                    </div>
                </div>

                {/* Progress Bar Mini */}
                <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-gray-300">
                        {currentExerciseIndex + 1} / {activeWorkoutPlan.exercises.length} Exercises
                    </div>
                </div>
            </header>

            {/* Top Progress Line */}
            <div className="h-1 bg-gray-800 w-full">
                <div
                    className="h-full bg-orange-500 transition-all duration-500"
                    style={{ width: `${progressPercentage}%` }}
                />
            </div>

            {/* Main Carousel Body */}
            <main className="flex-1 flex flex-col overflow-y-auto w-full max-w-2xl mx-auto px-4 py-6">

                {/* Exercise Navigation & Title */}
                <div className="flex items-center justify-between mb-4">
                    <button onClick={prevExercise} disabled={currentExerciseIndex === 0} className="p-3 bg-gray-900 rounded-full disabled:opacity-30">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="text-center flex-1 px-4 cursor-pointer" onClick={() => setShowExerciseLibrary(true)}>
                        <div className="text-gray-400 text-sm mb-1 uppercase tracking-wider font-semibold">Exercise {currentExerciseIndex + 1}</div>
                        <h2 className="text-3xl font-black text-white hover:text-orange-500 transition-colors flex items-center justify-center gap-2">
                            {currentExercise.name} <ChevronRight size={20} className="rotate-90 opacity-50" />
                        </h2>
                    </div>
                    <button onClick={nextExercise} disabled={currentExerciseIndex === activeWorkoutPlan.exercises.length - 1} className="p-3 bg-gray-900 rounded-full disabled:opacity-30">
                        <ChevronRight size={24} />
                    </button>
                </div>

                {/* Target Information Card */}
                <div className="bg-gray-900 rounded-2xl p-5 mb-8 border border-gray-800 shadow-xl">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 flex items-center justify-between">
                            <div>
                                <div className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">Target Sets</div>
                                <div className="text-2xl font-bold text-white">{currentExercise.sets || 3}</div>
                            </div>
                            <div className="text-orange-500/20"><Timer size={32} /></div>
                        </div>
                        <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 flex items-center justify-between">
                            <div>
                                <div className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">Target Reps</div>
                                <div className="text-2xl font-bold text-white">{currentExercise.reps || "8-12"}</div>
                            </div>
                            <div className="text-orange-500/20"><Info size={32} /></div>
                        </div>
                    </div>
                </div>

                {/* Set Logging Interface */}
                <div className="flex-1 flex flex-col justify-end pb-8">
                    <div className="text-center mb-6">
                        <h3 className="text-xl font-bold text-gray-200">Set {currentSetIndex + 1}</h3>
                        <p className="text-gray-500 text-sm">Enter the weight and reps lifted</p>
                    </div>

                    <div className="flex items-center justify-center gap-6 mb-8">
                        {/* Weight Input Dial */}
                        <div className="flex flex-col items-center">
                            <label className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Weight (KG)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={weight || ''}
                                    onChange={(e) => setWeight(Number(e.target.value))}
                                    placeholder="0"
                                    className="w-32 h-20 text-center text-4xl font-black bg-gray-900 border-2 border-gray-700 focus:border-orange-500 rounded-2xl outline-none placeholder:text-gray-700"
                                />
                            </div>
                        </div>

                        <div className="text-gray-600 font-light text-4xl">×</div>

                        {/* Reps Input Dial */}
                        <div className="flex flex-col items-center">
                            <label className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Reps</label>
                            <input
                                type="number"
                                value={reps || ''}
                                onChange={(e) => setReps(Number(e.target.value))}
                                placeholder="0"
                                className="w-32 h-20 text-center text-4xl font-black bg-gray-900 border-2 border-gray-700 focus:border-orange-500 rounded-2xl outline-none placeholder:text-gray-700"
                            />
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4">
                        <button
                            onClick={() => setShowPlateMath(true)}
                            className="flex-1 py-4 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 border border-gray-700"
                        >
                            <Disc3 size={20} /> Plate Math
                        </button>
                        <button
                            onClick={handleLogSet}
                            className={`flex-[2] py-4 rounded-xl font-black text-lg shadow-lg flex items-center justify-center gap-2 transition-all duration-300 ${isCurrentSetLogged ? 'bg-green-600 text-white shadow-green-900/50' : 'bg-orange-500 hover:bg-orange-400 text-gray-950 shadow-orange-900/50'}`}
                        >
                            {isCurrentSetLogged ? <><Check size={24} /> Logged</> : 'Log Set'}
                        </button>
                    </div>
                </div>

            </main>

            <RestTimerOverlay />

            <PlateMathModal
                isOpen={showPlateMath}
                onClose={() => setShowPlateMath(false)}
                initialTargetWeight={weight || 60}
            />

            <ExerciseLibraryModal
                isOpen={showExerciseLibrary}
                onClose={() => setShowExerciseLibrary(false)}
            />

            <WorkoutSummaryModal
                isOpen={showSummary}
                onClose={() => {
                    setShowSummary(false);
                    endWorkout();
                }}
            />
        </div>
    );
}
