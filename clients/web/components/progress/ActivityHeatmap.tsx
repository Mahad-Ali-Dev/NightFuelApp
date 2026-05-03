'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { exerciseApi } from '@/lib/api';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Flame } from 'lucide-react';

interface WorkoutDay {
    date: string;      // YYYY-MM-DD
    duration: number;   // minutes
    count: number;      // number of workouts
}

interface ActivityHeatmapProps {
    /** Number of weeks to show */
    weeks?: number;
}

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

function getIntensity(minutes: number): number {
    if (minutes === 0) return 0;
    if (minutes <= 20) return 1;
    if (minutes <= 45) return 2;
    if (minutes <= 75) return 3;
    return 4;
}

const INTENSITY_COLORS = [
    'bg-white/[0.04]',              // 0 — no activity
    'bg-emerald-500/20',            // 1 — light
    'bg-emerald-500/40',            // 2 — moderate
    'bg-emerald-500/70',            // 3 — intense
    'bg-emerald-500 shadow-sm shadow-emerald-500/30', // 4 — max
];

export function ActivityHeatmap({ weeks = 12 }: ActivityHeatmapProps) {
    // Fetch recent workouts
    const { data: workouts = [] } = useQuery({
        queryKey: ['exercises', 'heatmap'],
        queryFn: async () => {
            try {
                const res = await exerciseApi.get('/', { params: { limit: 200 } });
                return res.data ?? [];
            } catch {
                return [];
            }
        },
        staleTime: 60_000,
    });

    // Build workout map: date -> { duration, count }
    const workoutMap = useMemo(() => {
        const map = new Map<string, WorkoutDay>();
        (workouts as any[]).forEach((w: any) => {
            const date = (w.createdAt || w.date || '').split('T')[0];
            if (!date) return;
            const existing = map.get(date);
            if (existing) {
                existing.duration += w.duration ?? 0;
                existing.count += 1;
            } else {
                map.set(date, { date, duration: w.duration ?? 0, count: 1 });
            }
        });
        return map;
    }, [workouts]);

    // Generate grid cells
    const grid = useMemo(() => {
        const cells: { date: string; day: number; week: number; intensity: number; minutes: number; count: number }[] = [];
        const today = new Date();

        // Find last Saturday
        const endDay = new Date(today);

        // Go back `weeks` number of weeks
        const startDay = new Date(endDay);
        startDay.setDate(startDay.getDate() - (weeks * 7 - 1));
        // Align to Sunday
        startDay.setDate(startDay.getDate() - startDay.getDay());

        let week = 0;
        const cursor = new Date(startDay);
        while (cursor <= endDay) {
            const dateStr = cursor.toISOString().split('T')[0] ?? '';
            const dayOfWeek = cursor.getDay(); // 0=Sun
            const workout = workoutMap.get(dateStr);
            const minutes = workout?.duration ?? 0;

            cells.push({
                date: dateStr,
                day: dayOfWeek,
                week,
                intensity: getIntensity(minutes),
                minutes,
                count: workout?.count ?? 0,
            });

            cursor.setDate(cursor.getDate() + 1);
            if (dayOfWeek === 6) week++; // Saturday = end of visual week
        }
        return cells;
    }, [workoutMap, weeks]);

    // Group by week
    const weekGroups = useMemo(() => {
        const groups: (typeof grid[number])[][] = [];
        grid.forEach((cell) => {
            const weekArr = groups[cell.week] ?? (groups[cell.week] = []);
            weekArr.push(cell);
        });
        return groups;
    }, [grid]);

    // Calculate month labels
    const monthLabels = useMemo(() => {
        const labels: { label: string; week: number }[] = [];
        let lastMonth = -1;
        grid.forEach((cell) => {
            const month = new Date(cell.date).getMonth();
            if (month !== lastMonth && cell.day === 0) {
                labels.push({
                    label: new Date(cell.date).toLocaleString('default', { month: 'short' }),
                    week: cell.week,
                });
                lastMonth = month;
            }
        });
        return labels;
    }, [grid]);

    const totalMinutes = Array.from(workoutMap.values()).reduce((sum, d) => sum + d.duration, 0);
    const activeDays = workoutMap.size;

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-5 rounded-2xl border-white/[0.04]"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-500/15">
                        <Flame size={16} className="text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-sm">Activity Heatmap</h3>
                        <p className="text-neutral-500 text-xs">
                            {activeDays} active days · {Math.round(totalMinutes / 60)}h total
                        </p>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-neutral-600 mr-1">Less</span>
                    {INTENSITY_COLORS.map((color, i) => (
                        <div
                            key={i}
                            className={cn('w-3 h-3 rounded-sm', color)}
                        />
                    ))}
                    <span className="text-[10px] text-neutral-600 ml-1">More</span>
                </div>
            </div>

            {/* Month Labels */}
            <div className="flex ml-8 mb-1 gap-0">
                {monthLabels.map((m, i) => (
                    <span
                        key={i}
                        className="text-[10px] text-neutral-600 font-medium"
                        style={{ position: 'relative', left: `${m.week * 16}px` }}
                    >
                        {m.label}
                    </span>
                ))}
            </div>

            {/* Heatmap Grid */}
            <div className="flex gap-0.5 overflow-x-auto custom-scrollbar pb-1">
                {/* Day labels */}
                <div className="flex flex-col gap-0.5 shrink-0 mr-1.5 pt-0">
                    {DAY_LABELS.map((label, i) => (
                        <div key={i} className="h-[14px] flex items-center">
                            <span className="text-[9px] text-neutral-600 w-6 text-right font-medium">
                                {label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Week columns */}
                {weekGroups.map((weekCells, weekIdx) => (
                    <div key={weekIdx} className="flex flex-col gap-0.5">
                        {Array.from({ length: 7 }).map((_, dayIdx) => {
                            const cell = weekCells?.find((c) => c.day === dayIdx);
                            if (!cell) {
                                return <div key={dayIdx} className="w-[14px] h-[14px]" />;
                            }
                            const isToday = cell.date === new Date().toISOString().split('T')[0];
                            return (
                                <div
                                    key={dayIdx}
                                    className={cn(
                                        'w-[14px] h-[14px] rounded-sm transition-colors cursor-default group relative',
                                        INTENSITY_COLORS[cell.intensity],
                                        isToday && 'ring-1 ring-white/30'
                                    )}
                                    title={`${cell.date}: ${cell.minutes}min (${cell.count} workout${cell.count !== 1 ? 's' : ''})`}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>
        </motion.div>
    );
}
