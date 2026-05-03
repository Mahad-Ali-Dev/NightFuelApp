'use client';

import React, { useState } from 'react';
import { X, Check } from 'lucide-react';

interface PlateMathModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTargetWeight?: number;
}

const AVAILABLE_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

export default function PlateMathModal({ isOpen, onClose, initialTargetWeight = 60 }: PlateMathModalProps) {
    const [targetWeight, setTargetWeight] = useState<number>(initialTargetWeight);
    const [barWeight, setBarWeight] = useState<number>(20); // standard olympic bar

    if (!isOpen) return null;

    // Calculate plates per side
    const targetPerSide = (targetWeight - barWeight) / 2;
    let platesToLoad: number[] = [];

    if (targetPerSide > 0) {
        let remaining = targetPerSide;
        for (const plate of AVAILABLE_PLATES) {
            while (remaining >= plate) {
                platesToLoad.push(plate);
                remaining -= plate;
                // deal with floating point errors
                remaining = Math.round(remaining * 100) / 100;
            }
        }
    }

    const getPlateColor = (weight: number) => {
        switch (weight) {
            case 25: return 'bg-red-600';
            case 20: return 'bg-blue-600';
            case 15: return 'bg-yellow-500';
            case 10: return 'bg-green-600';
            case 5: return 'bg-gray-200 text-black';
            case 2.5: return 'bg-black border border-gray-600';
            case 1.25: return 'bg-gray-600';
            default: return 'bg-gray-800';
        }
    };

    const getPlateHeight = (weight: number) => {
        if (weight >= 15) return 'h-40';
        if (weight === 10) return 'h-32';
        if (weight === 5) return 'h-24';
        return 'h-20';
    };

    const getPlateWidth = (weight: number) => {
        if (weight >= 20) return 'w-8';
        if (weight >= 10) return 'w-6';
        return 'w-4';
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-gray-950/80 backdrop-blur-sm sm:items-center p-4">
            <div className="bg-gray-900 w-full max-w-md rounded-3xl border border-gray-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-black text-white">Plate Calculator</h2>
                        <button onClick={onClose} className="p-2 bg-gray-800 text-gray-400 hover:text-white rounded-full">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div>
                            <label className="text-gray-500 text-xs font-bold uppercase mb-2 block">Target Weight (kg)</label>
                            <input
                                type="number"
                                value={targetWeight || ''}
                                onChange={(e) => setTargetWeight(Number(e.target.value))}
                                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-white font-bold text-center text-xl focus:border-orange-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-gray-500 text-xs font-bold uppercase mb-2 block">Bar Weight (kg)</label>
                            <select
                                value={barWeight}
                                onChange={(e) => setBarWeight(Number(e.target.value))}
                                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-white font-bold text-center text-xl focus:border-orange-500 outline-none appearance-none"
                            >
                                <option value={20}>20kg (Olympic)</option>
                                <option value={15}>15kg (Womens)</option>
                                <option value={10}>10kg (Light)</option>
                                <option value={0}>0kg (Smith)</option>
                            </select>
                        </div>
                    </div>

                    {targetWeight < barWeight ? (
                        <div className="text-center text-red-400 bg-red-950/30 p-4 rounded-xl mb-6">
                            Target weight is less than the bar weight!
                        </div>
                    ) : (
                        <div className="mb-8">
                            <div className="text-center text-gray-400 text-sm mb-4">
                                Load <strong className="text-orange-500">{targetPerSide}kg</strong> on <span className="underline">EACH SIDE</span>
                            </div>

                            {/* Visual Barbell Representation */}
                            <div className="relative h-48 flex items-center justify-start bg-gray-950 rounded-2xl border border-gray-800 overflow-hidden hide-scrollbar">
                                {/* The Bar */}
                                <div className="absolute left-0 w-24 h-4 bg-gray-400 rounded-r-lg shadow-inner z-10 border-b-2 border-gray-500"></div>
                                {/* The Collar */}
                                <div className="absolute left-24 w-4 h-12 bg-gray-300 rounded shadow-md z-20 border-b-2 border-gray-400"></div>

                                {/* The Plates */}
                                <div className="w-full pl-28 flex items-center justify-start gap-[2px] z-30 overflow-x-auto">
                                    {platesToLoad.length === 0 ? (
                                        <div className="text-gray-600 italic ml-4">Empty Bar</div>
                                    ) : (
                                        platesToLoad.map((p, i) => (
                                            <div
                                                key={i}
                                                className={`rounded shadow-lg border border-black/50 flex items-center justify-center text-[10px] font-black
                                                    ${getPlateColor(p)} ${getPlateHeight(p)} ${getPlateWidth(p)}`}
                                                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                                            >
                                                {p}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={onClose}
                        className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-gray-950 rounded-xl font-black text-lg shadow-lg flex items-center justify-center gap-2"
                    >
                        <Check size={24} /> Got it
                    </button>
                </div>
            </div>
        </div>
    );
}
