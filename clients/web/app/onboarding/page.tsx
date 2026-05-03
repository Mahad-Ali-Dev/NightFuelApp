'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/context/auth-context';
import {
    Activity,
    ArrowRight,
    ArrowLeft,
    Target,
    Thermometer,
    User,
    Zap,
    Utensils,
    Moon,
    Trophy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { userApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const onboardingSchema = z.object({
    // Step 1: Biological
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    biologicalSex: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']),
    heightCm: z.number().min(50).max(300),
    weightKg: z.number().min(20).max(600),

    // Step 2: Goals
    primaryGoal: z.enum(['ENERGY', 'WEIGHT_LOSS', 'MUSCLE_GAIN', 'SLEEP_QUALITY', 'GENERAL_HEALTH']),

    // Step 3: Lifestyle
    activityLevel: z.enum(['SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE', 'EXTRA_ACTIVE']),
    experienceLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ATHLETE']),
    lifestyleType: z.enum(['STUDENT', 'OFFICE', 'NIGHT_SHIFT', 'ATHLETE', 'OTHER']),
    sleepWindowStart: z.string().regex(/^\d{2}:\d{2}$/),
    sleepWindowEnd: z.string().regex(/^\d{2}:\d{2}$/),
    healthConditions: z.array(z.string()).optional(),

    // Step 4: Nutrition
    dietaryPreference: z.enum(['ANY', 'VEGETARIAN', 'VEGAN', 'PESCATARIAN', 'KETO', 'PALEO', 'HALAL', 'KOSHER']),
    dietMode: z.enum(['BUDGET', 'ACNE_SAFE', 'RAMADAN', 'MASS_GAIN', 'CUTTING', 'BALANCED']).optional(),
});

type OnboardingData = z.infer<typeof onboardingSchema>;

const STEPS: { title: string; icon: any }[] = [
    { title: 'Biological Data', icon: User },
    { title: 'Fitness Goals', icon: Target },
    { title: 'Lifestyle', icon: Activity },
    { title: 'Nutrition', icon: Utensils },
];

export default function OnboardingPage() {
    const [currentStep, setCurrentStep] = useState(0);
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const { user, updateUser } = useAuth();

    useEffect(() => {
        if (user?.onboardingCompleted) {
            router.push('/dashboard');
        }
    }, [user, router]);
    const {
        register,
        handleSubmit,
        trigger,
        formState: { errors },
        setValue,
        watch,
    } = useForm<OnboardingData>({
        resolver: zodResolver(onboardingSchema),
        defaultValues: {
            biologicalSex: 'MALE',
            primaryGoal: 'GENERAL_HEALTH',
            activityLevel: 'MODERATELY_ACTIVE',
            experienceLevel: 'BEGINNER',
            lifestyleType: 'NIGHT_SHIFT',
            dietaryPreference: 'ANY',
            dietMode: 'BALANCED',
            healthConditions: [],
            dateOfBirth: '1995-01-01',
            heightCm: 175,
            weightKg: 75,
            sleepWindowStart: '22:00',
            sleepWindowEnd: '06:00',
        }
    });

    const nextStep = async () => {
        let fieldsToValidate: (keyof OnboardingData)[] = [];
        if (currentStep === 0) fieldsToValidate = ['dateOfBirth', 'biologicalSex', 'heightCm', 'weightKg'];
        else if (currentStep === 1) fieldsToValidate = ['primaryGoal'];
        else if (currentStep === 2) fieldsToValidate = ['activityLevel', 'experienceLevel', 'lifestyleType', 'sleepWindowStart', 'sleepWindowEnd'];
        else if (currentStep === 3) fieldsToValidate = ['dietaryPreference'];

        const isValid = await trigger(fieldsToValidate);
        if (isValid) {
            if (currentStep < STEPS.length - 1) {
                setCurrentStep(prev => prev + 1);
            } else {
                handleSubmit(onSubmit)();
            }
        }
    };

    const prevStep = () => {
        if (currentStep > 0) setCurrentStep(prev => prev - 1);
    };

    const onSubmit = async (data: OnboardingData) => {
        setIsLoading(true);
        try {
            // 1. Update Profile
            await userApi.put('/me', {
                dateOfBirth: data.dateOfBirth,
                biologicalSex: data.biologicalSex,
                heightCm: Number(data.heightCm), // ensures numeric
                weightKg: Number(data.weightKg),
            });

            // 2. Update Preferences
            await userApi.put('/me/preferences', {
                primaryGoal: data.primaryGoal,
                activityLevel: data.activityLevel,
                experienceLevel: data.experienceLevel,
                lifestyleType: data.lifestyleType,
                sleepWindowStart: data.sleepWindowStart,
                sleepWindowEnd: data.sleepWindowEnd,
                dietaryPreference: data.dietaryPreference,
                dietMode: data.dietMode,
                healthConditions: data.healthConditions,
            });

            // 3. Mark Onboarding as Completed
            await userApi.put('/me/onboarding', {
                step: 4,
                completed: true,
            });

            // Update client-side state to prevent dashboard redirect-back
            updateUser({ onboardingCompleted: true });

            toast.success('Onboarding complete!', { description: 'Welcome to NightFuel.' });
            router.push('/dashboard');
        } catch (error) {
            console.error(error);
            toast.error('Failed to save data. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const biologicalSex = watch('biologicalSex');
    const primaryGoal = watch('primaryGoal');
    const activityLevel = watch('activityLevel');
    const experienceLevel = watch('experienceLevel');
    const lifestyleType = watch('lifestyleType');
    const dietaryPreference = watch('dietaryPreference');
    const dietMode = watch('dietMode');
    const healthConditions = watch('healthConditions');

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-brand-500/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-orange-500/20 rounded-full blur-[120px] pointer-events-none" />

            <div className="w-full max-w-xl">
                {/* Header */}
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Configure Your Engine</h1>
                    <p className="text-zinc-400">Step {currentStep + 1} of {STEPS.length}: {STEPS[currentStep]?.title || ''}</p>
                </div>

                {/* Progress Bar */}
                <div className="flex gap-2 mb-8">
                    {STEPS.map((step, idx) => (
                        <div
                            key={idx}
                            className={cn(
                                "h-1.5 flex-1 rounded-full transition-all duration-300",
                                idx <= currentStep ? "bg-brand-500 shadow-[0_0_10px_rgba(251,146,60,0.5)]" : "bg-white/10"
                            )}
                        />
                    ))}
                </div>

                {/* Form Card */}
                <div className="glass-panel p-8 rounded-3xl relative overflow-hidden">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                            className="space-y-6"
                        >
                            {/* Step 1: Biological */}
                            {currentStep === 0 && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-zinc-300">Date of Birth</label>
                                            <Input
                                                type="date"
                                                {...register('dateOfBirth')}
                                                className="bg-white/5 border-white/10 focus:border-brand-500 transition-all"
                                            />
                                            {errors.dateOfBirth && <p className="text-xs text-red-500">{errors.dateOfBirth.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-zinc-300">Sex</label>
                                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                                                {['MALE', 'FEMALE'].map((s) => (
                                                    <button
                                                        key={s}
                                                        type="button"
                                                        onClick={() => setValue('biologicalSex', s as any)}
                                                        className={cn(
                                                            "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                                                            biologicalSex === s ? "bg-brand-500 text-white shadow-lg" : "text-zinc-400 hover:text-white"
                                                        )}
                                                    >
                                                        {s}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-zinc-300">Height (cm)</label>
                                            <Input
                                                type="number"
                                                {...register('heightCm', { valueAsNumber: true })}
                                                className="bg-white/5 border-white/10"
                                            />
                                            {errors.heightCm && <p className="text-xs text-red-500">Invalid height</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-zinc-300">Weight (kg)</label>
                                            <Input
                                                type="number"
                                                {...register('weightKg', { valueAsNumber: true })}
                                                className="bg-white/5 border-white/10"
                                            />
                                            {errors.weightKg && <p className="text-xs text-red-500">Invalid weight</p>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Goals */}
                            {currentStep === 1 && (
                                <div className="grid grid-cols-1 gap-3">
                                    {[
                                        { id: 'ENERGY', label: 'Max Energy', icon: Zap, desc: 'Avoid shift-based fatigue' },
                                        { id: 'WEIGHT_LOSS', label: 'Fat Loss', icon: Thermometer, desc: 'Burn fat efficiently' },
                                        { id: 'MUSCLE_GAIN', label: 'Muscle Gain', icon: Trophy, desc: 'Build and retain muscle' },
                                        { id: 'SLEEP_QUALITY', label: 'Better Sleep', icon: Moon, desc: 'Optimal recovery windows' },
                                        { id: 'GENERAL_HEALTH', label: 'General Health', icon: Activity, desc: 'Balanced circadian longevity' },
                                    ].map((goal) => (
                                        <button
                                            key={goal.id}
                                            type="button"
                                            onClick={() => setValue('primaryGoal', goal.id as any)}
                                            className={cn(
                                                "flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group",
                                                primaryGoal === goal.id ? "bg-brand-500/10 border-brand-500 shadow-[0_0_20px_rgba(251,146,60,0.15)]" : "bg-white/5 border-white/10 hover:border-white/20"
                                            )}
                                        >
                                            <div className={cn(
                                                "p-3 rounded-xl transition-all",
                                                primaryGoal === goal.id ? "bg-brand-500 text-white" : "bg-white/5 text-zinc-400 group-hover:text-white"
                                            )}>
                                                <goal.icon size={20} />
                                            </div>
                                            <div>
                                                <div className={cn(
                                                    "font-semibold",
                                                    primaryGoal === goal.id ? "text-brand-400" : "text-white"
                                                )}>{goal.label}</div>
                                                <div className="text-xs text-zinc-500">{goal.desc}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Step 3: Lifestyle */}
                            {currentStep === 2 && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-zinc-300">Shift Type</label>
                                            <select
                                                {...register('lifestyleType')}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white appearance-none focus:outline-none focus:border-brand-500"
                                            >
                                                <option value="NIGHT_SHIFT">Night Shift Worker</option>
                                                <option value="OFFICE">Office / Day Job</option>
                                                <option value="STUDENT">Student</option>
                                                <option value="ATHLETE">Professional Athlete</option>
                                                <option value="OTHER">Other / Rotating</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-zinc-300">Exp Level</label>
                                            <select
                                                {...register('experienceLevel')}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white appearance-none focus:outline-none focus:border-brand-500"
                                            >
                                                <option value="BEGINNER">Beginner</option>
                                                <option value="INTERMEDIATE">Intermediate</option>
                                                <option value="ADVANCED">Advanced</option>
                                                <option value="ATHLETE">Elite / Pro</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-zinc-300">Sleep Window Start</label>
                                            <Input type="time" {...register('sleepWindowStart')} className="bg-white/5 border-white/10" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-zinc-300">Sleep Window End</label>
                                            <Input type="time" {...register('sleepWindowEnd')} className="bg-white/5 border-white/10" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-zinc-300">Activity Level</label>
                                        <div className="grid grid-cols-5 gap-2">
                                            {[
                                                { id: 'SEDENTARY', label: 'Idle' },
                                                { id: 'LIGHTLY_ACTIVE', label: 'Light' },
                                                { id: 'MODERATELY_ACTIVE', label: 'Mod' },
                                                { id: 'VERY_ACTIVE', label: 'Very' },
                                                { id: 'EXTRA_ACTIVE', label: 'Max' }
                                            ].map((level) => (
                                                <button
                                                    key={level.id}
                                                    type="button"
                                                    onClick={() => setValue('activityLevel', level.id as any)}
                                                    className={cn(
                                                        "h-10 rounded-lg text-[10px] font-bold transition-all",
                                                        activityLevel === level.id ? "bg-brand-500 text-white shadow-lg" : "bg-white/5 text-zinc-500 hover:text-zinc-300"
                                                    )}
                                                >
                                                    {level.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-zinc-300">Health Conditions (Optional)</label>
                                        <div className="flex flex-wrap gap-2">
                                            {['ACNE', 'INJURIES', 'ALLERGIES', 'DIABETES', 'HYPERTENSION'].map((cond) => (
                                                <button
                                                    key={cond}
                                                    type="button"
                                                    onClick={() => {
                                                        const current = watch('healthConditions') || [];
                                                        if (current.includes(cond)) {
                                                            setValue('healthConditions', current.filter(c => c !== cond));
                                                        } else {
                                                            setValue('healthConditions', [...current, cond]);
                                                        }
                                                    }}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all",
                                                        (watch('healthConditions') || []).includes(cond)
                                                            ? "bg-brand-500/20 border-brand-500 text-brand-400"
                                                            : "bg-white/5 border-white/10 text-zinc-500"
                                                    )}
                                                >
                                                    {cond}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step 4: Nutrition */}
                            {currentStep === 3 && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            'ANY', 'VEGETARIAN', 'VEGAN', 'KETO',
                                            'PESCATARIAN', 'PALEO', 'HALAL', 'KOSHER'
                                        ].map((diet) => (
                                            <button
                                                key={diet}
                                                type="button"
                                                onClick={() => setValue('dietaryPreference', diet as any)}
                                                className={cn(
                                                    "p-3 rounded-xl border text-[10px] font-semibold transition-all",
                                                    dietaryPreference === diet ? "bg-brand-500/10 border-brand-500 text-brand-400 shadow-lg" : "bg-white/5 border-white/10 text-zinc-400 hover:border-white/20"
                                                )}
                                            >
                                                {diet}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-zinc-300">Specialized Diet Mode</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { id: 'BALANCED', label: 'Balanced' },
                                                { id: 'BUDGET', label: 'Budget' },
                                                { id: 'ACNE_SAFE', label: 'Acne Safe' },
                                                { id: 'RAMADAN', label: 'Ramadan' },
                                                { id: 'MASS_GAIN', label: 'Bulking' },
                                                { id: 'CUTTING', label: 'Cutting' }
                                            ].map((mode) => (
                                                <button
                                                    key={mode.id}
                                                    type="button"
                                                    onClick={() => setValue('dietMode', mode.id as any)}
                                                    className={cn(
                                                        "py-2 rounded-xl border text-[10px] font-bold transition-all",
                                                        dietMode === mode.id ? "bg-brand-500/20 border-brand-500 text-brand-400Shadow-lg" : "bg-white/5 border-white/10 text-zinc-500 hover:border-white/20"
                                                    )}
                                                >
                                                    {mode.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="p-4 bg-brand-500/5 rounded-2xl border border-brand-500/10">
                                        <p className="text-xs text-brand-400/80 leading-relaxed italic">
                                            "Our AI will prioritize locally relevant foods and budget-friendly alternatives based on your selection."
                                        </p>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {/* Footer Buttons */}
                    <div className="mt-8 flex gap-3">
                        {currentStep > 0 && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={prevStep}
                                className="flex-1 py-6 rounded-2xl border-white/10 hover:bg-white/5 text-zinc-400"
                            >
                                <ArrowLeft className="mr-2" size={18} />
                                Back
                            </Button>
                        )}
                        <Button
                            type="button"
                            onClick={nextStep}
                            disabled={isLoading}
                            className="flex-[2] py-6 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white shadow-[0_0_30px_rgba(251,146,60,0.3)] transition-all"
                        >
                            {isLoading ? 'Saving...' : currentStep === STEPS.length - 1 ? 'Finish & Sync' : 'Continue'}
                            {!isLoading && <ArrowRight className="ml-2" size={18} />}
                        </Button>
                    </div>
                </div>

                {/* Security Tag */}
                <p className="mt-8 text-center text-xs text-zinc-600 flex items-center justify-center gap-2">
                    <Zap size={10} className="text-brand-500" />
                    Your data is used solely for personalized circadian optimization.
                </p>
            </div>
        </div>
    );
}
