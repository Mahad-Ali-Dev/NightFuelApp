import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, X, CheckCircle2, Waves, Activity, BookOpen, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function KegelTrainer({ onClose }: { onClose: () => void }) {
    const [view, setView] = useState<'track' | 'session' | 'summary'>('track');
    const [phase, setPhase] = useState<'squeeze' | 'relax'>('squeeze');

    // Timer state
    const [isActive, setIsActive] = useState(false);
    const [timeLeft, setTimeLeft] = useState(8);
    const [repsDone, setRepsDone] = useState(0);
    const totalReps = 10;
    const squeezeDuration = 8;
    const relaxDuration = 4;

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft(prev => prev - 1);
            }, 1000);
        } else if (isActive && timeLeft === 0) {
            if (phase === 'squeeze') {
                setPhase('relax');
                setTimeLeft(relaxDuration);
            } else {
                const newReps = repsDone + 1;
                setRepsDone(newReps);
                if (newReps >= totalReps) {
                    setIsActive(false);
                    setView('summary');
                } else {
                    setPhase('squeeze');
                    setTimeLeft(squeezeDuration);
                }
            }
        }
        return () => clearInterval(interval);
    }, [isActive, timeLeft, phase, repsDone]);

    const handleStartSession = () => {
        setView('session');
        setPhase('squeeze');
        setTimeLeft(squeezeDuration);
        setRepsDone(0);
        setIsActive(true);
    };

    const formatTime = (seconds: number) => {
        return `00:${seconds.toString().padStart(2, '0')}`;
    };

    const circumference = 2 * Math.PI * 120; // r=120
    const currentDuration = phase === 'squeeze' ? squeezeDuration : relaxDuration;
    const progress = timeLeft / currentDuration;
    const strokeDashoffset = circumference - (progress * circumference);

    if (view === 'track') {
        return (
            <div className="fixed inset-0 z-50 bg-black/95 flex flex-col pt-12 pb-6 px-4 sm:px-6">
                <div className="absolute top-6 right-6 z-10">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={onClose}>
                        <X className="h-6 w-6" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto w-full max-w-xl mx-auto space-y-8 no-scrollbar pb-20">
                    <div className="text-center space-y-2">
                        <Waves className="h-10 w-10 text-brand-500 mx-auto" />
                        <h2 className="text-3xl font-bold text-white tracking-tight">Pelvic Floor</h2>
                        <p className="text-neutral-400">Week 1: Build the Foundation</p>
                    </div>

                    <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-brand-500/20 before:to-transparent">

                        {/* Day 1: Educational */}
                        <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-brand-500/20 border border-brand-500/50 shadow-[0_0_15px_-3px_hsl(var(--brand)/0.4)] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10 text-brand-400">
                                <CheckCircle2 className="h-5 w-5" />
                            </div>
                            <Card className="w-[calc(100%-4rem)] md:w-[calc(50%-2rem)] glass-card border-brand-500/30">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <BookOpen className="h-3 w-3 text-brand-400" />
                                            <span className="text-[10px] uppercase tracking-wider text-brand-400 font-bold">Concept</span>
                                        </div>
                                        <h4 className="text-white font-semibold flex items-center gap-2">The PC Muscle</h4>
                                    </div>
                                    <CheckCircle2 className="h-5 w-5 text-brand-500" />
                                </CardContent>
                            </Card>
                        </div>

                        {/* Day 2: Session */}
                        <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-brand-500 shadow-[0_0_20px_-3px_hsl(var(--brand)/0.6)] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10 text-white">
                                <Activity className="h-5 w-5" />
                            </div>
                            <Card className="w-[calc(100%-4rem)] md:w-[calc(50%-2rem)] glass-card cursor-pointer hover:bg-white/5 transition-colors border-white/20" onClick={handleStartSession}>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Waves className="h-3 w-3 text-brand-400" />
                                        <span className="text-[10px] uppercase tracking-wider text-brand-400 font-bold">Today</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="text-white font-semibold">Endurance I</h4>
                                            <span className="text-xs text-neutral-400">2 mins • 10 Rounds</span>
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-neutral-500" />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Day 3: Locked */}
                        <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group opacity-50">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-neutral-900 border border-neutral-700 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10 text-neutral-500">
                                3
                            </div>
                            <Card className="w-[calc(100%-4rem)] md:w-[calc(50%-2rem)] glass-card">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <BookOpen className="h-3 w-3 text-neutral-500" />
                                        <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Test</span>
                                    </div>
                                    <h4 className="text-neutral-300 font-semibold">Squeeze Test</h4>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/80 to-transparent">
                    <Button className="w-full max-w-xl mx-auto flex py-6 bg-brand-500 hover:bg-brand-600 text-white text-lg font-bold shadow-[0_0_20px_-3px_hsl(var(--brand)/0.5)]" onClick={handleStartSession}>
                        Start Today's Session
                    </Button>
                </div>
            </div>
        );
    }

    if (view === 'summary') {
        return (
            <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 text-center">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-6 max-w-sm">
                    <div className="mx-auto w-24 h-24 bg-brand-500/20 rounded-full flex items-center justify-center border border-brand-500/50 shadow-[0_0_30px_hsl(var(--brand)/0.3)]">
                        <CheckCircle2 className="h-12 w-12 text-brand-400" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold text-white mb-2">Session Complete!</h2>
                        <p className="text-neutral-400">You crushed 10 rounds of endurance holds. Great pelvic floor work.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="glass-card p-4 rounded-xl">
                            <p className="text-2xl font-bold text-white">2m</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mt-1">Duration</p>
                        </div>
                        <div className="glass-card p-4 rounded-xl">
                            <p className="text-2xl font-bold text-white">20</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mt-1">Total Expr (XP)</p>
                        </div>
                    </div>
                    <Button className="w-full py-6 bg-brand-500 hover:bg-brand-600 text-white font-bold" onClick={onClose}>
                        Finish
                    </Button>
                </motion.div>
            </div>
        );
    }

    // Session View
    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col pt-12">
            <div className="absolute top-6 left-6 z-10 flex items-center gap-2">
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setView('track')}>
                    <X className="h-6 w-6" />
                </Button>
                <div className="text-sm font-medium text-neutral-400 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                    Endurance I
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center">
                <AnimatePresence mode="wait">
                    <motion.h2
                        key={phase}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`text-4xl font-extrabold tracking-widest uppercase mb-12 ${phase === 'squeeze' ? 'text-brand-400' : 'text-blue-400'}`}
                    >
                        {phase}
                    </motion.h2>
                </AnimatePresence>

                <div className="relative w-72 h-72 flex items-center justify-center">
                    {/* Ripple effects */}
                    {phase === 'squeeze' && isActive && (
                        <>
                            <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} className="absolute inset-0 border-2 border-brand-500/50 rounded-full" />
                            <motion.div animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }} transition={{ repeat: Infinity, duration: 2, delay: 0.2 }} className="absolute inset-0 border-2 border-brand-500/30 rounded-full" />
                        </>
                    )}

                    {/* Progress Circle */}
                    <svg className="w-full h-full transform -rotate-90 pointer-events-none" viewBox="0 0 260 260">
                        <circle cx="130" cy="130" r="120" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                        <motion.circle
                            cx="130" cy="130" r="120" fill="transparent"
                            stroke={phase === 'squeeze' ? "#3b82f6" : "#60a5fa"}
                            strokeWidth="12"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            className="transition-all duration-1000 ease-linear"
                        />
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-6xl font-black text-white font-mono tabular-nums">{formatTime(timeLeft)}</span>
                    </div>
                </div>

                <div className="mt-16 text-center">
                    <p className="text-neutral-500 font-medium uppercase tracking-widest text-sm mb-4">Round {repsDone + 1} of {totalReps}</p>
                    <div className="flex items-center justify-center gap-2">
                        {Array.from({ length: totalReps }).map((_, i) => (
                            <div key={i} className={`h-1.5 rounded-full transition-all ${i < repsDone ? 'w-4 bg-brand-500' :
                                    i === repsDone ? 'w-6 bg-white' : 'w-2 bg-white/20'
                                }`} />
                        ))}
                    </div>
                </div>
            </div>

            <div className="p-8 flex items-center justify-center bg-gradient-to-t from-brand-950/20 to-transparent">
                <Button
                    variant="outline"
                    size="icon"
                    className="h-16 w-16 rounded-full border-2 border-white text-white hover:bg-white hover:text-black transition-colors"
                    onClick={() => setIsActive(!isActive)}
                >
                    {isActive ? <Pause className="h-6 w-6 ml-0.5" /> : <Play className="h-6 w-6 ml-1" />}
                </Button>
            </div>
        </div>
    );
}
