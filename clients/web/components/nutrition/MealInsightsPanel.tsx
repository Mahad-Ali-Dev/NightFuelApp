'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Activity, Wand2, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMutation } from '@tanstack/react-query';
import { scoreMeal } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { toast } from 'sonner';

interface MealInsightsPanelProps {
    selectedFoods: any[];
    totals: { calories: number; protein: number; carbs: number; fat: number };
    mealType: string;
}

interface ScoreData {
    score: number;
    rationale: string;
    quick_fix: string;
}

// Fallback score for when AI service is offline
function generateFallbackScore(totals: { protein: number; carbs: number; fat: number; calories: number }): ScoreData {
    const totalMacros = totals.protein + totals.carbs + totals.fat;
    if (totalMacros === 0) return { score: 5, rationale: 'No nutritional data available.', quick_fix: 'Add more foods to get a score.' };

    const proteinPct = (totals.protein * 4 / totals.calories) * 100;
    const fatPct = (totals.fat * 9 / totals.calories) * 100;

    let score = 5;
    if (proteinPct >= 25) score += 2;
    if (proteinPct >= 15) score += 1;
    if (fatPct <= 35) score += 1;
    if (totals.calories <= 800) score += 1;
    if (totals.calories > 1200) score -= 1;
    score = Math.min(10, Math.max(1, score));

    return {
        score,
        rationale: `Estimated score based on macro balance: ${Math.round(proteinPct)}% protein, ${Math.round(fatPct)}% fat.`,
        quick_fix: proteinPct < 20
            ? 'Add a protein source (chicken, eggs, legumes) to improve your score.'
            : 'Good macro balance! Try adding vegetables for fiber and micronutrients.',
    };
}

export function MealInsightsPanel({ selectedFoods, totals, mealType }: MealInsightsPanelProps) {
    const { user } = useAuth();
    const [scoreData, setScoreData] = useState<ScoreData | null>(null);
    const [isOffline, setIsOffline] = useState(false);

    const scoreMutation = useMutation({
        mutationFn: async () => {
            if (!user) throw new Error('Not authenticated');

            const payload = {
                userId: user.id,
                meal: {
                    name: `Custom ${mealType}`,
                    items: selectedFoods.map(f => ({
                        name: f.name,
                        amount: `${f.quantity}x ${f.servingSize}`,
                        calories: f.calories * f.quantity,
                        protein: f.protein * f.quantity,
                        carbs: f.carbs * f.quantity,
                        fat: f.fat * f.quantity,
                    })),
                    total_calories: totals.calories,
                    total_protein: totals.protein,
                    total_carbs: totals.carbs,
                    total_fat: totals.fat,
                },
                preferences: {
                    primaryGoal: user.primaryGoal ?? 'WEIGHT_LOSS',
                    dietaryPreference: user.dietaryPreference ?? 'ANY',
                },
            };

            const res = await scoreMeal(payload);
            return res.data;
        },
        onSuccess: (data) => {
            if (data) {
                setIsOffline(false);
                setScoreData(data);
            }
        },
        onError: (err: any) => {
            const isServiceDown = !err.response || err.response?.status >= 500 || err.code === 'ECONNREFUSED';
            if (isServiceDown) {
                // Graceful degradation: show local estimate
                setIsOffline(true);
                setScoreData(generateFallbackScore(totals));
                toast.info('AI service offline — showing estimated score', { duration: 3000 });
            } else {
                toast.error('Could not score meal. Please try again.');
            }
        },
    });

    if (selectedFoods.length === 0) return null;

    return (
        <div className="mt-4 pt-4 border-t border-white/5">
            <AnimatePresence mode="wait">
                {!scoreData ? (
                    <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Button
                            variant="outline"
                            className="w-full h-11 border-brand-500/25 bg-brand-500/8 hover:bg-brand-500/15 text-brand-300 gap-2 font-medium relative overflow-hidden group"
                            onClick={() => scoreMutation.mutate()}
                            disabled={scoreMutation.isPending}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-400/10 to-transparent -translate-x-full group-hover:translate-x-full duration-1000 transition-transform" />
                            {scoreMutation.isPending ? (
                                <div className="h-4 w-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Sparkles className="h-4 w-4" />
                            )}
                            {scoreMutation.isPending ? 'Analyzing with AI...' : 'Get AI Health Score'}
                        </Button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="score"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-xl border border-brand-500/20 bg-brand-950/20 space-y-3 overflow-hidden"
                    >
                        <div className="p-4">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    {/* Score ring */}
                                    <div className={`h-12 w-12 rounded-full flex items-center justify-center text-lg font-black font-mono border-2 shadow-lg ${scoreData.score >= 8
                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                        : scoreData.score >= 5
                                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                                        }`}>
                                        {scoreData.score}
                                    </div>
                                    <div>
                                        <h4 className="text-white text-sm font-semibold flex items-center gap-1.5">
                                            {isOffline ? 'Estimated' : 'AI'} Health Score
                                            {isOffline
                                                ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                                                : <Activity className="h-3.5 w-3.5 text-brand-400" />
                                            }
                                        </h4>
                                        <p className="text-xs text-neutral-400 max-w-[200px] leading-tight mt-0.5">{scoreData.rationale}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-neutral-600 hover:text-white shrink-0" onClick={() => { setScoreData(null); setIsOffline(false); }}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="p-3 bg-black/40 rounded-lg border border-white/5 flex gap-3 text-xs">
                                <Wand2 className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
                                <div className="text-neutral-300">
                                    <span className="font-semibold text-white block mb-0.5">Quick Fix</span>
                                    {scoreData.quick_fix}
                                </div>
                            </div>

                            {isOffline && (
                                <button
                                    className="mt-2 w-full text-center text-[10px] text-neutral-600 hover:text-brand-400 transition-colors"
                                    onClick={() => { setScoreData(null); setTimeout(() => scoreMutation.mutate(), 100); }}
                                >
                                    Retry with AI →
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
