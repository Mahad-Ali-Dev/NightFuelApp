'use client';

import { useAuth } from '@/context/auth-context';
import { userApi } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Save, Settings, Target, Zap, ShieldAlert, HeartPulse, Dumbbell, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect } from 'react';

const preferencesSchema = z.object({
    primaryGoal: z.enum(['ENERGY', 'WEIGHT_LOSS', 'MUSCLE_GAIN', 'SLEEP_QUALITY', 'GENERAL_HEALTH', 'STRENGTH', 'ENDURANCE']),
    dietaryPreference: z.enum(['ANY', 'VEGETARIAN', 'VEGAN', 'PESCATARIAN', 'KETO', 'PALEO', 'HALAL', 'KOSHER']),
    targetCalories: z.number().positive().max(10000).nullable().optional(),
    targetProteinG: z.number().nonnegative().max(500).nullable().optional(),
    targetCarbsG: z.number().nonnegative().max(1000).nullable().optional(),
    targetFatG: z.number().nonnegative().max(500).nullable().optional(),
    activityLevel: z.enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE']),
    experienceLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ATHLETE']),
    dietMode: z.enum(['BALANCED', 'RAMADAN', 'ACNE_SAFE', 'MASS_GAIN', 'CUTTING', 'BUDGET']),
    healthConditions: z.array(z.string()).optional(),
    isInjurySafeMode: z.boolean().default(false),
    workoutEnvironment: z.enum(['HOME', 'GYM', 'HYBRID']),
    availableEquipment: z.array(z.string()).optional(),
    workoutDurationPreference: z.number().min(10).max(180).default(60),
    splitPreference: z.enum(['PPL', 'BRO_SPLIT', 'FULL_BODY']),
    isBodybuilderMode: z.boolean().default(false),
    allergies: z.array(z.string()).optional(),
});

type PreferencesFormValues = z.infer<typeof preferencesSchema>;

export default function PreferencesPage() {
    const { isAuthenticated } = useAuth();
    const queryClient = useQueryClient();

    const { data: preferences, isLoading } = useQuery({
        queryKey: ['preferences'],
        queryFn: async () => {
            const res = await userApi.get('/me/preferences');
            return res.data;
        },
        enabled: isAuthenticated,
    });

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors, isDirty },
    } = useForm<PreferencesFormValues>({
        resolver: zodResolver(preferencesSchema) as any,
        defaultValues: {
            primaryGoal: 'GENERAL_HEALTH',
            dietaryPreference: 'ANY',
            targetCalories: 2000,
            targetProteinG: 150,
            targetCarbsG: 200,
            targetFatG: 70,
            activityLevel: 'MODERATE',
            experienceLevel: 'BEGINNER',
            dietMode: 'BALANCED',
            healthConditions: [],
            isInjurySafeMode: false,
            workoutEnvironment: 'GYM',
            availableEquipment: [],
            workoutDurationPreference: 60,
            splitPreference: 'FULL_BODY',
            isBodybuilderMode: false,
            allergies: [],
        },
    });

    useEffect(() => {
        if (preferences) {
            reset({
                primaryGoal: preferences.primaryGoal || 'GENERAL_HEALTH',
                dietaryPreference: preferences.dietaryPreference || 'ANY',
                targetCalories: preferences.targetCalories || 2000,
                targetProteinG: preferences.targetProteinG || 150,
                targetCarbsG: preferences.targetCarbsG || 200,
                targetFatG: preferences.targetFatG || 70,
                activityLevel: preferences.activityLevel || 'MODERATE',
                experienceLevel: preferences.experienceLevel || 'BEGINNER',
                dietMode: preferences.dietMode || 'BALANCED',
                healthConditions: preferences.healthConditions || [],
                isInjurySafeMode: preferences.isInjurySafeMode || false,
                workoutEnvironment: preferences.workoutEnvironment || 'GYM',
                availableEquipment: preferences.availableEquipment || [],
                workoutDurationPreference: preferences.workoutDurationPreference || 60,
                splitPreference: preferences.splitPreference || 'FULL_BODY',
                isBodybuilderMode: preferences.isBodybuilderMode || false,
                allergies: preferences.allergies || [],
            });
        }
    }, [preferences, reset]);

    const mutation = useMutation({
        mutationFn: async (values: PreferencesFormValues) => {
            const res = await userApi.put('/me/preferences', values);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['preferences'] });
            alert('Preferences updated successfully!');
        },
        onError: (error: any) => {
            console.error('Update failed:', error);
            alert(error.response?.data?.error || 'Failed to update preferences');
        },
    });

    const onSubmit = (values: PreferencesFormValues) => {
        mutation.mutate(values as any);
    };

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            </div>
        );
    }

    const currentGoal = watch('primaryGoal');
    const currentActivity = watch('activityLevel');
    const currentDietMode = watch('dietMode');
    const currentWorkoutEnv = watch('workoutEnvironment');
    const currentSplit = watch('splitPreference');

    return (
        <div className="space-y-6 pb-24">
            <header>
                <h1 className="text-3xl font-bold text-white">Coach Settings</h1>
                <p className="text-neutral-400 mt-1">Fine-tune your AI coach's logic and your specific constraints.</p>
            </header>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                {/* 1. Core Profile & Goals */}
                <div className="grid gap-6 md:grid-cols-2">
                    <Card className="glass-card">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2 text-lg">
                                <Target className="h-5 w-5 text-brand-500" />
                                Primary Health Goal
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-2">
                            {['ENERGY', 'WEIGHT_LOSS', 'MUSCLE_GAIN', 'SLEEP_QUALITY', 'GENERAL_HEALTH', 'STRENGTH', 'ENDURANCE'].map((goal) => (
                                <button
                                    key={goal}
                                    type="button"
                                    onClick={() => setValue('primaryGoal', goal as any, { shouldDirty: true })}
                                    className={cn(
                                        "flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-xs",
                                        currentGoal === goal
                                            ? "bg-brand-500/20 border-brand-500 text-white shadow-[0_0_10px_-3px_hsl(var(--brand)/0.4)]"
                                            : "bg-white/5 border-white/5 text-neutral-400 hover:bg-white/10"
                                    )}
                                >
                                    {goal.replace('_', ' ')}
                                </button>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="glass-card">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2 text-lg">
                                <HeartPulse className="h-5 w-5 text-brand-400" />
                                Specialized Diet Mode
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-2">
                            {['BALANCED', 'RAMADAN', 'ACNE_SAFE', 'MASS_GAIN', 'CUTTING', 'BUDGET'].map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setValue('dietMode', mode as any, { shouldDirty: true })}
                                    className={cn(
                                        "flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-xs",
                                        currentDietMode === mode
                                            ? "bg-brand-500/20 border-brand-500 text-white"
                                            : "bg-white/5 border-white/5 text-neutral-400 hover:bg-white/10"
                                    )}
                                >
                                    {mode.replace('_', ' ')}
                                </button>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* 2. Workout & Training */}
                <div className="grid gap-6 md:grid-cols-3">
                    <Card className="glass-card">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2 text-lg">
                                <Dumbbell className="h-5 w-5 text-blue-500" />
                                Environment
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col gap-2">
                                {['HOME', 'GYM', 'HYBRID'].map((env) => (
                                    <button
                                        key={env}
                                        type="button"
                                        onClick={() => setValue('workoutEnvironment', env as any, { shouldDirty: true })}
                                        className={cn(
                                            "px-4 py-2 rounded-lg border transition-all text-sm font-medium",
                                            currentWorkoutEnv === env
                                                ? "bg-blue-500/20 border-blue-500 text-white"
                                                : "bg-white/5 border-white/5 text-neutral-400"
                                        )}
                                    >
                                        {env}
                                    </button>
                                ))}
                            </div>
                            <div className="pt-4 border-t border-white/5 space-y-2">
                                <Label className="text-xs text-neutral-400">Available Equipment (comma separated)</Label>
                                <Input
                                    placeholder="Dumbbells, Pull-up bar, Bands"
                                    defaultValue={preferences?.availableEquipment?.join(', ')}
                                    onChange={(e) => setValue('availableEquipment', e.target.value.split(',').map(s => s.trim()).filter(Boolean), { shouldDirty: true })}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="glass-card">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2 text-lg">
                                <Clock className="h-5 w-5 text-indigo-400" />
                                Duration & Split
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1">
                                <div className="flex justify-between">
                                    <Label className="text-xs text-neutral-400">Session Length</Label>
                                    <span className="text-xs text-brand-400 font-bold">{watch('workoutDurationPreference')} min</span>
                                </div>
                                <input
                                    type="range"
                                    min="20"
                                    max="90"
                                    step="10"
                                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-500"
                                    {...register('workoutDurationPreference', { valueAsNumber: true })}
                                />
                            </div>
                            <div className="pt-2">
                                <Label className="text-xs text-neutral-400 mb-2 block">Split Preference</Label>
                                <div className="grid grid-cols-1 gap-1">
                                    {['PPL', 'BRO_SPLIT', 'FULL_BODY'].map((split) => (
                                        <button
                                            key={split}
                                            type="button"
                                            onClick={() => setValue('splitPreference', split as any, { shouldDirty: true })}
                                            className={cn(
                                                "px-3 py-2 rounded-lg border text-xs text-left",
                                                currentSplit === split
                                                    ? "bg-indigo-500/20 border-indigo-500 text-white"
                                                    : "bg-white/5 border-white/5 text-neutral-400"
                                            )}
                                        >
                                            {split.replace('_', ' ')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="glass-card">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2 text-lg">
                                <ShieldAlert className="h-5 w-5 text-red-400" />
                                Health & Safety
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                                <div className="space-y-0.5">
                                    <p className="text-sm text-white font-medium">Injury-Safe Mode</p>
                                    <p className="text-[10px] text-neutral-500">Filters out high-impact/risky moves.</p>
                                </div>
                                <input
                                    type="checkbox"
                                    className="h-5 w-5 rounded border-neutral-700 bg-neutral-800 text-brand-500 focus:ring-brand-600"
                                    {...register('isInjurySafeMode')}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs text-neutral-400">Current Injuries / Conditions</Label>
                                <Input
                                    placeholder="Knee pain, Lower back injury"
                                    defaultValue={preferences?.healthConditions?.join(', ')}
                                    onChange={(e) => setValue('healthConditions', e.target.value.split(',').map(s => s.trim()).filter(Boolean), { shouldDirty: true })}
                                />
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-lg bg-orange-500/5 border border-orange-500/10">
                                <div className="space-y-0.5">
                                    <p className="text-sm text-white font-medium">Bodybuilder Mode</p>
                                    <p className="text-[10px] text-neutral-500">Higher volume, specific hypertrophy cycles.</p>
                                </div>
                                <input
                                    type="checkbox"
                                    className="h-5 w-5 rounded border-neutral-700 bg-neutral-800 text-brand-500 focus:ring-brand-600"
                                    {...register('isBodybuilderMode')}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* 3. Nutrient Guardrails */}
                <Card className="glass-card border-brand-500/20 shadow-[0_0_20px_-10px_hsl(var(--brand)/0.2)]">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold text-white flex gap-2 items-center">
                            <ShieldAlert className="h-6 w-6 text-brand-500" />
                            Macro Guardrails
                        </CardTitle>
                        <CardDescription>Manual override (leave as defaults for AI optimization)</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 md:grid-cols-4">
                        <div className="space-y-2">
                            <Label className="text-neutral-300">Calories (kcal)</Label>
                            <Input type="number" {...register('targetCalories', { valueAsNumber: true })} className="bg-white/5 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-neutral-300">Protein (g)</Label>
                            <Input type="number" {...register('targetProteinG', { valueAsNumber: true })} className="bg-white/5 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-neutral-300">Carbs (g)</Label>
                            <Input type="number" {...register('targetCarbsG', { valueAsNumber: true })} className="bg-white/5 border-white/10" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-neutral-300">Fat (g)</Label>
                            <Input type="number" {...register('targetFatG', { valueAsNumber: true })} className="bg-white/5 border-white/10" />
                        </div>
                    </CardContent>
                </Card>

                {/* Submit */}
                <div className="flex justify-end pt-4 gap-4 sticky bottom-8 z-50">
                    <Button
                        type="submit"
                        disabled={mutation.isPending || !isDirty}
                        className="bg-brand-500 text-white hover:bg-brand-600 px-10 py-6 text-lg font-bold rounded-2xl shadow-xl shadow-brand-500/30 active:scale-95 transition-all"
                    >
                        {mutation.isPending ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                            <>
                                <Save className="mr-2 h-5 w-5" />
                                Sync Coach Settings
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(' ');
}
