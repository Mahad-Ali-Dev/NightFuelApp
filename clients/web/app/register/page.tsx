'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Zap, Eye, EyeOff, AlertCircle, Loader2, Check } from 'lucide-react';

const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    displayName: z.string().min(2, 'Name must be at least 2 characters'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
    const { register: registerUser } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<RegisterValues>({
        resolver: zodResolver(registerSchema),
    });

    const passwordValue = watch('password', '');

    const onSubmit = async (data: RegisterValues) => {
        try {
            setError(null);
            const { confirmPassword, ...registerData } = data;
            await registerUser({ ...registerData, region: 'us' });
        } catch (err: any) {
            const errData = err.response?.data;
            const message =
                errData?.error ||
                errData?.message ||
                (Array.isArray(errData?.issues) ? errData.issues[0]?.message : null) ||
                'Failed to register. Please try again.';
            setError(message);
        }
    };

    // Password strength indicators
    const checks = [
        { label: '8+ characters', ok: passwordValue.length >= 8 },
        { label: 'Uppercase letter', ok: /[A-Z]/.test(passwordValue) },
        { label: 'Number or symbol', ok: /[\d\W]/.test(passwordValue) },
    ];

    return (
        <div className="relative flex min-h-screen items-center justify-center p-4">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-[20%] -left-[10%] h-[60%] w-[50%] rounded-full bg-brand-500/15 blur-[150px]" />
                <div className="absolute bottom-[5%] right-[5%] h-[50%] w-[40%] rounded-full bg-indigo-500/10 blur-[120px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="relative z-10 w-full max-w-sm"
            >
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="h-14 w-14 rounded-2xl bg-brand-500 flex items-center justify-center shadow-2xl shadow-brand-500/40 mb-4">
                        <Zap className="h-7 w-7 text-white" strokeWidth={2.5} />
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight">NightFuel</h1>
                    <p className="text-neutral-500 text-sm mt-1">Fuel your night shift performance</p>
                </div>

                {/* Card */}
                <div className="glass-card p-8 space-y-6">
                    <div className="text-center">
                        <h2 className="text-xl font-bold text-white">Create account</h2>
                        <p className="text-neutral-500 text-sm mt-1">Start your chrono-nutrition journey</p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        {/* Name */}
                        <div className="space-y-1.5">
                            <Label htmlFor="displayName" className="text-neutral-300 text-sm font-medium">Full Name</Label>
                            <Input
                                id="displayName"
                                type="text"
                                placeholder="John Doe"
                                autoComplete="name"
                                className="bg-white/5 border-white/10 text-white placeholder:text-neutral-600 focus-visible:ring-brand-500 h-11"
                                {...register('displayName')}
                            />
                            {errors.displayName && (
                                <p className="text-xs text-red-400 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />{errors.displayName.message}
                                </p>
                            )}
                        </div>

                        {/* Email */}
                        <div className="space-y-1.5">
                            <Label htmlFor="email" className="text-neutral-300 text-sm font-medium">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                autoComplete="email"
                                className="bg-white/5 border-white/10 text-white placeholder:text-neutral-600 focus-visible:ring-brand-500 h-11"
                                {...register('email')}
                            />
                            {errors.email && (
                                <p className="text-xs text-red-400 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />{errors.email.message}
                                </p>
                            )}
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                            <Label htmlFor="password" className="text-neutral-300 text-sm font-medium">Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                    className="bg-white/5 border-white/10 text-white placeholder:text-neutral-600 focus-visible:ring-brand-500 h-11 pr-10"
                                    {...register('password')}
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors" aria-label="Toggle password">
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {/* Password strength */}
                            {passwordValue.length > 0 && (
                                <div className="flex gap-3 mt-1.5">
                                    {checks.map(c => (
                                        <span key={c.label} className={`flex items-center gap-1 text-[10px] transition-colors ${c.ok ? 'text-emerald-400' : 'text-neutral-600'}`}>
                                            <Check className="h-2.5 w-2.5" />{c.label}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {errors.password && (
                                <p className="text-xs text-red-400 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />{errors.password.message}
                                </p>
                            )}
                        </div>

                        {/* Confirm Password */}
                        <div className="space-y-1.5">
                            <Label htmlFor="confirmPassword" className="text-neutral-300 text-sm font-medium">Confirm Password</Label>
                            <div className="relative">
                                <Input
                                    id="confirmPassword"
                                    type={showConfirm ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                    className="bg-white/5 border-white/10 text-white placeholder:text-neutral-600 focus-visible:ring-brand-500 h-11 pr-10"
                                    {...register('confirmPassword')}
                                />
                                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors" aria-label="Toggle confirm password">
                                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {errors.confirmPassword && (
                                <p className="text-xs text-red-400 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />{errors.confirmPassword.message}
                                </p>
                            )}
                        </div>

                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5"
                            >
                                <AlertCircle className="h-4 w-4 shrink-0" />{error}
                            </motion.div>
                        )}

                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full h-11 bg-brand-500 hover:bg-brand-400 text-white font-semibold shadow-lg shadow-brand-500/25 transition-all active:scale-95"
                        >
                            {isSubmitting ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account...</>
                            ) : 'Create account'}
                        </Button>
                    </form>

                    <p className="text-center text-sm text-neutral-500">
                        Already have an account?{' '}
                        <Link href="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
                            Sign in
                        </Link>
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
