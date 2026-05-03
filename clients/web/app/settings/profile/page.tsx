'use client';

import { useAuth } from '@/context/auth-context';
import { userApi } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Save, User as UserIcon, Camera } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect } from 'react';

const profileSchema = z.object({
    displayName: z.string().min(2, 'Name must be at least 2 characters'),
    avatarUrl: z.string().url().optional().or(z.literal('')),
    timezone: z.string().min(1, 'Timezone is required'),
    locale: z.string().min(2, 'Locale is required'),
    region: z.string().min(2, 'Region is required'),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfilePage() {
    const { user, isAuthenticated } = useAuth();
    const queryClient = useQueryClient();

    const { data: profile, isLoading } = useQuery({
        queryKey: ['profile'],
        queryFn: async () => {
            const res = await userApi.get('/me');
            return res.data;
        },
        enabled: isAuthenticated,
    });

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isDirty },
    } = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            displayName: '',
            avatarUrl: '',
            timezone: 'UTC',
            locale: 'en-US',
            region: 'US',
        },
    });

    useEffect(() => {
        if (profile) {
            reset({
                displayName: profile.displayName || '',
                avatarUrl: profile.avatarUrl || '',
                timezone: profile.timezone || 'UTC',
                locale: profile.locale || 'en-US',
                region: profile.region || 'US',
            });
        }
    }, [profile, reset]);

    const mutation = useMutation({
        mutationFn: async (values: ProfileFormValues) => {
            const res = await userApi.put('/me', values);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profile'] });
            alert('Profile updated successfully!');
        },
        onError: (error: any) => {
            console.error('Update failed:', error);
            alert(error.response?.data?.error || 'Failed to update profile');
        },
    });

    const onSubmit = (values: ProfileFormValues) => {
        mutation.mutate(values);
    };

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-3xl font-bold text-white">Profile Settings</h1>
                <p className="text-neutral-400 mt-1">Manage your identity and regional preferences.</p>
            </header>

            <Card className="glass-card">
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                        <UserIcon className="h-5 w-5 text-brand-500" />
                        Personal Information
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        <div className="flex flex-col md:flex-row gap-8 items-start">
                            {/* Avatar Placeholder */}
                            <div className="relative group">
                                <div className="h-24 w-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                                    {profile?.avatarUrl ? (
                                        <img src={profile.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                                    ) : (
                                        <UserIcon className="h-10 w-10 text-neutral-500" />
                                    )}
                                </div>
                                <button type="button" className="absolute bottom-0 right-0 p-1.5 bg-brand-500 rounded-full text-white shadow-lg hover:bg-brand-600 transition-colors">
                                    <Camera className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="flex-1 grid gap-4 md:grid-cols-2 w-full">
                                <div className="space-y-2">
                                    <Label htmlFor="displayName" className="text-neutral-300">Display Name</Label>
                                    <Input
                                        id="displayName"
                                        placeholder="John Doe"
                                        {...register('displayName')}
                                        className={errors.displayName ? 'border-red-500' : ''}
                                    />
                                    {errors.displayName && (
                                        <p className="text-xs text-red-500">{errors.displayName.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="avatarUrl" className="text-neutral-300">Avatar URL</Label>
                                    <Input
                                        id="avatarUrl"
                                        placeholder="https://example.com/avatar.jpg"
                                        {...register('avatarUrl')}
                                        className={errors.avatarUrl ? 'border-red-500' : ''}
                                    />
                                    {errors.avatarUrl && (
                                        <p className="text-xs text-red-500">{errors.avatarUrl.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="timezone" className="text-neutral-300">Timezone</Label>
                                    <Input
                                        id="timezone"
                                        placeholder="Europe/London"
                                        {...register('timezone')}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="locale" className="text-neutral-300">Locale</Label>
                                    <Input
                                        id="locale"
                                        placeholder="en-GB"
                                        {...register('locale')}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="region" className="text-neutral-300">Region</Label>
                                    <Input
                                        id="region"
                                        placeholder="UK"
                                        {...register('region')}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4 border-t border-white/5">
                            <Button
                                type="submit"
                                disabled={mutation.isPending || !isDirty}
                                className="bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 min-w-[120px]"
                            >
                                {mutation.isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="mr-2 h-4 w-4" />
                                        Save Changes
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
