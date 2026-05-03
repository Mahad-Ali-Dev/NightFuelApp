'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    ChevronLeft, ChevronRight, Calendar, Plus,
    Utensils, Coffee, Sun, Moon, Cookie, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface MealEntry {
    id: string;
    name: string;
    calories: number;
}

interface DayPlan {
    [key: string]: MealEntry[]; // slot -> entries
}

type WeekPlan = { [date: string]: DayPlan };

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_SLOTS: { id: MealSlot; label: string; icon: React.ReactNode; color: string }[] = [
    { id: 'breakfast', label: 'Breakfast', icon: <Coffee size={14} />, color: 'text-amber-400' },
    { id: 'lunch', label: 'Lunch', icon: <Sun size={14} />, color: 'text-orange-400' },
    { id: 'dinner', label: 'Dinner', icon: <Moon size={14} />, color: 'text-indigo-400' },
    { id: 'snack', label: 'Snack', icon: <Cookie size={14} />, color: 'text-pink-400' },
];

const STORAGE_KEY = 'nightfuel-meal-plan';

function loadPlan(): WeekPlan {
    if (typeof window === 'undefined') return {};
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
}

function savePlan(plan: WeekPlan) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
}

// ─── Suggestions (quick add) ─────────────────────────────────────────────────
const QUICK_MEALS: Record<MealSlot, { name: string; cal: number }[]> = {
    breakfast: [
        { name: 'Oatmeal + Berries', cal: 320 },
        { name: 'Eggs + Toast', cal: 380 },
        { name: 'Protein Smoothie', cal: 280 },
        { name: 'Greek Yogurt Bowl', cal: 250 },
    ],
    lunch: [
        { name: 'Grilled Chicken Salad', cal: 420 },
        { name: 'Turkey Wrap', cal: 480 },
        { name: 'Rice + Curry', cal: 550 },
        { name: 'Pasta Primavera', cal: 510 },
    ],
    dinner: [
        { name: 'Salmon + Veggies', cal: 520 },
        { name: 'Steak + Sweet Potato', cal: 620 },
        { name: 'Chicken Stir Fry', cal: 480 },
        { name: 'Lean Burger + Salad', cal: 560 },
    ],
    snack: [
        { name: 'Protein Bar', cal: 200 },
        { name: 'Handful of Nuts', cal: 180 },
        { name: 'Cottage Cheese', cal: 120 },
        { name: 'Banana + PB', cal: 250 },
    ],
};

export default function WeeklyMealPlanPage() {
    const router = useRouter();
    const [plan, setPlan] = useState<WeekPlan>(loadPlan);
    const [weekOffset, setWeekOffset] = useState(0);
    const [addingMeal, setAddingMeal] = useState<{ date: string; slot: MealSlot } | null>(null);

    // Compute week dates
    const weekDates = useMemo(() => {
        const today = new Date();
        const monday = new Date(today);
        monday.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            return d.toISOString().split('T')[0] as string;
        });
    }, [weekOffset]);

    const weekLabel = useMemo(() => {
        const start = new Date(weekDates[0]!);
        const end = new Date(weekDates[6]!);
        const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `${fmt(start)} – ${fmt(end)}`;
    }, [weekDates]);

    const addMealEntry = (date: string, slot: MealSlot, name: string, cal: number) => {
        const updated = { ...plan };
        if (!updated[date]) updated[date] = {};
        const dayPlan = updated[date]!;
        if (!dayPlan[slot]) dayPlan[slot] = [];
        dayPlan[slot]!.push({ id: `meal-${Date.now()}`, name, calories: cal });
        setPlan(updated);
        savePlan(updated);
        setAddingMeal(null);
    };

    const removeMealEntry = (date: string, slot: MealSlot, mealId: string) => {
        const updated = { ...plan };
        const dayPlan = updated[date];
        if (dayPlan?.[slot]) {
            dayPlan[slot] = dayPlan[slot]!.filter((m) => m.id !== mealId);
            setPlan({ ...updated });
            savePlan({ ...updated });
        }
    };

    const getDayTotal = (date: string) => {
        const day = plan[date];
        if (!day) return 0;
        return Object.values(day).flat().reduce((sum, m) => sum + m.calories, 0);
    };

    const todayStr = new Date().toISOString().split('T')[0];

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="bg-white/5 hover:bg-white/10 text-white rounded-xl">
                        <ChevronLeft size={20} />
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-3xl font-black text-white flex items-center gap-3">
                            <Calendar className="text-brand-500" /> Meal Plan
                        </h1>
                        <p className="text-neutral-400 text-sm mt-0.5">Plan your meals for the week</p>
                    </div>
                </header>

                {/* Week navigation */}
                <div className="flex items-center justify-between">
                    <button onClick={() => setWeekOffset(weekOffset - 1)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 transition-all">
                        <ChevronLeft size={18} />
                    </button>
                    <div className="text-center">
                        <p className="text-white font-bold">{weekLabel}</p>
                        {weekOffset !== 0 && (
                            <button onClick={() => setWeekOffset(0)} className="text-brand-400 text-xs font-bold hover:underline mt-1">
                                Jump to this week
                            </button>
                        )}
                    </div>
                    <button onClick={() => setWeekOffset(weekOffset + 1)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 transition-all">
                        <ChevronRight size={18} />
                    </button>
                </div>

                {/* Calendar Grid */}
                <div className="overflow-x-auto custom-scrollbar pb-2">
                    <div className="grid grid-cols-7 gap-2 min-w-[800px]">
                        {/* Day headers */}
                        {weekDates.map((date, i) => {
                            const isToday = date === todayStr;
                            const dayTotal = getDayTotal(date);
                            return (
                                <div key={date} className={cn(
                                    'text-center p-2 rounded-t-xl',
                                    isToday ? 'bg-brand-500/10 border-b-2 border-brand-500' : 'bg-white/[0.02]'
                                )}>
                                    <p className={cn('text-xs font-bold uppercase', isToday ? 'text-brand-400' : 'text-neutral-500')}>
                                        {DAYS[i]}
                                    </p>
                                    <p className={cn('text-sm font-bold', isToday ? 'text-white' : 'text-neutral-400')}>
                                        {new Date(date + 'T00:00:00').getDate()}
                                    </p>
                                    {dayTotal > 0 && (
                                        <p className="text-[9px] text-brand-400 font-bold mt-0.5">{dayTotal} cal</p>
                                    )}
                                </div>
                            );
                        })}

                        {/* Meal slots per day */}
                        {MEAL_SLOTS.map((slot) => (
                            weekDates.map((date) => {
                                const entries = plan[date]?.[slot.id] ?? [];
                                const isAdding = addingMeal?.date === date && addingMeal?.slot === slot.id;

                                return (
                                    <div key={`${date}-${slot.id}`} className="min-h-[80px] bg-white/[0.02] rounded-lg p-1.5 border border-white/[0.04] relative group">
                                        <div className={cn('text-[8px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1', slot.color)}>
                                            {slot.icon} {slot.label}
                                        </div>

                                        {entries.map((meal) => (
                                            <div key={meal.id} className="flex items-center justify-between bg-white/[0.04] rounded-md px-1.5 py-1 mb-0.5 group/item">
                                                <div>
                                                    <p className="text-white text-[9px] font-medium leading-tight">{meal.name}</p>
                                                    <p className="text-neutral-600 text-[8px]">{meal.calories} cal</p>
                                                </div>
                                                <button
                                                    onClick={() => removeMealEntry(date, slot.id, meal.id)}
                                                    className="opacity-0 group-hover/item:opacity-100 text-red-500 hover:text-red-400 p-0.5"
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                        ))}

                                        {/* Quick add popup */}
                                        {isAdding ? (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className="absolute inset-0 z-10 bg-neutral-900/95 backdrop-blur-sm rounded-lg p-1.5 overflow-auto"
                                            >
                                                {QUICK_MEALS[slot.id].map((qm) => (
                                                    <button
                                                        key={qm.name}
                                                        onClick={() => addMealEntry(date, slot.id, qm.name, qm.cal)}
                                                        className="w-full text-left p-1 rounded hover:bg-white/10 transition-colors mb-0.5"
                                                    >
                                                        <p className="text-white text-[9px] font-medium">{qm.name}</p>
                                                        <p className="text-neutral-600 text-[8px]">{qm.cal} cal</p>
                                                    </button>
                                                ))}
                                                <button
                                                    onClick={() => setAddingMeal(null)}
                                                    className="w-full text-center text-[9px] text-neutral-500 mt-1 hover:text-white"
                                                >
                                                    Cancel
                                                </button>
                                            </motion.div>
                                        ) : (
                                            <button
                                                onClick={() => setAddingMeal({ date, slot: slot.id })}
                                                className="w-full opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 text-[9px] text-neutral-600 hover:text-white py-0.5 transition-all"
                                            >
                                                <Plus size={10} /> Add
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
