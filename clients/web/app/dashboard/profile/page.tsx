'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { userApi, updateMyProfile, getUserCommunityPosts, updateCommunityPost, deleteCommunityPost } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User as UserIcon, Camera, MapPin, Calendar, Briefcase,
    Dumbbell, Target, Building2, Edit3, Save, X, ImagePlus,
    ChevronLeft, Heart, MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = ['Photo', 'Info', 'Feed'] as const;
type Tab = typeof TABS[number];

interface UserProfile {
    displayName: string;
    avatarUrl?: string;
    age?: number;
    location?: string;
    aboutMe?: string;
    occupation?: string;
    trainingExperience?: string;
    gym?: string;
    sportGoal?: string;
    photos?: string[];
    posts?: any[];
}

export default function ProfilePage() {
    const router = useRouter();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<Tab>('Photo');
    const [isEditing, setIsEditing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const avatarInputRef = useRef<HTMLInputElement>(null);

    // Load profile from API + localStorage extras
    const { data: apiProfile, isPending: profileLoading } = useQuery({
        queryKey: ['profile'],
        queryFn: async () => {
            try {
                const res = await userApi.get('/me');
                return res.data;
            } catch { return null; }
        },
    });

    // Mutation to persist profile changes to the API
    const updateProfileMutation = useMutation({
        mutationFn: (updates: Partial<UserProfile>) => updateMyProfile(updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profile'] });
        },
    });

    const [localProfile, setLocalProfile] = useState<UserProfile>({
        displayName: '',
        photos: [],
        posts: [],
    });

    useEffect(() => {
        const saved = localStorage.getItem('nf_profile_extra');
        const extra = saved ? JSON.parse(saved) : {};
        setLocalProfile({
            displayName: apiProfile?.displayName || user?.email?.split('@')[0] || 'User',
            avatarUrl: extra.avatarUrl || apiProfile?.avatarUrl || '',
            age: extra.age || 0,
            location: extra.location || apiProfile?.timezone || '',
            aboutMe: extra.aboutMe || '',
            occupation: extra.occupation || '',
            trainingExperience: extra.trainingExperience || '',
            gym: extra.gym || '',
            sportGoal: extra.sportGoal || '',
            photos: extra.photos || [],
            posts: extra.posts || [],
        });
    }, [apiProfile, user]);

    const saveProfile = (updates: Partial<UserProfile>) => {
        const updated = { ...localProfile, ...updates };
        setLocalProfile(updated);
        // Save to localStorage as fallback
        localStorage.setItem('nf_profile_extra', JSON.stringify(updated));
        // Also persist to API
        updateProfileMutation.mutate(updates, {
            onSuccess: () => toast.success('Profile saved!'),
            onError: () => toast.success('Profile saved locally'),
        });
    };

    // Avatar upload via file
    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            saveProfile({ avatarUrl: reader.result as string });
        };
        reader.readAsDataURL(file);
    };

    // Photo upload
    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const photos = [...(localProfile.photos || []), reader.result as string];
            saveProfile({ photos });
        };
        reader.readAsDataURL(file);
    };

    const removePhoto = (index: number) => {
        const photos = (localProfile.photos || []).filter((_, i) => i !== index);
        saveProfile({ photos });
    };

    // Edit form state
    const [editForm, setEditForm] = useState<Partial<UserProfile>>({});

    const startEditing = () => {
        setEditForm({
            aboutMe: localProfile.aboutMe,
            occupation: localProfile.occupation,
            trainingExperience: localProfile.trainingExperience,
            gym: localProfile.gym,
            sportGoal: localProfile.sportGoal,
            age: localProfile.age,
            location: localProfile.location,
        });
        setIsEditing(true);
    };

    const [editingPostId, setEditingPostId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    const { data: userPosts = [], isLoading: postsLoading } = useQuery({
        queryKey: ['userPosts', 'me'],
        queryFn: async () => {
            const { data } = await getUserCommunityPosts('me');
            return data;
        },
        enabled: activeTab === 'Feed',
    });

    const deleteMutation = useMutation({
        mutationFn: (postId: string) => deleteCommunityPost(postId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['userPosts', 'me'] })
    });

    const updatePostMutation = useMutation({
        mutationFn: ({ postId, content }: { postId: string, content: string }) => updateCommunityPost(postId, content),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['userPosts', 'me'] });
            setEditingPostId(null);
        }
    });

    const handleDeletePost = (postId: string) => {
        if (confirm('Are you sure you want to delete this post?')) {
            deleteMutation.mutate(postId);
        }
    };

    const saveEdits = () => {
        saveProfile(editForm);
        setIsEditing(false);
    };

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-2xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        className="bg-white/5 hover:bg-white/10 text-white rounded-xl"
                    >
                        <ChevronLeft size={20} />
                    </Button>
                    <h1 className="text-2xl font-bold text-white">Profile</h1>
                    <div className="flex-1" />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => isEditing ? saveEdits() : startEditing()}
                        className="bg-white/5 hover:bg-white/10 text-white rounded-xl"
                    >
                        {isEditing ? <Save size={18} /> : <Edit3 size={18} />}
                    </Button>
                </div>

                {/* Profile Header Card */}
                <div className="flex flex-col items-center py-8">
                    {profileLoading ? (
                        /* Loading skeleton while API profile is fetching */
                        <div className="flex flex-col items-center animate-pulse">
                            <div className="h-28 w-28 rounded-full bg-white/10 mb-4" />
                            <div className="h-5 w-36 bg-white/10 rounded mb-2" />
                            <div className="h-4 w-48 bg-white/10 rounded" />
                            <div className="flex gap-3 mt-6">
                                {TABS.map(tab => (
                                    <div key={tab} className="h-9 w-20 bg-white/10 rounded-full" />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Avatar */}
                            <div className="relative group mb-4">
                                <div className="h-28 w-28 rounded-full bg-white/5 border-2 border-brand-500/30 flex items-center justify-center overflow-hidden">
                                    {localProfile.avatarUrl ? (
                                        <img src={localProfile.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                                    ) : (
                                        <UserIcon className="h-14 w-14 text-neutral-500" />
                                    )}
                                </div>
                                <button
                                    onClick={() => avatarInputRef.current?.click()}
                                    className="absolute bottom-1 right-1 p-2 bg-brand-500 rounded-full text-white shadow-lg hover:bg-brand-600 transition-colors"
                                >
                                    <Camera className="h-4 w-4" />
                                </button>
                                <input
                                    ref={avatarInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleAvatarUpload}
                                    className="hidden"
                                />
                            </div>

                            {/* Name & Location */}
                            <h2 className="text-xl font-bold text-brand-400">{localProfile.displayName}</h2>
                            <p className="text-sm text-zinc-400 mt-1">
                                {localProfile.age ? `${localProfile.age} years old` : ''}
                                {localProfile.age && localProfile.location ? ', ' : ''}
                                {localProfile.location || ''}
                            </p>

                            {/* Tabs */}
                            <div className="flex gap-3 mt-6">
                                {TABS.map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={cn(
                                            'px-6 py-2 rounded-full text-sm font-semibold transition-all border',
                                            activeTab === tab
                                                ? 'bg-white/10 border-white/20 text-white'
                                                : 'border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10'
                                        )}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Tab Content */}
                <AnimatePresence mode="wait">
                    {activeTab === 'Photo' && (
                        <motion.div
                            key="photo"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-4"
                        >
                            {(!localProfile.photos || localProfile.photos.length === 0) ? (
                                <div className="flex flex-col items-center py-16 text-zinc-500">
                                    <Camera className="h-16 w-16 mb-4 opacity-30" />
                                    <p className="text-sm">This user hasn&apos;t added photos yet.</p>
                                    <Button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="mt-4 bg-brand-500 hover:bg-brand-600"
                                    >
                                        <ImagePlus className="h-4 w-4 mr-2" /> Add Photo
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-3 gap-2">
                                        {localProfile.photos.map((photo, i) => (
                                            <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
                                                <img src={photo} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                                                <button
                                                    onClick={() => removePhoto(i)}
                                                    className="absolute top-2 right-2 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <Button
                                        onClick={() => fileInputRef.current?.click()}
                                        variant="outline"
                                        className="w-full border-dashed border-white/10 text-zinc-400 hover:text-white"
                                    >
                                        <ImagePlus className="h-4 w-4 mr-2" /> Add More Photos
                                    </Button>
                                </>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoUpload}
                                className="hidden"
                            />
                        </motion.div>
                    )}

                    {activeTab === 'Info' && (
                        <motion.div
                            key="info"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                        >
                            {[
                                { icon: UserIcon, label: 'About me', key: 'aboutMe' },
                                { icon: Briefcase, label: 'Occupation', key: 'occupation' },
                                { icon: Calendar, label: 'Training experience', key: 'trainingExperience' },
                                { icon: Building2, label: 'Gym', key: 'gym' },
                                { icon: Target, label: 'Sport goal', key: 'sportGoal' },
                            ].map(({ icon: Icon, label, key }) => (
                                <div key={key} className="space-y-2">
                                    <div className="flex items-center gap-3 text-zinc-400">
                                        <Icon size={16} />
                                        <span className="text-sm font-medium">{label}</span>
                                    </div>
                                    {isEditing ? (
                                        <Input
                                            value={(editForm as any)[key] || ''}
                                            onChange={e => setEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                                            className="bg-white/5 border-white/10 text-white"
                                            placeholder={`Enter your ${label.toLowerCase()}...`}
                                        />
                                    ) : (
                                        <p className="text-white text-sm pl-7">
                                            {(localProfile as any)[key] || <span className="text-zinc-600">-</span>}
                                        </p>
                                    )}
                                </div>
                            ))}

                            {isEditing && (
                                <div className="flex gap-3 pt-4">
                                    <Button onClick={saveEdits} className="flex-1 bg-brand-500 hover:bg-brand-600">
                                        <Save size={16} className="mr-2" /> Save Changes
                                    </Button>
                                    <Button onClick={() => setIsEditing(false)} variant="outline" className="border-white/10 text-zinc-400">
                                        Cancel
                                    </Button>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'Feed' && (
                        <motion.div
                            key="feed"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-4"
                        >
                            {postsLoading ? (
                                <div className="text-center py-10 text-neutral-500">Loading posts...</div>
                            ) : userPosts.length === 0 ? (
                                <div className="flex flex-col items-center py-16 text-zinc-500">
                                    <div className="h-16 w-16 border-2 border-zinc-700 rounded-2xl flex items-center justify-center mb-4">
                                        <div className="w-8 h-1 bg-zinc-700 rounded-full mb-1" />
                                    </div>
                                    <p className="text-sm">You haven't posted anything yet.</p>
                                </div>
                            ) : (
                                userPosts.map((post: any) => (
                                    <div key={post.id} className="glass-card p-5 rounded-2xl border-white/[0.04]">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex gap-3 items-center">
                                                <div className="w-10 h-10 rounded-full bg-neutral-800 text-white font-bold flex items-center justify-center border border-white/10 overflow-hidden">
                                                    {localProfile.avatarUrl ? <img src={localProfile.avatarUrl} className="w-full h-full object-cover" /> : localProfile.displayName?.[0]}
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-bold text-sm">{localProfile.displayName}</h3>
                                                    <span className="text-neutral-500 text-xs">{new Date(post.createdAt).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => {
                                                    setEditingPostId(post.id);
                                                    setEditContent(post.content);
                                                }} className="text-neutral-500 hover:text-white p-1 text-xs font-bold transition-colors">Edit</button>
                                                <button onClick={() => handleDeletePost(post.id)} className="text-neutral-500 hover:text-red-400 p-1 text-xs font-bold transition-colors">Delete</button>
                                            </div>
                                        </div>

                                        {editingPostId === post.id ? (
                                            <div className="mb-4">
                                                <textarea
                                                    value={editContent}
                                                    onChange={e => setEditContent(e.target.value)}
                                                    className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-brand-500 mb-2 min-h-[80px]"
                                                />
                                                <div className="flex justify-end gap-2">
                                                    <Button size="sm" variant="ghost" onClick={() => setEditingPostId(null)} className="h-7 text-xs text-neutral-400 hover:text-white">Cancel</Button>
                                                    <Button size="sm" onClick={() => updatePostMutation.mutate({ postId: post.id, content: editContent })} className="h-7 text-xs bg-brand-500 hover:bg-brand-600 text-white px-4">Save</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-neutral-200 text-sm leading-relaxed mb-4 whitespace-pre-wrap">
                                                {post.content}
                                            </p>
                                        )}

                                        {post.imageUrl && (
                                            <div className="rounded-xl overflow-hidden mb-4">
                                                <img src={post.imageUrl} alt="" className="w-full object-cover max-h-96" />
                                            </div>
                                        )}

                                        <div className="flex items-center gap-6 pt-3 border-t border-white/[0.04]">
                                            <button className="flex items-center gap-2 text-xs font-bold text-neutral-500 hover:text-white transition-colors">
                                                <Heart size={16} /> {post._count?.likes || 0}
                                            </button>
                                            <button className="flex items-center gap-2 text-xs font-bold text-neutral-500 hover:text-white transition-colors">
                                                <MessageSquare size={16} /> {post._count?.comments || 0}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
