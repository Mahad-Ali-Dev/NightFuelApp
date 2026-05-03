'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft, ChevronRight, Dumbbell, Home, Star, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Step = 'goal' | 'location' | 'difficulty' | 'confirm';

const WORKOUT_PLANS = [
    { id: 'muscle', label: 'General muscle building', days: 33, perWeek: 3, gender: 'men' },
    { id: 'arms', label: 'Large arms', days: 30, perWeek: 3, gender: 'men' },
    { id: 'chest', label: 'Powerful chest', days: 30, perWeek: 3, gender: 'men' },
    { id: 'back', label: 'Wide back', days: 30, perWeek: 3, gender: 'men' },
    { id: 'shoulders', label: 'Big shoulders', days: 28, perWeek: 3, gender: 'men' },
    { id: 'legs', label: 'Strong legs', days: 30, perWeek: 3, gender: 'men' },
    { id: 'weight_loss', label: 'Weight loss', days: 30, perWeek: 4, gender: 'all' },
    { id: 'sculpted', label: 'Sculpted body', days: 30, perWeek: 4, gender: 'all' },
    { id: 'abs', label: '6 pack abs', days: 28, perWeek: 4, gender: 'men' },
    { id: 'powerlifting', label: 'Powerlifting', days: 30, perWeek: 3, gender: 'men' },
    { id: 'crossfit', label: 'Crossfit', days: 30, perWeek: 4, gender: 'all' },
    { id: 'full_body_45', label: 'Full body in 45 minutes', days: 33, perWeek: 3, gender: 'all' },
];

const LOCATIONS = [
    { id: 'gym', label: 'In the gym', icon: Dumbbell, description: 'Full equipment access' },
    { id: 'home', label: 'At home', icon: Home, description: 'Minimal or no equipment' },
];

const DIFFICULTIES = [
    { id: 'none', label: 'No experience', stars: 0, desc: '- for those who have never worked out in their life' },
    { id: 'beginner', label: 'Beginner', stars: 1, desc: '- training experience less than 1 year\n- irregular workouts' },
    { id: 'advanced', label: 'Advanced', stars: 2, desc: '- training experience more than 1 year\n- regular workouts' },
    { id: 'expert', label: 'Expert', stars: 3, desc: '- training experience more than 2 years\n- regular workouts' },
    { id: 'pro', label: 'Pro', stars: 4, desc: '- training experience more than 3 years\n- regular workouts' },
];

export default function TrainingOnboarding() {
    const router = useRouter();
    const [step, setStep] = useState<Step>('goal');
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
    const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);

    const plan = WORKOUT_PLANS.find(p => p.id === selectedPlan);
    const difficulty = DIFFICULTIES.find(d => d.id === selectedDifficulty);

    const canProceed = () => {
        switch (step) {
            case 'goal': return !!selectedPlan;
            case 'location': return !!selectedLocation;
            case 'difficulty': return !!selectedDifficulty;
            case 'confirm': return true;
        }
    };

    const nextStep = () => {
        if (step === 'goal') setStep('location');
        else if (step === 'location') setStep('difficulty');
        else if (step === 'difficulty') setStep('confirm');
        else {
            // Save selections and go to training hub
            localStorage.setItem('nf_training_setup', JSON.stringify({
                plan: selectedPlan,
                location: selectedLocation,
                difficulty: selectedDifficulty,
            }));
            router.push('/dashboard/training');
        }
    };

    const prevStep = () => {
        if (step === 'location') setStep('goal');
        else if (step === 'difficulty') setStep('location');
        else if (step === 'confirm') setStep('difficulty');
        else router.back();
    };

    const steps: Step[] = ['goal', 'location', 'difficulty', 'confirm'];
    const stepIndex = steps.indexOf(step);

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={prevStep} className="bg-white/5 hover:bg-white/10 text-white rounded-xl">
                        <ChevronLeft size={20} />
                    </Button>
                    <h1 className="text-xl font-bold text-white flex-1 text-center">
                        {step === 'goal' && 'Select your workout plan'}
                        {step === 'location' && 'Where to train'}
                        {step === 'difficulty' && 'Difficulty level'}
                        {step === 'confirm' && 'Workout plan'}
                    </h1>
                    <div className="w-10" />
                </div>

                {/* Progress dots */}
                <div className="flex justify-center gap-2">
                    {steps.map((s, i) => (
                        <div
                            key={s}
                            className={cn(
                                'w-2.5 h-2.5 rounded-full transition-all',
                                i <= stepIndex ? 'bg-brand-500' : 'bg-white/10'
                            )}
                        />
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {/* Step 1: Select Plan */}
                    {step === 'goal' && (
                        <motion.div key="goal" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
                            {WORKOUT_PLANS.map((p, i) => (
                                <motion.button
                                    key={p.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.03 }}
                                    onClick={() => setSelectedPlan(p.id)}
                                    className={cn(
                                        'w-full flex items-center justify-between p-4 rounded-xl border transition-all',
                                        selectedPlan === p.id
                                            ? 'bg-brand-500/20 border-brand-500/50 text-white'
                                            : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/[0.08]'
                                    )}
                                >
                                    <div className="flex items-center gap-3 text-left">
                                        <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-xl">🏋️</div>
                                        <div>
                                            <p className="font-semibold text-sm">{p.label}</p>
                                            <p className="text-xs text-zinc-500">{p.days} days · {p.perWeek}x/week</p>
                                        </div>
                                    </div>
                                    {selectedPlan === p.id && (
                                        <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
                                            <Check size={14} className="text-white" />
                                        </div>
                                    )}
                                </motion.button>
                            ))}
                        </motion.div>
                    )}

                    {/* Step 2: Location */}
                    {step === 'location' && (
                        <motion.div key="location" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 pt-4">
                            {LOCATIONS.map(loc => (
                                <button
                                    key={loc.id}
                                    onClick={() => setSelectedLocation(loc.id)}
                                    className={cn(
                                        'w-full flex items-center gap-4 p-6 rounded-2xl border transition-all',
                                        selectedLocation === loc.id
                                            ? 'bg-brand-500/20 border-brand-500/50'
                                            : 'bg-white/5 border-white/10 hover:bg-white/[0.08]'
                                    )}
                                >
                                    <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center">
                                        <loc.icon size={28} className="text-brand-400" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-white font-bold text-lg">{loc.label}</p>
                                        <p className="text-zinc-500 text-sm">{loc.description}</p>
                                    </div>
                                    {selectedLocation === loc.id && (
                                        <div className="ml-auto w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
                                            <Check size={14} className="text-white" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </motion.div>
                    )}

                    {/* Step 3: Difficulty */}
                    {step === 'difficulty' && (
                        <motion.div key="difficulty" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
                            <p className="text-zinc-400 text-sm text-center mb-4">
                                {plan?.label || 'Full body in 45 minutes'}
                            </p>
                            {DIFFICULTIES.map((diff, i) => (
                                <motion.button
                                    key={diff.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    onClick={() => setSelectedDifficulty(diff.id)}
                                    className={cn(
                                        'w-full flex items-start gap-4 p-4 rounded-xl border transition-all text-left',
                                        selectedDifficulty === diff.id
                                            ? 'bg-brand-500/20 border-brand-500/50'
                                            : 'bg-white/5 border-white/10 hover:bg-white/[0.08]'
                                    )}
                                >
                                    <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                                        <div className="flex gap-0.5">
                                            {Array.from({ length: 4 }, (_, s) => (
                                                <Star
                                                    key={s}
                                                    size={10}
                                                    className={s < diff.stars ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-600'}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-white font-bold text-sm">{diff.label}</p>
                                        <p className="text-zinc-500 text-xs whitespace-pre-line mt-1">{diff.desc}</p>
                                    </div>
                                    {selectedDifficulty === diff.id && (
                                        <div className="ml-auto mt-2 w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center shrink-0">
                                            <Check size={14} className="text-white" />
                                        </div>
                                    )}
                                </motion.button>
                            ))}
                        </motion.div>
                    )}

                    {/* Step 4: Confirm */}
                    {step === 'confirm' && (
                        <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                            <div className="aspect-video rounded-2xl bg-gradient-to-br from-brand-500/30 to-purple-500/10 border border-white/10 flex items-center justify-center">
                                <div className="text-center">
                                    <p className="text-6xl mb-4">🏋️</p>
                                    <h2 className="text-xl font-black text-white">{plan?.label}</h2>
                                </div>
                            </div>

                            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
                                <p className="text-zinc-400 text-sm">
                                    - {plan?.days} workout days ({plan?.perWeek} sessions per week)
                                </p>
                                <p className="text-zinc-400 text-sm">Specific nutrition guide and meal plans</p>
                                <p className="text-zinc-400 text-sm">Recommended sports supplements</p>
                                <p className="text-white text-sm font-semibold mt-4">
                                    Categories: for men, for the {selectedLocation === 'gym' ? 'gym' : 'home'}, {difficulty?.label?.toLowerCase()}
                                </p>
                            </div>

                            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                                <p className="text-zinc-300 text-sm leading-relaxed">
                                    {plan?.id === 'full_body_45'
                                        ? 'Full body workouts are for those who enjoy being in great shape. They provide a high-quality load on all muscle groups and are designed for results. These exercises will allow you to feel your body through and to achieve your desired result.'
                                        : `This ${plan?.label?.toLowerCase()} program is designed to maximize your results with ${plan?.perWeek} sessions per week. Follow the structured plan for ${plan?.days} days to see significant improvements.`
                                    }
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Bottom Button */}
                <div className="sticky bottom-4 pt-4">
                    <Button
                        onClick={nextStep}
                        disabled={!canProceed()}
                        className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-6 rounded-xl disabled:opacity-50 text-base"
                    >
                        {step === 'confirm' ? 'ADD' : 'Continue'}
                        {step !== 'confirm' && <ChevronRight size={18} className="ml-2" />}
                    </Button>
                </div>
            </div>
        </div>
    );
}
