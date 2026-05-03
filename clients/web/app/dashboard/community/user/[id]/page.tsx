'use client';

import { useQuery } from '@tanstack/react-query';
import { getPublicProfile, getUserCommunityPosts } from '@/lib/api';
import {
    User as UserIcon, ChevronLeft, Heart, MessageSquare, Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter, useParams } from 'next/navigation';

export default function PublicProfilePage() {
    const router = useRouter();
    const params = useParams();
    const userId = params.id as string;

    const { data: profile, isLoading: profileLoading } = useQuery({
        queryKey: ['publicProfile', userId],
        queryFn: async () => {
            const { data } = await getPublicProfile(userId);
            return data;
        },
    });

    const { data: userPosts = [], isLoading: postsLoading } = useQuery({
        queryKey: ['userPosts', userId],
        queryFn: async () => {
            const { data } = await getUserCommunityPosts(userId);
            return data;
        },
    });

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
                    <h1 className="text-2xl font-bold text-white">Athlete Profile</h1>
                </div>

                {/* Profile Header Card */}
                <div className="flex flex-col items-center py-8">
                    {profileLoading ? (
                        <div className="flex flex-col items-center animate-pulse">
                            <div className="h-28 w-28 rounded-full bg-white/10 mb-4" />
                            <div className="h-5 w-36 bg-white/10 rounded mb-2" />
                        </div>
                    ) : (
                        <>
                            <div className="h-28 w-28 rounded-full bg-white/5 border-2 border-brand-500/30 flex items-center justify-center overflow-hidden mb-4">
                                {profile?.avatarUrl ? (
                                    <img src={profile.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                                ) : (
                                    <UserIcon className="h-14 w-14 text-neutral-500" />
                                )}
                            </div>
                            <h2 className="text-xl font-bold text-brand-400">{profile?.displayName || 'Unknown Athlete'}</h2>
                            {profile?.timezone && <p className="text-sm text-zinc-400 mt-1">{profile.timezone}</p>}

                            {/* Message Button */}
                            <div className="mt-6 flex gap-3">
                                <Button
                                    onClick={() => router.push(`/dashboard/messages?userId=${userId}`)}
                                    className="bg-brand-500 hover:bg-brand-600 font-bold px-8 rounded-full flex gap-2"
                                >
                                    <Send size={16} /> Message
                                </Button>
                            </div>
                        </>
                    )}
                </div>

                {/* Feed */}
                <h3 className="text-white font-bold text-lg border-b border-white/10 pb-3 mb-4">Recent Posts</h3>

                <div className="space-y-4">
                    {postsLoading ? (
                        <div className="text-center py-10 text-neutral-500">Loading posts...</div>
                    ) : userPosts.length === 0 ? (
                        <div className="flex flex-col items-center py-16 text-zinc-500">
                            <div className="h-16 w-16 border-2 border-zinc-700 rounded-2xl flex items-center justify-center mb-4">
                                <div className="w-8 h-1 bg-zinc-700 rounded-full mb-1" />
                            </div>
                            <p className="text-sm">This user hasn't posted anything yet.</p>
                        </div>
                    ) : (
                        userPosts.map((post: any) => (
                            <div key={post.id} className="glass-card p-5 rounded-2xl border-white/[0.04]">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex gap-3 items-center">
                                        <div className="w-10 h-10 rounded-full bg-neutral-800 text-white font-bold flex items-center justify-center border border-white/10 overflow-hidden">
                                            {profile?.avatarUrl ? <img src={profile.avatarUrl} className="w-full h-full object-cover" /> : profile?.displayName?.[0] || 'U'}
                                        </div>
                                        <div>
                                            <h3 className="text-white font-bold text-sm">{profile?.displayName || 'Unknown'}</h3>
                                            <span className="text-neutral-500 text-xs">{new Date(post.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <p className="text-neutral-200 text-sm leading-relaxed mb-4 whitespace-pre-wrap">
                                    {post.content}
                                </p>

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
                </div>
            </div>
        </div>
    );
}
