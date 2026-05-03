'use client';

import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { progressApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Footprints, Plus, Minus, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export function StepTracker() {
    const queryClient = useQueryClient();
    const [steps, setSteps] = useState<number>(0);
    const [isEditing, setIsEditing] = useState(false);

    const { data: today, isLoading } = useQuery({
        queryKey: ['progress-today'],
        queryFn: async () => {
            const res = await progressApi.get('/today');
            return res.data;
        },
    });

    const mutation = useMutation({
        mutationFn: (newSteps: number) => progressApi.post('/steps', { steps: newSteps, source: 'MANUAL' }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['progress-today'] });
            toast.success('Steps updated!');
            setIsEditing(false);
        },
        onError: (err: any) => {
            console.error(err);
            toast.error('Failed to update steps');
        },
    });

    const currentSteps = today?.stepCount || 0;
    const stepTarget = 10000; // Hardcoded default for now
    const progress = Math.min((currentSteps / stepTarget) * 100, 100);

    const handleUpdateSteps = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate(steps);
    };

    if (isLoading) return <div className="h-32 glass-card animate-pulse rounded-2xl" />;

    return (
        <Card className="glass-card overflow-hidden group">
            <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <Footprints className="h-4 w-4 text-brand-500" /> Daily Steps
                    </span>
                    <span className="text-neutral-500 font-normal text-xs">{currentSteps.toLocaleString()} / {stepTarget.toLocaleString()}</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className={`absolute h-full left-0 rounded-full ${progress === 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
                    />
                </div>

                {!isEditing ? (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                            <Smartphone className="h-3 w-3 text-neutral-500" />
                            <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">{today?.source || 'MANUAL'} SOURCE</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSteps(currentSteps);
                                setIsEditing(true);
                            }}
                            className="h-7 text-xs text-brand-400 hover:text-white hover:bg-brand-500/10"
                        >
                            Log Manually
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleUpdateSteps} className="flex gap-2">
                        <Input
                            type="number"
                            value={steps}
                            onChange={(e) => setSteps(parseInt(e.target.value) || 0)}
                            className="h-8 bg-white/5 border-white/10 text-white text-xs"
                            autoFocus
                        />
                        <Button
                            type="submit"
                            size="sm"
                            disabled={mutation.isPending}
                            className="h-8 bg-brand-500 text-white px-3"
                        >
                            {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsEditing(false)}
                            className="h-8 text-neutral-400"
                        >
                            Cancel
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    );
}
