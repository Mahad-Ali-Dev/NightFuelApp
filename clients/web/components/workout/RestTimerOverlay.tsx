'use client';

import React, { useEffect } from 'react';
import { useWorkout } from '../../context/workout-context';
import { X, Plus, Minus } from 'lucide-react';

export default function RestTimerOverlay() {
    const {
        isResting,
        restTimeLeft,
        restDurationSettings,
        decrementTimer,
        skipRest,
        startRestTimer
    } = useWorkout();

    // Timer tick effect
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isResting && restTimeLeft > 0) {
            interval = setInterval(() => {
                decrementTimer();
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isResting, restTimeLeft, decrementTimer]);

    if (!isResting) return null;

    // Calculate stroke dasharray for the circular progress (circumference = 2 * Math.PI * r)
    const radius = 90;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - ((restTimeLeft / restDurationSettings) * circumference);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const addTime = () => startRestTimer(restTimeLeft + 30);
    const subTime = () => startRestTimer(Math.max(1, restTimeLeft - 30));

    return (
        <div className="absolute inset-x-0 bottom-0 top-auto z-50 bg-gray-950/95 backdrop-blur-md rounded-t-3xl border-t border-gray-800 p-8 flex flex-col items-center animate-in slide-in-from-bottom-full duration-300 shadow-2xl shadow-orange-900/20">

            <button
                onClick={skipRest}
                className="absolute top-6 right-6 p-2 text-gray-500 hover:text-white bg-gray-900 rounded-full"
            >
                <X size={20} />
            </button>

            <h3 className="text-orange-500 font-bold uppercase tracking-widest text-sm mb-6">Rest Time</h3>

            {/* Circular Timer SVG */}
            <div className="relative flex items-center justify-center mb-8">
                <svg width="240" height="240" className="transform -rotate-90">
                    {/* Background track */}
                    <circle
                        cx="120"
                        cy="120"
                        r={radius}
                        stroke="currentColor"
                        strokeWidth="12"
                        fill="transparent"
                        className="text-gray-900"
                    />
                    {/* Progress track */}
                    <circle
                        cx="120"
                        cy="120"
                        r={radius}
                        stroke="currentColor"
                        strokeWidth="12"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        className="text-orange-500 transition-all duration-1000 ease-linear"
                    />
                </svg>
                <div className="absolute flex flex-col items-center">
                    <span className="text-6xl font-black text-white tabular-nums tracking-tighter">
                        {formatTime(restTimeLeft)}
                    </span>
                </div>
            </div>

            {/* Controls */}
            <div className="flex gap-4 w-full max-w-sm">
                <button
                    onClick={subTime}
                    className="flex-1 py-4 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl font-bold transition-colors flex items-center justify-center border border-gray-800"
                >
                    <Minus size={20} className="mr-1" /> 30s
                </button>
                <button
                    onClick={skipRest}
                    className="flex-[2] py-4 bg-orange-500 hover:bg-orange-400 text-gray-950 rounded-2xl font-black shadow-lg shadow-orange-900/50"
                >
                    Skip Rest
                </button>
                <button
                    onClick={addTime}
                    className="flex-1 py-4 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl font-bold transition-colors flex items-center justify-center border border-gray-800"
                >
                    <Plus size={20} className="mr-1" /> 30s
                </button>
            </div>

        </div>
    );
}
