'use client';

import { useState, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/context/auth-context';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Zap, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginForm() {
    const { login } = useAuth();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
        resolver: zodResolver(loginSchema),
    });

    const onSubmit = async (data: LoginValues) => {
        try {
            setError(null);
            await login(data);
        } catch (err: any) {
            const msg = err.response?.data?.error
                ?? err.response?.data?.message
                ?? 'Invalid email or password.';
            setError(msg);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-full max-w-sm"
        >
            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
                <div className="h-14 w-14 rounded-2xl bg-brand-500 flex items-center justify-center shadow-2xl shadow-brand-500/40 mb-4">
                    <Zap className="h-7 w-7 text-white" strokeWidth={2.5} />
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight">NightFuel</h1>
                <p className="text-neutral-500 text-sm mt-1">Chrono-nutrition for shift workers</p>
            </div>

            {/* Card */}
            <div className="glass-card p-8 space-y-6">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-white">Welcome back</h2>
                    <p className="text-neutral-500 text-sm mt-1">Sign in to your account</p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

                    <div className="space-y-1.5">
                        <Label htmlFor="password" className="text-neutral-300 text-sm font-medium">Password</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                className="bg-white/5 border-white/10 text-white placeholder:text-neutral-600 focus-visible:ring-brand-500 h-11 pr-10"
                                {...register('password')}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {errors.password && (
                            <p className="text-xs text-red-400 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />{errors.password.message}
                            </p>
                        )}
                    </div>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5"
                        >
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {error}
                        </motion.div>
                    )}

                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full h-11 bg-brand-500 hover:bg-brand-400 text-white font-semibold shadow-lg shadow-brand-500/25 transition-all active:scale-95"
                    >
                        {isSubmitting ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</>
                        ) : 'Sign in'}
                    </Button>
                </form>

                <p className="text-center text-sm text-neutral-500">
                    New to NightFuel?{' '}
                    <Link href="/register" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
                        Create an account
                    </Link>
                </p>
            </div>
        </motion.div>
    );
}

export default function LoginPage() {
    return (
        <div className="relative flex min-h-screen items-center justify-center p-4">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-[20%] right-[10%] h-[60%] w-[50%] rounded-full bg-brand-500/15 blur-[150px]" />
                <div className="absolute bottom-[5%] -left-[5%] h-[50%] w-[40%] rounded-full bg-purple-500/10 blur-[120px]" />
            </div>
            <div className="relative z-10 w-full flex justify-center">
                <Suspense>
                    <LoginForm />
                </Suspense>
            </div>
        </div>
    );
}
