'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { sleepApi } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Moon,
    Timer,
    Star,
    ChevronLeft,
    Zap,
    Wind,
    Sun
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function LogSleepPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [quality, setQuality] = useState(7);
    const [notes, setNotes] = useState('');

    const mutation = useMutation({
        mutationFn: (data: any) => sleepApi.post('', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sleep'] });
            toast.success('Sleep session logged!');
            router.push('/dashboard');
        },
        onError: (e) => {
            console.error(e);
            toast.error('Failed to log sleep');
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!startTime || !endTime) return toast.error('Check your sleep times');

        // Simple heuristic: if endTime < startTime, it was an overnight sleep
        const start = new Date(startTime);
        const end = new Date(endTime);

        mutation.mutate({
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            quality,
            notes,
        });
    };

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8 relative">
            <div className="max-w-2xl mx-auto space-y-8">
                <header className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        className="bg-white/5 hover:bg-white/10 text-white rounded-xl"
                    >
                        <ChevronLeft size={20} />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            <Moon className="text-brand-500" /> Log Sleep
                        </h1>
                        <p className="text-zinc-400">Track recovery and circadian alignment.</p>
                    </div>
                </header>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <Card className="glass-card overflow-hidden border-white/5">
                        <CardHeader className="bg-brand-500/10 border-b border-white/5">
                            <CardTitle className="text-sm font-semibold text-brand-400">Recovery Metrics</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                        <Wind size={14} className="text-blue-400" /> In Bed (Start)
                                    </label>
                                    <Input
                                        type="datetime-local"
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        className="bg-white/5 border-white/10 text-white"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                        <Sun size={14} className="text-orange-400" /> Wake Up (End)
                                    </label>
                                    <Input
                                        type="datetime-local"
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        className="bg-white/5 border-white/10 text-white"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                                    <span>Sleep Quality ({quality}/10)</span>
                                    <Star size={14} className="text-yellow-500" />
                                </label>
                                <input
                                    type="range"
                                    min="1"
                                    max="10"
                                    value={quality}
                                    onChange={(e) => setQuality(parseInt(e.target.value))}
                                    className="w-full accent-brand-500 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                                    <span>Exhausted</span>
                                    <span>Perfect</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest pl-1">Notes (Substances, Environment)</label>
                                <textarea
                                    placeholder="e.g. Took 3mg Melatonin, blackout curtains used."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-500 outline-none h-32 resize-none"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Button
                        type="submit"
                        disabled={mutation.isPending}
                        className="w-full py-6 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl shadow-xl shadow-brand-500/20 text-lg font-bold transition-all"
                    >
                        {mutation.isPending ? 'Syncing Recovery...' : 'Log Session'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
