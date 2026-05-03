'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useParams } from 'next/navigation';
import { shiftApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { Clock, MapPin, Coffee } from 'lucide-react';
import useSWR from 'swr';

const SHIFT_TYPES = ['FIXED_NIGHT', 'ROTATING', 'SPLIT', 'IRREGULAR', 'TWELVE_HOUR'] as const;

const updateShiftSchema = z.object({
    shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    startTime: z.string(),
    endTime: z.string(),
    shiftType: z.enum(SHIFT_TYPES),
    isDayOff: z.boolean(),
    commuteMinutes: z.coerce.number().min(0),
});

type UpdateShiftValues = z.infer<typeof updateShiftSchema>;

const fetcher = (url: string) => shiftApi.get(url).then((res) => res.data);

export default function EditShiftPage() {
    const router = useRouter();
    const params = useParams();
    const [error, setError] = useState<string | null>(null);
    const { id } = params;

    const { data: shift, error: fetchError } = useSWR(id ? `/${id}` : null, fetcher);

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<UpdateShiftValues>({
        resolver: zodResolver(updateShiftSchema),
        defaultValues: {
            shiftDate: '',
            startTime: '',
            endTime: '',
            shiftType: 'ROTATING',
            isDayOff: false,
            commuteMinutes: 0
        }
    });

    useEffect(() => {
        if (shift) {
            const start = new Date(shift.startTime);
            const end = new Date(shift.endTime);

            reset({
                shiftDate: shift.shiftDate.split('T')[0],
                startTime: start.toTimeString().slice(0, 5),
                endTime: end.toTimeString().slice(0, 5),
                shiftType: shift.shiftType as any,
                isDayOff: shift.isDayOff,
                commuteMinutes: shift.commuteMinutes
            });
        }
    }, [shift, reset]);

    const onSubmit = async (data: UpdateShiftValues) => {
        try {
            setError(null);

            const startDateTime = new Date(`${data.shiftDate}T${data.startTime}`);
            const endDateTime = new Date(`${data.shiftDate}T${data.endTime}`);

            if (endDateTime < startDateTime) {
                endDateTime.setDate(endDateTime.getDate() + 1);
            }

            const payload = {
                ...data,
                startTime: startDateTime.toISOString(),
                endTime: endDateTime.toISOString(),
            };

            await shiftApi.put(`/${id}`, payload);
            router.push('/dashboard');
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.error || 'Failed to update shift');
        }
    };

    if (fetchError) return (
        <div className="flex min-h-screen items-center justify-center bg-transparent p-4 relative z-10">
            <div className="glass-card p-8 border-red-500/20 text-red-500">Failed to load shift</div>
        </div>
    );

    if (!shift) return (
        <div className="flex min-h-screen items-center justify-center bg-transparent p-4 relative z-10">
            <div className="text-white/50 animate-pulse">Loading shift data...</div>
        </div>
    );

    return (
        <div className="flex min-h-screen items-center justify-center bg-transparent p-4 relative z-10">
            {/* Background elements */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[10%] left-[20%] w-[40%] h-[40%] bg-brand-500/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[20%] right-[10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="w-full max-w-md relative z-10"
            >
                <Card className="glass-card border-white/5 bg-black/40 shadow-2xl">
                    <CardHeader className="space-y-1 text-center border-b border-white/5 pb-6">
                        <div className="mx-auto bg-brand-500/20 p-3 rounded-full w-fit mb-2">
                            <Clock className="h-6 w-6 text-brand-400" />
                        </div>
                        <CardTitle className="text-2xl font-bold text-white tracking-tight">Edit Shift</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

                            <div className="space-y-2">
                                <Label htmlFor="shiftDate">Date</Label>
                                <Input id="shiftDate" type="date" {...register('shiftDate')} />
                                {errors.shiftDate && <p className="text-sm text-red-500">{errors.shiftDate.message}</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="startTime">Start Time</Label>
                                    <Input id="startTime" type="time" {...register('startTime')} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="endTime">End Time</Label>
                                    <Input id="endTime" type="time" {...register('endTime')} />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="shiftType" className="text-neutral-300">Type</Label>
                                <select
                                    id="shiftType"
                                    className="flex h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    {...register('shiftType')}
                                >
                                    {SHIFT_TYPES.map((type) => (
                                        <option key={type} value={type} className="bg-neutral-900 text-white">{type.replace('_', ' ')}</option>
                                    ))}
                                </select>
                                {errors.shiftType && <p className="text-sm text-red-500">{errors.shiftType.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="commuteMinutes" className="flex items-center gap-2 text-neutral-300">
                                    <MapPin className="h-4 w-4 text-neutral-400" /> Commute (minutes)
                                </Label>
                                <Input id="commuteMinutes" type="number" className="bg-white/5 border-white/10 text-white focus-visible:ring-brand-500" {...register('commuteMinutes', { valueAsNumber: true })} />
                                {errors.commuteMinutes && <p className="text-sm text-red-500">{errors.commuteMinutes.message}</p>}
                            </div>

                            <div className="flex items-center space-x-3 p-3 rounded-md bg-white/5 border border-white/10">
                                <input type="checkbox" id="isDayOff" className="h-4 w-4 rounded border-white/20 bg-black text-brand-500 focus:ring-brand-500 focus:ring-offset-neutral-900 cursor-pointer" {...register('isDayOff')} />
                                <Label htmlFor="isDayOff" className="text-neutral-300 cursor-pointer flex items-center gap-2">
                                    <Coffee className="h-4 w-4 text-brand-400" /> Mark as Day Off
                                </Label>
                            </div>

                            {error && <p className="text-sm text-red-500 text-center bg-red-500/10 p-2 rounded">{error}</p>}

                            <div className="flex gap-4 pt-4 border-t border-white/5">
                                <Button type="button" variant="outline" className="w-full bg-transparent border-white/10 text-white hover:bg-white/5" onClick={() => router.back()}>Cancel</Button>
                                <Button type="submit" className="w-full bg-brand-500 text-white hover:bg-brand-600 shadow-[0_0_15px_-3px_hsl(var(--brand)/0.4)]" disabled={isSubmitting}>
                                    {isSubmitting ? 'Updating...' : 'Update Shift'}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}
