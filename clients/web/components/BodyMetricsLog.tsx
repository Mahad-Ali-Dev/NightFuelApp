'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { progressApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Scale, Ruler, TrendingUp, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export function BodyMetricsLog() {
    const queryClient = useQueryClient();
    const [weight, setWeight] = useState<string>('');
    const [bodyFat, setBodyFat] = useState<string>('');
    const [muscleMass, setMuscleMass] = useState<string>('');
    const [waist, setWaist] = useState<string>('');
    const [chest, setChest] = useState<string>('');
    const [hips, setHips] = useState<string>('');
    const [arms, setArms] = useState<string>('');
    const [thighs, setThighs] = useState<string>('');
    const [calves, setCalves] = useState<string>('');

    const mutation = useMutation({
        mutationFn: (data: any) => progressApi.post('/metrics', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['progress-stats'] });
            queryClient.invalidateQueries({ queryKey: ['progress-history'] });
            toast.success('Body metrics logged!');
            setWeight('');
            setBodyFat('');
            setMuscleMass('');
            setWaist('');
            setChest('');
            setHips('');
            setArms('');
            setThighs('');
            setCalves('');
        },
        onError: (err: any) => {
            console.error(err);
            toast.error('Failed to log metrics');
        },
    });

    const isPending = mutation.isPending;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const data: any = {};
        if (weight) data.weightKg = parseFloat(weight);
        if (bodyFat) data.bodyFatPct = parseFloat(bodyFat);
        if (muscleMass) data.muscleMassKg = parseFloat(muscleMass);
        if (waist) data.waistCm = parseFloat(waist);
        if (chest) data.chestCm = parseFloat(chest);
        if (hips) data.hipsCm = parseFloat(hips);
        if (arms) data.armsCm = parseFloat(arms);
        if (thighs) data.thighsCm = parseFloat(thighs);
        if (calves) data.calvesCm = parseFloat(calves);

        if (Object.keys(data).length === 0) {
            return toast.error('Please enter at least one metric');
        }

        mutation.mutate(data);
    };

    return (
        <Card className="glass-card overflow-hidden">
            <CardHeader className="bg-brand-500/10 border-b border-white/5">
                <CardTitle className="text-white text-lg flex items-center gap-2">
                    <Scale className="h-5 w-5 text-brand-400" /> Log Body Metrics
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest pl-1">Weight (kg)</label>
                            <div className="relative">
                                <Scale className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                                <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="00.0"
                                    value={weight}
                                    onChange={(e) => setWeight(e.target.value)}
                                    className="pl-10 bg-white/5 border-white/10 text-white focus:border-brand-500"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest pl-1">Body Fat %</label>
                            <div className="relative">
                                <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                                <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="0.0"
                                    value={bodyFat}
                                    onChange={(e) => setBodyFat(e.target.value)}
                                    className="pl-10 bg-white/5 border-white/10 text-white focus:border-brand-500"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest pl-1">Muscle Mass (kg)</label>
                            <div className="relative">
                                <Save className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                                <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="00.0"
                                    value={muscleMass}
                                    onChange={(e) => setMuscleMass(e.target.value)}
                                    className="pl-10 bg-white/5 border-white/10 text-white focus:border-brand-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4 border-t border-white/5">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest pl-1">Waist (cm)</label>
                            <div className="relative">
                                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                                <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="00.0"
                                    value={waist}
                                    onChange={(e) => setWaist(e.target.value)}
                                    className="pl-10 bg-white/5 border-white/10 text-white focus:border-brand-500"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest pl-1">Chest (cm)</label>
                            <div className="relative">
                                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                                <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="00.0"
                                    value={chest}
                                    onChange={(e) => setChest(e.target.value)}
                                    className="pl-10 bg-white/5 border-white/10 text-white focus:border-brand-500"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest pl-1">Hips (cm)</label>
                            <div className="relative">
                                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                                <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="00.0"
                                    value={hips}
                                    onChange={(e) => setHips(e.target.value)}
                                    className="pl-10 bg-white/5 border-white/10 text-white focus:border-brand-500"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest pl-1">Arms (cm)</label>
                            <div className="relative">
                                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                                <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="00.0"
                                    value={arms}
                                    onChange={(e) => setArms(e.target.value)}
                                    className="pl-10 bg-white/5 border-white/10 text-white focus:border-brand-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest pl-1">Thighs (cm)</label>
                            <div className="relative">
                                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                                <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="00.0"
                                    value={thighs}
                                    onChange={(e) => setThighs(e.target.value)}
                                    className="pl-10 bg-white/5 border-white/10 text-white focus:border-brand-500"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest pl-1">Calves (cm)</label>
                            <div className="relative">
                                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                                <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="00.0"
                                    value={calves}
                                    onChange={(e) => setCalves(e.target.value)}
                                    className="pl-10 bg-white/5 border-white/10 text-white focus:border-brand-500"
                                />
                            </div>
                        </div>
                    </div>

                    <Button
                        type="submit"
                        disabled={isPending}
                        className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-6 rounded-xl transition-all shadow-lg shadow-brand-500/20"
                    >
                        {isPending ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            'Save Metrics'
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
