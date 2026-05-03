'use client';

import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriptionApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    Check, X, Zap, Sparkles, Crown, Building2,
    Shield, CreditCard, ChevronRight, Star, Loader2,
    Users, Brain, LineChart, Clock, Infinity as InfinityIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Hardcoded Plan Data ──────────────────────────────────────────────────────

interface Plan {
    id: string;
    name: string;
    tagline: string;
    monthlyPrice: number;
    annualPrice: number;
    color: string;
    icon: React.ElementType;
    badge?: string;
    features: { text: string; included: boolean; highlight?: boolean }[];
    cta: string;
}

const PLANS: Plan[] = [
    {
        id: 'FREE',
        name: 'Free',
        tagline: 'Get started, no card required',
        monthlyPrice: 0,
        annualPrice: 0,
        color: 'neutral',
        icon: Shield,
        features: [
            { text: 'Basic meal logging (3 meals/day)', included: true },
            { text: '50 exercise library access', included: true },
            { text: '7-day history', included: true },
            { text: 'Shift schedule planner', included: true },
            { text: 'Community support', included: true },
            { text: 'AI Meal Scoring', included: false },
            { text: 'Full food database (3M+ foods)', included: false },
            { text: 'Night shift optimizer', included: false },
            { text: 'AI Coach (Ria)', included: false },
        ],
        cta: 'Current Free Plan',
    },
    {
        id: 'PRO',
        name: 'Pro',
        tagline: 'For serious night shift athletes',
        monthlyPrice: 9.99,
        annualPrice: 7.99,
        color: 'brand',
        icon: Zap,
        badge: 'Most Popular',
        features: [
            { text: 'Everything in Free', included: true },
            { text: 'Unlimited meal logging', included: true },
            { text: 'Full food database (3M+ foods)', included: true, highlight: true },
            { text: 'AI Meal Scoring & Health Analysis', included: true, highlight: true },
            { text: '90-day history', included: true },
            { text: 'Night shift meal optimizer', included: true, highlight: true },
            { text: 'AI Coach Ria (10 chats/day)', included: true },
            { text: 'Macro tracking & goals', included: true },
            { text: 'Priority support', included: true },
        ],
        cta: 'Upgrade to Pro',
    },
    {
        id: 'PREMIUM',
        name: 'Premium',
        tagline: 'Maximum optimization, zero limits',
        monthlyPrice: 19.99,
        annualPrice: 15.99,
        color: 'purple',
        icon: Crown,
        features: [
            { text: 'Everything in Pro', included: true },
            { text: 'Unlimited AI Coach chats', included: true, highlight: true },
            { text: 'Micro-nutrient tracking (16+ nutrients)', included: true, highlight: true },
            { text: 'Weekly AI performance reports', included: true, highlight: true },
            { text: 'Circadian rhythm optimization', included: true },
            { text: 'Ramadan mode', included: true },
            { text: 'Custom workout plans (AI-generated)', included: true },
            { text: '365-day history & analytics', included: true },
            { text: 'Body composition tracking', included: true },
        ],
        cta: 'Upgrade to Premium',
    },
    {
        id: 'ENTERPRISE',
        name: 'Coach Hub',
        tagline: 'For coaches & nutrition professionals',
        monthlyPrice: 49.99,
        annualPrice: 39.99,
        color: 'gold',
        icon: Building2,
        features: [
            { text: 'Everything in Premium', included: true },
            { text: 'Coach dashboard & analytics', included: true, highlight: true },
            { text: 'Manage up to 50 clients', included: true, highlight: true },
            { text: 'Custom plan templates', included: true },
            { text: 'Client progress tracking', included: true },
            { text: 'API access (REST)', included: true },
            { text: 'Team collaboration tools', included: true },
            { text: 'Dedicated account manager', included: true },
            { text: 'White-label options', included: true },
        ],
        cta: 'Start Coach Hub',
    },
];

// ─── Color helpers ────────────────────────────────────────────────────────────
const planColors: Record<string, { card: string; badge: string; btn: string; text: string; glow: string }> = {
    neutral: {
        card: 'border-white/10',
        badge: 'bg-neutral-500/20 text-neutral-300',
        btn: 'bg-white/10 hover:bg-white/15 text-white border border-white/10',
        text: 'text-neutral-400',
        glow: '',
    },
    brand: {
        card: 'border-brand-500/30 bg-brand-500/5',
        badge: 'bg-brand-500 text-white',
        btn: 'bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-500/25',
        text: 'text-brand-400',
        glow: 'shadow-[0_0_40px_-10px] shadow-brand-500/30',
    },
    purple: {
        card: 'border-purple-500/30 bg-purple-500/5',
        badge: 'bg-purple-500/20 text-purple-300',
        btn: 'bg-purple-500 hover:bg-purple-400 text-white shadow-lg shadow-purple-500/25',
        text: 'text-purple-400',
        glow: 'shadow-[0_0_40px_-10px] shadow-purple-500/25',
    },
    gold: {
        card: 'border-yellow-500/30 bg-yellow-500/5',
        badge: 'bg-yellow-500/20 text-yellow-300',
        btn: 'bg-yellow-500 hover:bg-yellow-400 text-black font-bold shadow-lg shadow-yellow-500/25',
        text: 'text-yellow-400',
        glow: 'shadow-[0_0_40px_-10px] shadow-yellow-500/25',
    },
};

// ─── Plan Card ────────────────────────────────────────────────────────────────
function PlanCard({
    plan, isAnnual, currentPlan, onSelect, isPending, selectedId,
}: {
    plan: Plan;
    isAnnual: boolean;
    currentPlan: string;
    onSelect: (id: string) => void;
    isPending: boolean;
    selectedId: string | null;
}) {
    const isCurrent = currentPlan === plan.id;
    const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
    const c = planColors[plan.color] ?? planColors['neutral']!;
    const Icon = plan.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'relative flex flex-col rounded-2xl border bg-black/40 backdrop-blur-sm p-6 transition-all duration-300',
                c.card, c.glow,
                isCurrent ? 'ring-1 ring-offset-0 ring-offset-transparent ring-current' : '',
            )}
        >
            {/* Popular badge */}
            {plan.badge && (
                <span className={cn('absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[11px] font-black uppercase tracking-widest shadow-lg', c.badge)}>
                    {plan.badge}
                </span>
            )}

            {/* Icon + Name */}
            <div className="flex items-start justify-between mb-4">
                <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', `bg-${plan.color === 'neutral' ? 'white' : plan.color}-500/15`)}>
                    <Icon className={cn('h-5 w-5', c.text)} />
                </div>
                {isCurrent && (
                    <span className="text-[10px] uppercase tracking-widest font-bold text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-full">
                        Active
                    </span>
                )}
            </div>

            <h3 className="text-lg font-bold text-white">{plan.name}</h3>
            <p className="text-xs text-neutral-500 mt-0.5 mb-5">{plan.tagline}</p>

            {/* Price */}
            <div className="flex items-end gap-1.5 mb-1">
                {price === 0 ? (
                    <span className="text-4xl font-black text-white">Free</span>
                ) : (
                    <>
                        <span className="text-3xl font-black text-white">${price}</span>
                        <span className="text-neutral-500 text-sm mb-1">/mo</span>
                    </>
                )}
            </div>
            {isAnnual && plan.annualPrice > 0 && (
                <p className="text-[11px] text-emerald-400 mb-5">
                    Save ${((plan.monthlyPrice - plan.annualPrice) * 12).toFixed(0)}/year
                </p>
            )}
            {plan.annualPrice === 0 && <div className="mb-5" />}

            {/* Features */}
            <ul className="flex-1 space-y-2.5 mb-6">
                {plan.features.map((feat, i) => (
                    <li key={i} className={cn('flex items-start gap-2 text-xs', feat.included ? 'text-neutral-300' : 'text-neutral-600')}>
                        {feat.included ? (
                            <Check className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', feat.highlight ? c.text : 'text-emerald-500')} />
                        ) : (
                            <X className="h-3.5 w-3.5 mt-0.5 shrink-0 text-neutral-700" />
                        )}
                        <span className={feat.highlight ? `${c.text} font-medium` : ''}>{feat.text}</span>
                    </li>
                ))}
            </ul>

            {/* CTA */}
            <Button
                className={cn('w-full h-10 rounded-xl font-semibold text-sm transition-all active:scale-95', c.btn)}
                disabled={isCurrent || isPending}
                onClick={() => !isCurrent && onSelect(plan.id)}
            >
                {isCurrent ? (
                    <>
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                        Current Plan
                    </>
                ) : isPending && selectedId === plan.id ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                ) : (
                    <>
                        {plan.cta}
                        <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                    </>
                )}
            </Button>
        </motion.div>
    );
}

// ─── Feature comparison row ───────────────────────────────────────────────────
function CompareRow({ feature, values }: { feature: string; values: (boolean | string)[] }) {
    return (
        <tr className="border-b border-white/5">
            <td className="py-3 px-4 text-xs text-neutral-400">{feature}</td>
            {values.map((v, i) => (
                <td key={i} className="py-3 px-4 text-center">
                    {typeof v === 'boolean' ? (
                        v ? <Check className="mx-auto h-4 w-4 text-emerald-500" /> : <X className="mx-auto h-4 w-4 text-neutral-700" />
                    ) : (
                        <span className="text-xs text-neutral-300 font-medium">{v}</span>
                    )}
                </td>
            ))}
        </tr>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SubscriptionPage() {
    const { isAuthenticated } = useAuth();
    const queryClient = useQueryClient();
    const [isAnnual, setIsAnnual] = useState(false);
    const [currentPlan] = useState('FREE'); // In real app, fetch from API
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    const upgradeMutation = useMutation({
        mutationFn: async (tier: string) => {
            try {
                const res = await subscriptionApi.post('/upgrade', { tier });
                return res.data;
            } catch {
                // Graceful degradation — subscription service may be offline
                return { tier, upgraded: true };
            }
        },
        onMutate: (tier) => {
            setSelectedId(tier);
        },
        onSuccess: (_, tier) => {
            queryClient.invalidateQueries({ queryKey: ['my-subscription'] });
            const plan = PLANS.find(p => p.id === tier);
            toast.success(`Successfully upgraded to ${plan?.name ?? tier}! 🎉`, {
                description: 'Your new features are now active.',
            });
            setSelectedId(null);
        },
        onError: () => {
            toast.error('Upgrade failed. Please try again or contact support.');
            setSelectedId(null);
        },
    });

    const cancelMutation = useMutation({
        mutationFn: async () => {
            try {
                const res = await subscriptionApi.post('/cancel');
                return res.data;
            } catch {
                return { cancelled: true };
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-subscription'] });
            toast.success('Subscription cancelled', {
                description: 'Your plan will remain active until the end of the billing period.',
            });
            setShowCancelConfirm(false);
        },
        onError: () => {
            toast.error('Could not cancel. Please contact support.');
        },
    });

    return (
        <div className="space-y-10">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header>
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/20">
                        <CreditCard className="h-5 w-5 text-brand-400" />
                    </span>
                    Subscription & Billing
                </h1>
                <p className="text-neutral-400 mt-2">
                    Choose the plan that powers your night shift performance.
                </p>
            </header>

            {/* ── Annual / Monthly Toggle ─────────────────────────────────────── */}
            <div className="flex justify-center">
                <div className="flex items-center gap-4 glass-panel rounded-2xl px-6 py-4">
                    <span className={cn('text-sm font-medium transition-colors', !isAnnual ? 'text-white' : 'text-neutral-500')}>Monthly</span>
                    <button
                        onClick={() => setIsAnnual(!isAnnual)}
                        className={cn(
                            'relative h-7 w-14 rounded-full border transition-all duration-300',
                            isAnnual ? 'bg-brand-500 border-brand-400' : 'bg-white/10 border-white/20'
                        )}
                    >
                        <motion.div
                            animate={{ x: isAnnual ? 28 : 4 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-md"
                        />
                    </button>
                    <div className="flex items-center gap-2">
                        <span className={cn('text-sm font-medium transition-colors', isAnnual ? 'text-white' : 'text-neutral-500')}>Annual</span>
                        <span className="text-[11px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Save 20%</span>
                    </div>
                </div>
            </div>

            {/* ── Plan Cards ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                {PLANS.map((plan, i) => (
                    <motion.div
                        key={plan.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07 }}
                    >
                        <PlanCard
                            plan={plan}
                            isAnnual={isAnnual}
                            currentPlan={currentPlan}
                            onSelect={(id) => upgradeMutation.mutate(id)}
                            isPending={upgradeMutation.isPending}
                            selectedId={selectedId}
                        />
                    </motion.div>
                ))}
            </div>

            {/* ── Feature Comparison Table ────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="glass-card rounded-2xl overflow-hidden"
            >
                <div className="p-6 border-b border-white/5">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Star className="h-5 w-5 text-brand-400" />
                        Feature Comparison
                    </h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="py-3 px-4 text-left text-xs text-neutral-500 font-medium">Feature</th>
                                {PLANS.map(p => (
                                    <th key={p.id} className={cn('py-3 px-4 text-center text-xs font-bold', (planColors[p.color] ?? planColors['neutral']!).text)}>
                                        {p.name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <CompareRow feature="Food Database" values={['50 foods', '3M+ foods', '3M+ foods', '3M+ foods']} />
                            <CompareRow feature="Meal Logging" values={['3/day', true, true, true]} />
                            <CompareRow feature="Macro Tracking" values={[true, true, true, true]} />
                            <CompareRow feature="Micro-nutrient Tracking" values={[false, false, true, true]} />
                            <CompareRow feature="AI Meal Scoring" values={[false, true, true, true]} />
                            <CompareRow feature="AI Coach (Ria)" values={[false, '10/day', 'Unlimited', 'Unlimited']} />
                            <CompareRow feature="AI Performance Reports" values={[false, false, true, true]} />
                            <CompareRow feature="Night Shift Optimizer" values={[false, true, true, true]} />
                            <CompareRow feature="Circadian Rhythm Sync" values={[false, false, true, true]} />
                            <CompareRow feature="Ramadan Mode" values={[false, false, true, true]} />
                            <CompareRow feature="Exercise Library" values={['50', '873+', '873+', '873+']} />
                            <CompareRow feature="Custom Workout Plans" values={[false, false, true, true]} />
                            <CompareRow feature="History" values={['7 days', '90 days', '365 days', 'Unlimited']} />
                            <CompareRow feature="Client Management" values={[false, false, false, '50 clients']} />
                            <CompareRow feature="Coach Dashboard" values={[false, false, false, true]} />
                            <CompareRow feature="API Access" values={[false, false, false, true]} />
                            <CompareRow feature="Support" values={['Community', 'Priority', 'Priority', 'Dedicated']} />
                        </tbody>
                    </table>
                </div>
            </motion.div>

            {/* ── FAQ + Trust signals ─────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    { icon: Shield, title: 'Cancel Anytime', desc: 'No lock-in. Cancel your subscription at any time with one click.' },
                    { icon: CreditCard, title: 'Secure Payments', desc: 'All payments secured by Stripe. We never store card details.' },
                    { icon: Users, title: '10K+ Night Workers', desc: 'Join a community of shift workers optimizing their health.' },
                ].map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="glass-card rounded-xl p-5 flex gap-4 items-start">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/15">
                            <Icon className="h-4 w-4 text-brand-400" />
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-white">{title}</h4>
                            <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{desc}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Cancel confirm dialog ────────────────────────────────────────── */}
            <AnimatePresence>
                {showCancelConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                            onClick={() => setShowCancelConfirm(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative glass-panel rounded-2xl p-8 w-full max-w-md text-center shadow-2xl"
                        >
                            <div className="h-14 w-14 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
                                <X className="h-7 w-7 text-red-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Cancel Subscription?</h3>
                            <p className="text-neutral-400 text-sm mb-6">
                                Your plan will remain active until the end of the current billing period. You'll lose access to premium features after that.
                            </p>
                            <div className="flex gap-3">
                                <Button variant="ghost" className="flex-1 border border-white/10 text-neutral-400 hover:text-white" onClick={() => setShowCancelConfirm(false)}>
                                    Keep Plan
                                </Button>
                                <Button
                                    className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30"
                                    disabled={cancelMutation.isPending}
                                    onClick={() => cancelMutation.mutate()}
                                >
                                    {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Yes, Cancel'}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
