'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MuscleBodyMapProps {
    selected?: string[];
    onSelectMuscle?: (muscle: string) => void;
    mode?: 'select' | 'display';
    highlighted?: string[];
}

// Each muscle group: id, label, front/back, SVG path data
const MUSCLE_GROUPS = [
    // ─── Front ──────────────────────────────────────────
    { id: 'chest', label: 'Chest', side: 'front', x: 85, y: 90, w: 50, h: 30 },
    { id: 'abs', label: 'Abs', side: 'front', x: 90, y: 125, w: 40, h: 45 },
    { id: 'shoulders_f', label: 'Shoulders', side: 'front', x: 62, y: 78, w: 18, h: 20 },
    { id: 'shoulders_f2', label: 'Shoulders', side: 'front', x: 140, y: 78, w: 18, h: 20 },
    { id: 'biceps_l', label: 'Biceps', side: 'front', x: 55, y: 105, w: 16, h: 30 },
    { id: 'biceps_r', label: 'Biceps', side: 'front', x: 149, y: 105, w: 16, h: 30 },
    { id: 'forearms_l', label: 'Forearms', side: 'front', x: 50, y: 140, w: 14, h: 30 },
    { id: 'forearms_r', label: 'Forearms', side: 'front', x: 156, y: 140, w: 14, h: 30 },
    { id: 'quads_l', label: 'Quads', side: 'front', x: 82, y: 180, w: 22, h: 50 },
    { id: 'quads_r', label: 'Quads', side: 'front', x: 116, y: 180, w: 22, h: 50 },
    { id: 'calves_l', label: 'Calves', side: 'front', x: 82, y: 245, w: 18, h: 35 },
    { id: 'calves_r', label: 'Calves', side: 'front', x: 120, y: 245, w: 18, h: 35 },
    { id: 'obliques_l', label: 'Obliques', side: 'front', x: 75, y: 130, w: 14, h: 30 },
    { id: 'obliques_r', label: 'Obliques', side: 'front', x: 131, y: 130, w: 14, h: 30 },

    // ─── Back ───────────────────────────────────────────
    { id: 'traps', label: 'Traps', side: 'back', x: 85, y: 68, w: 50, h: 22 },
    { id: 'lats_l', label: 'Lats', side: 'back', x: 72, y: 100, w: 22, h: 40 },
    { id: 'lats_r', label: 'Lats', side: 'back', x: 126, y: 100, w: 22, h: 40 },
    { id: 'lower_back', label: 'Lower Back', side: 'back', x: 90, y: 140, w: 40, h: 25 },
    { id: 'triceps_l', label: 'Triceps', side: 'back', x: 55, y: 100, w: 16, h: 30 },
    { id: 'triceps_r', label: 'Triceps', side: 'back', x: 149, y: 100, w: 16, h: 30 },
    { id: 'rear_delts_l', label: 'Rear Delts', side: 'back', x: 62, y: 78, w: 18, h: 18 },
    { id: 'rear_delts_r', label: 'Rear Delts', side: 'back', x: 140, y: 78, w: 18, h: 18 },
    { id: 'glutes', label: 'Glutes', side: 'back', x: 82, y: 170, w: 55, h: 30 },
    { id: 'hamstrings_l', label: 'Hamstrings', side: 'back', x: 82, y: 205, w: 22, h: 40 },
    { id: 'hamstrings_r', label: 'Hamstrings', side: 'back', x: 116, y: 205, w: 22, h: 40 },
    { id: 'calves_bl', label: 'Calves', side: 'back', x: 82, y: 250, w: 18, h: 30 },
    { id: 'calves_br', label: 'Calves', side: 'back', x: 120, y: 250, w: 18, h: 30 },
];

// Normalize muscle name for matching
function normalizeId(id: string): string {
    return id.replace(/_[lr]2?$/, '').replace(/_f2?$/, '').replace(/_b[lr]?$/, '');
}

export function MuscleBodyMap({
    selected = [],
    onSelectMuscle,
    mode = 'select',
    highlighted = [],
}: MuscleBodyMapProps) {
    const [hoveredMuscle, setHoveredMuscle] = useState<string | null>(null);
    const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');

    const isSelected = (id: string) => {
        const norm = normalizeId(id);
        return selected.some((s) => normalizeId(s) === norm);
    };

    const isHighlighted = (id: string) => {
        const norm = normalizeId(id);
        return highlighted.some((h) => normalizeId(h) === norm);
    };

    const handleClick = (id: string) => {
        if (mode !== 'select' || !onSelectMuscle) return;
        const norm = normalizeId(id);
        onSelectMuscle(norm);
    };

    const visibleMuscles = MUSCLE_GROUPS.filter((m) => m.side === activeSide);

    return (
        <div className="space-y-4">
            {/* Side toggle */}
            <div className="flex justify-center">
                <div className="flex bg-white/[0.04] rounded-xl border border-white/[0.06] p-1 gap-1">
                    {(['front', 'back'] as const).map((side) => (
                        <button
                            key={side}
                            onClick={() => setActiveSide(side)}
                            className={cn(
                                'px-5 py-2 rounded-lg text-sm font-bold capitalize transition-all',
                                activeSide === side
                                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                                    : 'text-neutral-500 hover:text-white'
                            )}
                        >
                            {side}
                        </button>
                    ))}
                </div>
            </div>

            {/* Body Silhouette */}
            <div className="flex justify-center">
                <svg
                    viewBox="0 0 220 310"
                    className="w-56 h-[370px] md:w-64 md:h-[420px]"
                >
                    {/* Body outline — simplified silhouette */}
                    <g opacity="0.12" fill="none" stroke="white" strokeWidth="1.2">
                        {/* Head */}
                        <ellipse cx="110" cy="30" rx="18" ry="22" />
                        {/* Neck */}
                        <line x1="102" y1="50" x2="102" y2="65" />
                        <line x1="118" y1="50" x2="118" y2="65" />
                        {/* Torso */}
                        <path d="M 72 65 Q 68 90 70 170 Q 75 178 82 180 L 82 230 Q 85 240 82 250 L 80 290 Q 85 295 95 295 L 100 250 Q 105 235 110 250 L 120 295 Q 130 295 135 290 L 138 250 Q 135 240 138 230 L 138 180 Q 145 178 150 170 Q 152 90 148 65 Z" />
                        {/* Arms */}
                        <path d="M 72 68 Q 55 75 48 110 Q 42 140 40 175" />
                        <path d="M 148 68 Q 165 75 172 110 Q 178 140 180 175" />
                    </g>

                    {/* Muscle group hitboxes */}
                    {visibleMuscles.map((muscle) => {
                        const sel = isSelected(muscle.id);
                        const hl = isHighlighted(muscle.id);
                        const hov = hoveredMuscle === muscle.id;

                        return (
                            <g key={muscle.id}>
                                <motion.rect
                                    x={muscle.x}
                                    y={muscle.y}
                                    width={muscle.w}
                                    height={muscle.h}
                                    rx={6}
                                    className={cn(
                                        'cursor-pointer transition-all',
                                        sel || hl
                                            ? 'fill-brand-500/40 stroke-brand-500/60'
                                            : hov
                                                ? 'fill-white/10 stroke-white/25'
                                                : 'fill-white/[0.03] stroke-white/[0.08]'
                                    )}
                                    strokeWidth={sel || hl ? 2 : 1}
                                    onMouseEnter={() => setHoveredMuscle(muscle.id)}
                                    onMouseLeave={() => setHoveredMuscle(null)}
                                    onClick={() => handleClick(muscle.id)}
                                    whileHover={{ scale: 1.05 }}
                                    animate={{
                                        fillOpacity: sel || hl ? 0.5 : hov ? 0.15 : 0.04,
                                    }}
                                />
                                {/* Label */}
                                <text
                                    x={muscle.x + muscle.w / 2}
                                    y={muscle.y + muscle.h / 2 + 3}
                                    textAnchor="middle"
                                    className={cn(
                                        'text-[7px] font-bold pointer-events-none select-none',
                                        sel || hl ? 'fill-brand-300' : hov ? 'fill-white' : 'fill-neutral-600'
                                    )}
                                >
                                    {muscle.label}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Selected muscles pills */}
            {mode === 'select' && selected.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                    {selected.map((m) => (
                        <span
                            key={m}
                            onClick={() => onSelectMuscle?.(m)}
                            className="text-xs font-bold text-brand-400 bg-brand-500/15 px-3 py-1.5 rounded-full border border-brand-500/20 cursor-pointer hover:bg-brand-500/25 transition-all capitalize"
                        >
                            {m.replace(/_/g, ' ')} ×
                        </span>
                    ))}
                </div>
            )}

            {/* Hovered muscle tooltip */}
            {hoveredMuscle && (
                <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center text-sm text-white font-bold capitalize"
                >
                    {MUSCLE_GROUPS.find((m) => m.id === hoveredMuscle)?.label}
                </motion.div>
            )}
        </div>
    );
}
