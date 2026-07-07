import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Circle, Flame, Plus, Shield, ThermometerSnowflake, Coffee, Smartphone, BedDouble } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CHALLENGE_LIBRARY = [
    { id: 'c1', title: '7 Days Sugar-Free', icon: Shield, color: 'text-rose-500', bg: 'bg-rose-500/10', duration: 7, desc: 'Eliminate all processed sugars to reset insulin sensitivity.' },
    { id: 'c2', title: 'Cold Shower Protocol', icon: ThermometerSnowflake, color: 'text-blue-400', bg: 'bg-blue-400/10', duration: 14, desc: '3 minutes of cold exposure every morning.' },
    { id: 'c3', title: 'Caffeine Curfew', icon: Coffee, color: 'text-amber-500', bg: 'bg-amber-500/10', duration: 10, desc: 'No caffeine after 12:00 PM to maximize slow-wave sleep.' },
    { id: 'c4', title: 'Dopamine Detox', icon: Smartphone, color: 'text-indigo-400', bg: 'bg-indigo-400/10', duration: 5, desc: 'No social media or short-form content.' },
    { id: 'c5', title: 'Early Riser', icon: BedDouble, color: 'text-emerald-400', bg: 'bg-emerald-400/10', duration: 21, desc: 'Wake up at 5:00 AM consistently.' },
];

const HABIT_STORAGE_KEY = 'nightfuel-habit-challenges';

function loadHabitState() {
    if (typeof window === 'undefined') return null;
    try {
        const saved = localStorage.getItem(HABIT_STORAGE_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch { return null; }
}

export function HabitChallenges() {
    const saved = loadHabitState();
    const [activeChallenges, setActiveChallenges] = useState<string[]>(saved?.active ?? []);
    const [progress, setProgress] = useState<Record<string, boolean[]>>(saved?.progress ?? {});

    useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(HABIT_STORAGE_KEY, JSON.stringify({
            active: activeChallenges,
            progress,
        }));
    }, [activeChallenges, progress]);

    const toggleDay = (challengeId: string, dayIndex: number) => {
        setProgress(prev => {
            const currentObj = prev[challengeId] || Array(7).fill(false);
            const newArr = [...currentObj];
            newArr[dayIndex] = !newArr[dayIndex];
            return { ...prev, [challengeId]: newArr };
        });
    };

    const joinChallenge = (id: string, duration: number) => {
        if (!activeChallenges.includes(id)) {
            setActiveChallenges(prev => [...prev, id]);
            setProgress(prev => ({ ...prev, [id]: Array(duration).fill(false) }));
        }
    };

    return (
        <div className="space-y-8">
            {/* Active Challenges Timeline */}
            <div className="space-y-4">
                <h3 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    <Flame className="h-5 w-5 text-orange-500" /> Active Challenges
                </h3>

                {activeChallenges.length === 0 ? (
                    <div className="glass-panel p-8 text-center rounded-2xl border border-dashed border-white/10">
                        <p className="text-neutral-500">Pick a challenge from the library below to start building discipline.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {activeChallenges.map(id => {
                            const c = CHALLENGE_LIBRARY.find(x => x.id === id);
                            if (!c) return null;
                            const currentProgress = progress[id] || Array(c.duration).fill(false);
                            const completedDays = currentProgress.filter(Boolean).length;

                            return (
                                <Card key={id} className="glass-card overflow-hidden">
                                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${c.bg}`}>
                                                <c.icon className={`h-5 w-5 ${c.color}`} />
                                            </div>
                                            <div>
                                                <h4 className="text-lg font-bold text-white leading-tight">{c.title}</h4>
                                                <p className="text-xs text-neutral-400 font-medium">{completedDays} / {c.duration} Days Completed</p>
                                            </div>
                                        </div>
                                    </div>
                                    <CardContent className="p-4 bg-black/20">
                                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                            {currentProgress.map((isDone, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => toggleDay(id, idx)}
                                                    className="flex flex-col items-center gap-1.5 shrink-0 group transition-transform hover:scale-105"
                                                    title={`Day ${idx + 1}`}
                                                >
                                                    <div className={`h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all ${isDone ? `bg-brand-500 border-brand-400 text-background shadow-[0_0_10px_hsl(var(--brand)/0.4)]` :
                                                        `border-white/10 bg-white/5 text-neutral-600 group-hover:border-white/20`
                                                        }`}>
                                                        {isDone ? <CheckCircle2 className="h-5 w-5" /> : <span className="font-mono text-xs font-bold">{idx + 1}</span>}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Challenge Library Grid */}
            <div className="space-y-4 pt-8 border-t border-white/5">
                <h3 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    <Shield className="h-5 w-5 text-neutral-400" /> Challenge Library
                </h3>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {CHALLENGE_LIBRARY.filter(c => !activeChallenges.includes(c.id)).map(c => (
                        <Card key={c.id} className="glass-card flex flex-col hover:bg-white/5 transition-colors group cursor-pointer" onClick={() => joinChallenge(c.id, c.duration)}>
                            <CardContent className="p-5 flex-1 flex flex-col">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${c.bg}`}>
                                        <c.icon className={`h-5 w-5 ${c.color}`} />
                                    </div>
                                    <h4 className="text-md font-bold text-white leading-tight">{c.title}</h4>
                                </div>
                                <p className="text-sm text-neutral-400 mb-6 flex-1">{c.desc}</p>
                                <div className="flex items-center justify-between mt-auto">
                                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                                        {c.duration} Days
                                    </span>
                                    <Button variant="ghost" size="sm" className="text-brand-400 hover:text-white hover:bg-brand-500 group-hover:bg-brand-500 transition-colors h-8">
                                        Join <Plus className="ml-1 h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
