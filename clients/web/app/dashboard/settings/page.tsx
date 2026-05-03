'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
    ChevronLeft, Ruler, Eye, Bell, Volume2, Palette, Globe2,
    Moon, Sun, Monitor, Shield, Share2, Vibrate, Heart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { userApi } from '@/lib/api';
import { toast } from 'sonner';

interface Settings {
    units: 'metric' | 'imperial';
    displayMeasurements: boolean;
    timerNotification: boolean;
    timerSound: string;
    motivationalPhrases: boolean;
    appearance: 'dark' | 'light' | 'system';
    language: string;
    dataSharing: boolean;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className={cn(
                'relative w-12 h-7 rounded-full transition-all shrink-0',
                checked ? 'bg-brand-500' : 'bg-white/10'
            )}
        >
            <motion.div
                className="absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md"
                animate={{ left: checked ? '22px' : '2px' }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
        </button>
    );
}

export default function SettingsPage() {
    const router = useRouter();
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const defaults: Settings = {
        units: 'metric',
        displayMeasurements: true,
        timerNotification: true,
        timerSound: 'Sound 1',
        motivationalPhrases: true,
        appearance: 'dark',
        language: 'English',
        dataSharing: false,
    };

    const [settings, setSettings] = useState<Settings>(defaults);

    // ── Load from API first, then fallback to localStorage ─────────────────
    const { data: prefsData } = useQuery({
        queryKey: ['user-preferences'],
        queryFn: async () => {
            try {
                const res = await userApi.get('/me/preferences');
                return res.data?.data ?? res.data ?? null;
            } catch { return null; }
        },
        staleTime: 5 * 60 * 1000,
    });

    useEffect(() => {
        if (prefsData) {
            const merged = { ...defaults, ...prefsData };
            setSettings(merged);
            localStorage.setItem('nf_settings', JSON.stringify(merged));
        } else {
            const saved = localStorage.getItem('nf_settings');
            if (saved) {
                try { setSettings(JSON.parse(saved)); } catch { /* ignore */ }
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefsData]);

    // ── Debounced API sync ─────────────────────────────────────────────────
    const syncToApi = useCallback((updated: Settings) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            try {
                await userApi.put('/me/preferences', updated);
            } catch {
                // silently fallback to localStorage only
            }
        }, 800);
    }, []);

    const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        const updated = { ...settings, [key]: value };
        setSettings(updated);
        localStorage.setItem('nf_settings', JSON.stringify(updated));
        syncToApi(updated);
    };

    const timerSounds = ['Sound 1', 'Sound 2', 'Sound 3', 'Vibrate', 'Silent'];
    const languages = ['English', 'Arabic', 'Urdu', 'German', 'French', 'Spanish', 'Turkish'];
    const appearances: { value: Settings['appearance']; label: string; icon: any }[] = [
        { value: 'light', label: 'Light', icon: Sun },
        { value: 'dark', label: 'Dark', icon: Moon },
        { value: 'system', label: 'System', icon: Monitor },
    ];

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-2xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="bg-white/5 hover:bg-white/10 text-white rounded-xl">
                        <ChevronLeft size={20} />
                    </Button>
                    <h1 className="text-2xl font-bold text-white">Settings</h1>
                </div>

                {/* Profile Settings */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wider">Profile settings</h2>
                    <button
                        onClick={() => {
                            updateSetting('units', settings.units === 'metric' ? 'imperial' : 'metric');
                        }}
                        className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/[0.08] transition"
                    >
                        <div className="flex items-center gap-3">
                            <Ruler size={18} className="text-zinc-400" />
                            <span className="text-white text-sm font-medium">Set units</span>
                        </div>
                        <span className="text-zinc-400 text-sm capitalize">{settings.units}</span>
                    </button>
                </section>

                {/* Privacy */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wider">Privacy</h2>
                    <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
                        <div className="flex items-center gap-3">
                            <Eye size={18} className="text-zinc-400" />
                            <span className="text-white text-sm font-medium">Display my measurements everywhere</span>
                        </div>
                        <Toggle checked={settings.displayMeasurements} onChange={v => updateSetting('displayMeasurements', v)} />
                    </div>
                </section>

                {/* Push Notifications */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wider">Push notifications</h2>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
                            <div className="flex items-center gap-3">
                                <Bell size={18} className="text-zinc-400" />
                                <span className="text-white text-sm font-medium">On timer expiration</span>
                            </div>
                            <Toggle checked={settings.timerNotification} onChange={v => updateSetting('timerNotification', v)} />
                        </div>

                        <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
                            <div className="flex items-center gap-3">
                                <Volume2 size={18} className="text-zinc-400" />
                                <span className="text-white text-sm font-medium">Timer sound</span>
                            </div>
                            <select
                                value={settings.timerSound}
                                onChange={e => updateSetting('timerSound', e.target.value)}
                                className="bg-transparent text-zinc-400 text-sm outline-none cursor-pointer"
                            >
                                {timerSounds.map(s => (
                                    <option key={s} value={s} className="bg-zinc-900 text-white">{s}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>

                {/* Other */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-brand-400 uppercase tracking-wider">Other</h2>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
                            <div className="flex items-center gap-3">
                                <Share2 size={18} className="text-zinc-400" />
                                <span className="text-white text-sm font-medium">Data sharing</span>
                            </div>
                            <Toggle checked={settings.dataSharing} onChange={v => updateSetting('dataSharing', v)} />
                        </div>

                        <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
                            <div className="flex items-center gap-3">
                                <Heart size={18} className="text-zinc-400" />
                                <span className="text-white text-sm font-medium">Motivational phrases</span>
                            </div>
                            <Toggle checked={settings.motivationalPhrases} onChange={v => updateSetting('motivationalPhrases', v)} />
                        </div>

                        {/* Appearance */}
                        <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-3">
                            <div className="flex items-center gap-3">
                                <Palette size={18} className="text-zinc-400" />
                                <span className="text-white text-sm font-medium">Appearance</span>
                            </div>
                            <div className="flex gap-2 pl-8">
                                {appearances.map(({ value, label, icon: Icon }) => (
                                    <button
                                        key={value}
                                        onClick={() => updateSetting('appearance', value)}
                                        className={cn(
                                            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border',
                                            settings.appearance === value
                                                ? 'bg-brand-500/20 border-brand-500/50 text-brand-400'
                                                : 'bg-white/5 border-white/10 text-zinc-500 hover:text-zinc-300'
                                        )}
                                    >
                                        <Icon size={14} />
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Language */}
                        <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
                            <div className="flex items-center gap-3">
                                <Globe2 size={18} className="text-zinc-400" />
                                <span className="text-white text-sm font-medium">Application language</span>
                            </div>
                            <select
                                value={settings.language}
                                onChange={e => updateSetting('language', e.target.value)}
                                className="bg-transparent text-zinc-400 text-sm outline-none cursor-pointer"
                            >
                                {languages.map(l => (
                                    <option key={l} value={l} className="bg-zinc-900 text-white">{l}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
