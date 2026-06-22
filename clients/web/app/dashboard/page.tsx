'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { shiftApi, getWeeklyAudit } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Plus, Trash2, Edit, Zap, CalendarDays, Moon,
    Dumbbell, Sparkles, CheckCircle2,
    AlertCircle, Lightbulb, Waves, Activity, ChevronRight,
    Flame, Apple, BarChart3
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { StepTracker } from '@/components/StepTracker';
import { KegelTrainer } from '@/components/health/KegelTrainer';
import { WaterTracker } from '@/components/nutrition/WaterTracker';
import { ActivityHeatmap } from '@/components/progress/ActivityHeatmap';
import { cn } from '@/lib/utils';

const fetchShifts = async (start: string, end: string) => {
    console.log('[Dashboard] Fetching shifts:', { start, end });
    try {
        const res = await shiftApi.get(`/?start=${start}&end=${end}`);
        console.log('[Dashboard] Shifts response:', res.status, res.data);
        return res.data;
    } catch (err: any) {
        console.error('[Dashboard] Shifts fetch error:', err.response?.status, err.response?.data || err.message);
        return [];
    }
};

// ─── Quick Action Config ─────────────────────────────────────────────────────
const QUICK_ACTIONS = [
    {
        href: '/dashboard/exercises',
        icon: Dumbbell,
        label: 'Exercises',
        sub: '1000+ exercises',
        color: 'text-orange-400',
        bg: 'bg-orange-500/15',
        glow: 'shadow-orange-500/20',
    },
    {
        href: '/dashboard/meals',
        icon: Apple,
        label: 'Log Meal',
        sub: 'Track nutrition',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/15',
        glow: 'shadow-emerald-500/20',
    },
    {
        href: '/dashboard/exercise',
        icon: Flame,
        label: 'Log Workout',
        sub: 'Track strength',
        color: 'text-red-400',
        bg: 'bg-red-500/15',
        glow: 'shadow-red-500/20',
    },
    {
        href: '/dashboard/sleep',
        icon: Moon,
        label: 'Log Sleep',
        sub: 'Recovery data',
        color: 'text-indigo-400',
        bg: 'bg-indigo-500/15',
        glow: 'shadow-indigo-500/20',
    },
    {
        href: '/dashboard/performance',
        icon: BarChart3,
        label: 'Progress',
        sub: 'Charts & stats',
        color: 'text-violet-400',
        bg: 'bg-violet-500/15',
        glow: 'shadow-violet-500/20',
    },
    {
        href: '/dashboard/plan',
        icon: Zap,
        label: "Today's Plan",
        sub: 'AI-powered',
        color: 'text-brand-400',
        bg: 'bg-brand-500/15',
        glow: 'shadow-brand-500/20',
    },
];

export default function DashboardPage() {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();
    const [showKegel, setShowKegel] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) {
            router.push('/login');
            return;
        }
        if (user && !user.onboardingCompleted) {
            router.push('/onboarding');
        }
    }, [isAuthenticated, user, router]);

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    const queryClient = useQueryClient();

    const { data: shifts, isLoading: shiftsLoading } = useQuery({
        queryKey: ['shifts', start, end],
        queryFn: () => fetchShifts(start as string, end as string),
        enabled: !!user && !!start && !!end,
    });

    const { data: audit, isLoading: auditLoading } = useQuery({
        queryKey: ['weekly-audit'],
        queryFn: () => getWeeklyAudit(),
        enabled: !!user,
        staleTime: 1000 * 60 * 60 * 24,
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => shiftApi.delete(`/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shifts'] }),
    });

    if (!isAuthenticated || !user) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const greeting = (() => {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 18) return 'Good afternoon';
        return 'Good evening';
    })();

    return (
        <div className="min-h-screen bg-transparent">
            {/* Ambient background blobs */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 right-0 w-[60%] h-[40%] bg-brand-500/8 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 left-0 w-[50%] h-[40%] bg-blue-500/8 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-8">

                {/* ── Greeting Header ──────────────────────────────────────── */}
                <motion.header
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-neutral-400 text-sm font-medium">{greeting} 👋</p>
                            <h1 className="text-2xl md:text-3xl font-black text-white mt-0.5">
                                {user?.email?.split('@')[0] ?? 'Athlete'}
                            </h1>
                            <p className="text-neutral-500 text-sm mt-1">
                                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Link href="/dashboard/plan">
                                <Button className="bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-lg shadow-brand-500/25 font-semibold">
                                    <Zap size={16} className="mr-1.5" />
                                    Today's Plan
                                </Button>
                            </Link>
                        </div>
                    </div>
                </motion.header>

                {/* ── Quick Action Grid ─────────────────────────────────────── */}
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                >
                    <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-3">Quick Access</h2>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                        {QUICK_ACTIONS.map((action, idx) => (
                            <motion.div
                                key={action.href}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 + idx * 0.04 }}
                            >
                                <Link href={action.href}>
                                    <div className={cn(
                                        "flex flex-col items-center gap-2.5 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08] transition-all group cursor-pointer",
                                    )}>
                                        <div className={cn("p-3 rounded-xl transition-transform group-hover:scale-110", action.bg)}>
                                            <action.icon size={20} className={action.color} />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-white text-xs font-bold leading-tight">{action.label}</p>
                                            <p className="text-neutral-600 text-[10px] mt-0.5 hidden md:block">{action.sub}</p>
                                        </div>
                                    </div>
                                </Link>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                {/* ── Feature Spotlight: Exercises ────────────────────────── */}
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                >
                    <Link href="/dashboard/exercises">
                        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500/20 via-brand-500/10 to-transparent border border-orange-500/20 p-6 hover:border-orange-500/40 transition-all group cursor-pointer">
                            {/* Background icon */}
                            <Dumbbell
                                size={120}
                                className="absolute -right-6 -bottom-4 text-white/5 group-hover:text-white/8 transition-colors"
                            />

                            <div className="relative z-10 flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-bold bg-orange-500/20 text-orange-400 px-2.5 py-1 rounded-full border border-orange-500/20">
                                            NEW
                                        </span>
                                        <span className="text-xs text-neutral-500">Exercise Library</span>
                                    </div>
                                    <h3 className="text-xl font-black text-white mb-1.5">
                                        1,000+ Exercise Guides
                                    </h3>
                                    <p className="text-neutral-400 text-sm leading-relaxed">
                                        Home, Gym, Cardio & Kegel workouts with animated GIFs and step-by-step instructions.
                                    </p>
                                    <div className="flex items-center gap-3 mt-4">
                                        {[
                                            { label: 'Gym', color: 'text-orange-400 bg-orange-500/15' },
                                            { label: 'Home', color: 'text-emerald-400 bg-emerald-500/15' },
                                            { label: 'Cardio', color: 'text-blue-400 bg-blue-500/15' },
                                            { label: 'Kegel', color: 'text-purple-400 bg-purple-500/15' },
                                        ].map((tag) => (
                                            <span
                                                key={tag.label}
                                                className={cn("text-[11px] font-bold px-2.5 py-1 rounded-xl", tag.color)}
                                            >
                                                {tag.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="shrink-0 p-3 bg-orange-500/20 rounded-2xl group-hover:bg-orange-500/30 transition-colors">
                                    <ChevronRight size={24} className="text-orange-400" />
                                </div>
                            </div>
                        </div>
                    </Link>
                </motion.section>

                {/* ── Weekly Recap ─────────────────────────────────────────── */}
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Sparkles size={14} className="text-brand-400" />
                        Weekly Recap
                    </h2>

                    {auditLoading ? (
                        <div className="glass-card h-40 animate-pulse rounded-2xl" />
                    ) : audit?.data ? (
                        <Card className="glass-card border-brand-500/10 bg-brand-500/5">
                            <CardContent className="p-5">
                                <div className="grid gap-5 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                                            <CheckCircle2 size={12} /> Wins
                                        </h3>
                                        <ul className="space-y-1.5">
                                            {audit.data.wins?.map((win: string, i: number) => (
                                                <li key={i} className="text-sm text-neutral-300 leading-relaxed flex items-start gap-1.5">
                                                    <span className="text-emerald-500 mt-1">•</span>
                                                    {win}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                                            <AlertCircle size={12} /> Focus Areas
                                        </h3>
                                        <ul className="space-y-1.5">
                                            {audit.data.struggles?.map((s: string, i: number) => (
                                                <li key={i} className="text-sm text-neutral-300 leading-relaxed flex items-start gap-1.5">
                                                    <span className="text-amber-500 mt-1">•</span>
                                                    {s}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="space-y-2 md:border-l md:border-white/10 md:pl-5">
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-brand-400 flex items-center gap-1.5">
                                            <Lightbulb size={12} /> Coach's Advice
                                        </h3>
                                        <p className="text-sm text-neutral-200 italic leading-relaxed">
                                            "{audit.data.coaching_advice}"
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="glass-card p-8 text-center rounded-2xl border-dashed border border-white/10">
                            <Sparkles size={24} className="text-neutral-600 mx-auto mb-2" />
                            <p className="text-neutral-500 text-sm">Log more data this week to unlock your AI coaching recap.</p>
                        </div>
                    )}
                </motion.section>

                {/* ── Stats Cards Row ──────────────────────────────────────── */}
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                    {/* Step Tracker */}
                    <StepTracker />

                    {/* Kegel Card */}
                    <motion.div
                        whileHover={{ y: -2 }}
                        onClick={() => setShowKegel(true)}
                        className="cursor-pointer glass-card p-5 rounded-2xl border-purple-500/10 bg-purple-500/5 hover:bg-purple-500/10 hover:border-purple-500/25 transition-all flex flex-col items-center justify-center text-center gap-3 group"
                    >
                        <div className="p-3.5 rounded-2xl bg-purple-500/20 group-hover:scale-110 transition-transform">
                            <Waves size={24} className="text-purple-400" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold">Pelvic Floor</h3>
                            <p className="text-neutral-500 text-xs mt-1">Daily 2-min Kegel session</p>
                        </div>
                        <span className="text-[10px] font-bold text-purple-400 bg-purple-500/15 px-2.5 py-1 rounded-full">
                            Start Session →
                        </span>
                    </motion.div>

                    {/* Water Intake Tracker */}
                    <WaterTracker compact />
                </motion.section>

                {/* ── Recent Shifts ────────────────────────────────────────── */}
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                            <CalendarDays size={14} />
                            Recent Shifts
                        </h2>
                        <Link href="/shifts/new">
                            <Button
                                size="sm"
                                className="h-8 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white border border-white/10 rounded-xl text-xs font-medium"
                            >
                                <Plus size={14} className="mr-1" />
                                Add Shift
                            </Button>
                        </Link>
                    </div>

                    {shiftsLoading ? (
                        <div className="grid gap-3 md:grid-cols-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="glass-card h-28 animate-pulse rounded-2xl" />
                            ))}
                        </div>
                    ) : shifts?.length ? (
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {shifts.map((shift: any, i: number) => (
                                <motion.div
                                    key={shift.id}
                                    initial={{ opacity: 0, scale: 0.97 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: i * 0.06 }}
                                >
                                    <Card className="glass-card border-white/[0.04] hover:border-white/10 transition-all">
                                        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                                            <CardTitle className="text-xs font-bold text-brand-400">
                                                {new Date(shift.shiftDate).toLocaleDateString(undefined, {
                                                    weekday: 'short', month: 'short', day: 'numeric',
                                                })}
                                            </CardTitle>
                                            <div className="flex gap-1">
                                                <Link href={`/shifts/${shift.id}/edit`}>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-600 hover:text-white hover:bg-white/10 rounded-lg">
                                                        <Edit size={13} />
                                                    </Button>
                                                </Link>
                                                <Button
                                                    variant="ghost" size="icon"
                                                    className="h-7 w-7 text-neutral-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg"
                                                    onClick={() => deleteMutation.mutate(shift.id)}
                                                >
                                                    <Trash2 size={13} />
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="px-4 pb-4">
                                            <div className="text-lg font-black text-white">{shift.shiftType}</div>
                                            <p className="text-xs text-neutral-500 mt-0.5">
                                                {new Date(shift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                {' – '}
                                                {new Date(shift.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                            {shift.isDayOff && (
                                                <span className="inline-flex items-center mt-2 rounded-lg border px-2 py-0.5 text-[10px] font-bold bg-neutral-800/80 text-neutral-300 border-neutral-700">
                                                    Rest Day
                                                </span>
                                            )}
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div className="glass-card p-10 text-center rounded-2xl border-dashed border border-white/10">
                            <CalendarDays size={32} className="text-neutral-700 mx-auto mb-3" />
                            <p className="text-neutral-500 text-sm">No shifts found for this month.</p>
                            <Link href="/shifts/new">
                                <Button className="mt-4 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm">
                                    <Plus size={15} className="mr-1.5" />
                                    Create Your First Shift
                                </Button>
                            </Link>
                        </div>
                    )}
                </motion.section>

                {/* ── Activity Heatmap ──────────────────────────────────────── */}
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                >
                    <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Flame size={14} className="text-emerald-400" />
                        Workout Activity
                    </h2>
                    <ActivityHeatmap weeks={12} />
                </motion.section>
            </div>

            {/* Kegel Trainer Modal */}
            <AnimatePresence>
                {showKegel && <KegelTrainer onClose={() => setShowKegel(false)} />}
            </AnimatePresence>
        </div>
    );
}
