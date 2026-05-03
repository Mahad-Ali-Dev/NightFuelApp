'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Droplets,
    CheckCircle2,
    Circle,
    Sun,
    Zap,
    Plus,
    Minus,
    GlassWater,
    Pill
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { logHydration, toggleSupplement, updateLightExposure } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TrackingHubProps {
    initialProgress: any;
    suggestedSupps: string[];
    hydrationTarget: number; // in Liters
    isLightExposureRequired: boolean;
}

export default function InteractiveTrackingHub({
    initialProgress,
    suggestedSupps = [],
    hydrationTarget = 3.5,
    isLightExposureRequired = false
}: TrackingHubProps) {
    const [progress, setProgress] = useState(initialProgress);
    const [isHydrating, setIsHydrating] = useState(false);

    // Sync if initialProgress changes
    useEffect(() => {
        setProgress(initialProgress);
    }, [initialProgress]);

    const handleHydration = async (amount: number) => {
        setIsHydrating(true);
        try {
            const res = await logHydration(amount);
            setProgress(res.data);
        } catch (e) {
            console.error("Hydration log failed", e);
        } finally {
            setIsHydrating(false);
        }
    };

    const handleSupplement = async (name: string) => {
        const isTaken = !progress?.supplementsLogged?.includes(name);
        try {
            const res = await toggleSupplement(name, isTaken);
            setProgress(res.data);
        } catch (e) {
            console.error("Supplement toggle failed", e);
        }
    };

    const handleLightExposure = async () => {
        const completed = !progress?.lightExposureCompleted;
        try {
            const res = await updateLightExposure(completed);
            setProgress(res.data);
        } catch (e) {
            console.error("Light exposure update failed", e);
        }
    };

    const hydrationValue = progress?.hydrationActual || 0;
    const hydrationPercent = Math.min((hydrationValue / hydrationTarget) * 100, 100);

    return (
        <Card className="glass-panel border-brand-500/20 bg-black/40 overflow-hidden">
            <CardHeader className="border-b border-white/5 bg-white/5 py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-brand-400 flex items-center gap-2">
                    <Zap className="h-4 w-4 fill-brand-400" />
                    Interactive Missions
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-8">

                {/* Hydration Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div className="relative flex justify-center">
                        <svg className="w-32 h-32 transform -rotate-90">
                            <circle
                                cx="64"
                                cy="64"
                                r="58"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="transparent"
                                className="text-white/5"
                            />
                            <motion.circle
                                cx="64"
                                cy="64"
                                r="58"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="transparent"
                                strokeDasharray={364.4}
                                initial={{ strokeDashoffset: 364.4 }}
                                animate={{ strokeDashoffset: 364.4 - (364.4 * hydrationPercent) / 100 }}
                                className="text-brand-500"
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <Droplets className="h-5 w-5 text-brand-400 mb-1" />
                            <span className="text-xl font-black text-white">{hydrationValue.toFixed(1)}L</span>
                            <span className="text-[10px] text-neutral-500 uppercase font-bold">Goal: {hydrationTarget}L</span>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                            <GlassWater className="h-3.5 w-3.5 text-blue-400" />
                            Hydration Tracking
                        </h4>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-[10px]"
                                onClick={() => handleHydration(0.25)}
                                disabled={isHydrating}
                            >
                                <Plus className="h-3 w-3 mr-1" /> 250ml
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-[10px]"
                                onClick={() => handleHydration(0.5)}
                                disabled={isHydrating}
                            >
                                <Plus className="h-3 w-3 mr-1" /> 500ml
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="h-px bg-white/5" />

                {/* Supplements Section */}
                <div className="space-y-4">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Pill className="h-3.5 w-3.5 text-emerald-400" />
                        AI Supplement Stack
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {suggestedSupps.map((supp, i) => {
                            const isTaken = progress?.supplementsLogged?.includes(supp);
                            return (
                                <motion.button
                                    key={i}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => handleSupplement(supp)}
                                    className={cn(
                                        "flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                                        isTaken
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                            : "bg-white/5 border-white/10 text-neutral-400 hover:border-white/20"
                                    )}
                                >
                                    <span className="text-xs font-bold">{supp}</span>
                                    {isTaken ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                                </motion.button>
                            );
                        })}
                    </div>
                </div>

                {isLightExposureRequired && (
                    <>
                        <div className="h-px bg-white/5" />
                        {/* Light Exposure Section */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <Sun className="h-3.5 w-3.5 text-amber-400" />
                                Circadian Light Shift
                            </h4>
                            <Card className={cn(
                                "border transition-all",
                                progress?.lightExposureCompleted
                                    ? "bg-amber-500/10 border-amber-500/30"
                                    : "bg-amber-500/5 border-amber-500/10"
                            )}>
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-white">Full Lux Exposure (10k Lux)</p>
                                        <p className="text-[10px] text-neutral-400">Expose eyes to bright light for 15-20 mins now to reset rhythm.</p>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={handleLightExposure}
                                        className={cn(
                                            "rounded-lg font-bold text-[10px] uppercase px-4",
                                            progress?.lightExposureCompleted
                                                ? "bg-amber-500 text-white hover:bg-amber-600"
                                                : "bg-white/10 text-amber-400 hover:bg-white/20"
                                        )}
                                    >
                                        {progress?.lightExposureCompleted ? "COMPLETED" : "DO IT NOW"}
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    </>
                )}

            </CardContent>
        </Card>
    );
}
