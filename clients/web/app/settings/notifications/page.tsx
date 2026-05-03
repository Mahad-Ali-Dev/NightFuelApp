'use client';

import { useAuth } from '@/context/auth-context';
import { notificationApi } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Loader2, Bell, Shield, Mail, Smartphone,
    CheckCircle2, Dumbbell, Moon, Activity, Utensils, Zap
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface NotificationPreferences {
    emailEnabled: boolean;
    pushEnabled: boolean;
    shiftAlerts: boolean;
    mealReminders: boolean;
    workoutReminders: boolean;
    progressUpdates: boolean;
    sleepTips: boolean;
    marketingAlerts: boolean;
}

const defaultPrefs: NotificationPreferences = {
    emailEnabled: true,
    pushEnabled: true,
    shiftAlerts: true,
    mealReminders: true,
    workoutReminders: true,
    progressUpdates: true,
    sleepTips: true,
    marketingAlerts: false,
};

export default function NotificationSettingsPage() {
    const { isAuthenticated } = useAuth();
    const queryClient = useQueryClient();

    const { data: preferences, isLoading } = useQuery<NotificationPreferences>({
        queryKey: ['notification-preferences'],
        queryFn: async () => {
            // Try localStorage first for instant response
            const saved = localStorage.getItem('nf_notification_prefs');
            if (saved) return JSON.parse(saved) as NotificationPreferences;
            try {
                const res = await notificationApi.get('/preferences');
                return res.data;
            } catch {
                return defaultPrefs;
            }
        },
        enabled: isAuthenticated,
        placeholderData: defaultPrefs,
    });

    const mutation = useMutation({
        mutationFn: async (values: Partial<NotificationPreferences>) => {
            // Always save to localStorage so toggles work without backend
            const current = queryClient.getQueryData<NotificationPreferences>(['notification-preferences']) ?? defaultPrefs;
            const updated = { ...current, ...values };
            localStorage.setItem('nf_notification_prefs', JSON.stringify(updated));
            try {
                const res = await notificationApi.put('/preferences', values);
                return res.data;
            } catch {
                return updated;
            }
        },
        // ─── OPTIMISTIC UPDATE ─────────────────────────────────────────────────
        onMutate: async (newValues) => {
            await queryClient.cancelQueries({ queryKey: ['notification-preferences'] });
            const previousPrefs = queryClient.getQueryData<NotificationPreferences>(['notification-preferences']);
            queryClient.setQueryData<NotificationPreferences>(['notification-preferences'], (old) => ({
                ...(old ?? defaultPrefs),
                ...newValues,
            }));
            return { previousPrefs };
        },
        onError: (_err, _newValues, context) => {
            if (context?.previousPrefs) {
                queryClient.setQueryData(['notification-preferences'], context.previousPrefs);
            }
            toast.error('Failed to save preference');
        },
        onSuccess: () => {
            toast.success('Preference saved');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
        },
    });

    const togglePref = (key: keyof NotificationPreferences) => {
        if (!preferences) return;
        mutation.mutate({ [key]: !preferences[key] });
    };

    const prefs = preferences ?? defaultPrefs;

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
        >
            <header>
                <h1 className="text-3xl font-bold text-white">Notification Center</h1>
                <p className="text-neutral-400 mt-1">Control how and when you want to be notified.</p>
            </header>

            <div className="grid gap-5">
                {/* ─── Delivery Channels ───────────────────────────────────── */}
                <Card className="glass-card border-white/5 overflow-hidden">
                    <CardHeader className="border-b border-white/5 pb-4 bg-white/[0.02]">
                        <CardTitle className="text-white flex items-center gap-2.5 text-base font-semibold">
                            <span className="p-1.5 rounded-lg bg-blue-500/20">
                                <Shield className="h-4 w-4 text-blue-400" />
                            </span>
                            Delivery Channels
                        </CardTitle>
                        <CardDescription className="text-neutral-500 text-sm">
                            Choose your preferred platforms for alerts.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-4">
                        <ToggleRow
                            icon={Mail}
                            iconColor="text-emerald-400"
                            iconBg="bg-emerald-500/15"
                            label="Email Notifications"
                            description="Personalized meal plans and weekly summaries."
                            active={prefs.emailEnabled}
                            onToggle={() => togglePref('emailEnabled')}
                            isPending={mutation.isPending}
                        />
                        <ToggleRow
                            icon={Smartphone}
                            iconColor="text-purple-400"
                            iconBg="bg-purple-500/15"
                            label="Push Notifications"
                            description="Real-time shift alerts and meal reminders."
                            active={prefs.pushEnabled}
                            onToggle={() => togglePref('pushEnabled')}
                            isPending={mutation.isPending}
                        />
                    </CardContent>
                </Card>

                {/* ─── Alert Categories ─────────────────────────────────────── */}
                <Card className="glass-card border-white/5 overflow-hidden">
                    <CardHeader className="border-b border-white/5 pb-4 bg-white/[0.02]">
                        <CardTitle className="text-white flex items-center gap-2.5 text-base font-semibold">
                            <span className="p-1.5 rounded-lg bg-brand-500/20">
                                <Bell className="h-4 w-4 text-brand-400" />
                            </span>
                            Alert Categories
                        </CardTitle>
                        <CardDescription className="text-neutral-500 text-sm">
                            What kind of updates do you want to receive?
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-4">
                        <ToggleRow
                            icon={Zap}
                            iconColor="text-brand-400"
                            iconBg="bg-brand-500/15"
                            label="Shift Changes"
                            description="Alerts when your schedule is updated."
                            active={prefs.shiftAlerts}
                            onToggle={() => togglePref('shiftAlerts')}
                            isPending={mutation.isPending}
                        />
                        <ToggleRow
                            icon={Utensils}
                            iconColor="text-emerald-400"
                            iconBg="bg-emerald-500/15"
                            label="Meal Reminders"
                            description="Gentle nudges to log your food or follow your plan."
                            active={prefs.mealReminders}
                            onToggle={() => togglePref('mealReminders')}
                            isPending={mutation.isPending}
                        />
                        <ToggleRow
                            icon={Dumbbell}
                            iconColor="text-blue-400"
                            iconBg="bg-blue-500/15"
                            label="Workout Reminders"
                            description="Time to train — personalized to your shift schedule."
                            active={prefs.workoutReminders}
                            onToggle={() => togglePref('workoutReminders')}
                            isPending={mutation.isPending}
                        />
                        <ToggleRow
                            icon={Activity}
                            iconColor="text-violet-400"
                            iconBg="bg-violet-500/15"
                            label="Progress Updates"
                            description="Weekly performance reports and milestones."
                            active={prefs.progressUpdates}
                            onToggle={() => togglePref('progressUpdates')}
                            isPending={mutation.isPending}
                        />
                        <ToggleRow
                            icon={Moon}
                            iconColor="text-indigo-400"
                            iconBg="bg-indigo-500/15"
                            label="Sleep Tips"
                            description="Circadian rhythm-aligned recovery suggestions."
                            active={prefs.sleepTips}
                            onToggle={() => togglePref('sleepTips')}
                            isPending={mutation.isPending}
                        />
                        <ToggleRow
                            icon={Bell}
                            iconColor="text-neutral-400"
                            iconBg="bg-neutral-700/50"
                            label="System Updates"
                            description="Important news about NightFuel features."
                            active={prefs.marketingAlerts}
                            onToggle={() => togglePref('marketingAlerts')}
                            isPending={mutation.isPending}
                        />
                    </CardContent>
                </Card>

                {/* ─── Quiet Mode Banner ─────────────────────────────────────── */}
                <motion.div
                    initial={{ scale: 0.98 }}
                    animate={{ scale: 1 }}
                    className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 flex items-start gap-3.5"
                >
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-white font-semibold text-sm">Quiet Mode Active</h4>
                        <p className="text-neutral-400 text-sm mt-1 leading-relaxed">
                            NightFuel automatically silences non-urgent alerts during your scheduled sleep windows to protect your circadian rhythm.
                        </p>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}

/* ─── Toggle Row Component ──────────────────────────────────────────────── */
interface ToggleRowProps {
    icon: React.ComponentType<{ className?: string }>;
    iconColor: string;
    iconBg: string;
    label: string;
    description: string;
    active: boolean;
    onToggle: () => void;
    isPending: boolean;
}

function ToggleRow({ icon: Icon, iconColor, iconBg, label, description, active, onToggle, isPending }: ToggleRowProps) {
    return (
        <div
            className={cn(
                "flex items-center justify-between p-4 rounded-xl border transition-all duration-200 cursor-pointer group",
                active
                    ? "bg-white/[0.04] border-white/10"
                    : "bg-transparent border-white/[0.04] hover:bg-white/[0.03]"
            )}
            onClick={onToggle}
        >
            <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-xl shrink-0 transition-colors", iconBg)}>
                    <Icon className={cn("h-4 w-4", iconColor)} />
                </div>
                <div>
                    <p className={cn("font-medium text-sm transition-colors", active ? "text-white" : "text-neutral-400")}>
                        {label}
                    </p>
                    <p className="text-neutral-600 text-xs mt-0.5">{description}</p>
                </div>
            </div>

            {/* Animated Toggle Switch */}
            <button
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                disabled={isPending}
                aria-pressed={active}
                aria-label={`Toggle ${label}`}
                className={cn(
                    "relative h-6 w-11 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black shrink-0 disabled:opacity-50 ml-4",
                    active
                        ? "bg-brand-500 shadow-[0_0_16px_rgba(249,115,22,0.35)]"
                        : "bg-neutral-700 group-hover:bg-neutral-600"
                )}
            >
                <motion.div
                    animate={{ x: active ? 20 : 2 }}
                    transition={{ type: 'spring', stiffness: 700, damping: 30 }}
                    className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-md"
                />
            </button>
        </div>
    );
}
