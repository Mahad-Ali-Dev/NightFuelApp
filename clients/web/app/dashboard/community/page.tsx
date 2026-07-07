'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { communityApi, createCommunityPost, deleteCommunityPost, updateCommunityPost } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import {
    Users, Heart, MessageSquare, Share2,
    Flame, Trophy, Crown,
    Image as ImageIcon, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';

function formatTimeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

export default function CommunityFeedPage() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    const [newPostText, setNewPostText] = useState('');
    const [newPostImage, setNewPostImage] = useState<string | null>(null);
    const postImageRef = useRef<HTMLInputElement>(null);
    const [editingPostId, setEditingPostId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    const { data: dbPosts = [], isLoading } = useQuery({
        queryKey: ['communityFeed'],
        queryFn: async () => {
            const { data } = await communityApi.get('/feed');
            return data;
        }
    });

    const { data: leaderboardResponse } = useQuery({
        queryKey: ['communityLeaderboard'],
        queryFn: async () => {
            try {
                const { data } = await communityApi.get('/leaderboard');
                return data;
            } catch (err) {
                return null;
            }
        }
    });

    // Map API posts to display format
    const posts = (dbPosts || []).map((post: any) => ({
        id: post.id,
        authorId: post.authorId,
        user: {
            name: post.author?.displayName || post.authorName || post.authorId.substring(0, 6),
            avatar: post.author?.displayName?.[0] || 'U',
            isPro: false,
        },
        timeAgo: formatTimeAgo(post.createdAt),
        type: 'standard',
        content: post.content,
        imageUrl: post.imageUrl || null,
        stats: null,
        tags: post.tags || [],
        likes: post._count?.likes || post.likes || 0,
        comments: post._count?.comments || 0,
        likedByUser: post.likedByUser || false,
    }));

    const createPostMutation = useMutation({
        mutationFn: (data: { content: string; imageUrl?: string }) => createCommunityPost(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['communityFeed'] });
            setNewPostText('');
            setNewPostImage(null);
        },
    });

    const handlePost = () => {
        if (!newPostText.trim()) return;
        createPostMutation.mutate({
            content: newPostText.trim(),
            ...(newPostImage ? { imageUrl: newPostImage } : {}),
        });
    };

    const likeMutation = useMutation({
        mutationFn: (postId: string) => communityApi.post(`/post/${postId}/like`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communityFeed'] })
    });

    const toggleLike = (id: string) => {
        likeMutation.mutate(id);
    };

    const deleteMutation = useMutation({
        mutationFn: (postId: string) => deleteCommunityPost(postId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communityFeed'] })
    });

    const updateMutation = useMutation({
        mutationFn: ({ postId, content }: { postId: string, content: string }) => updateCommunityPost(postId, content),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['communityFeed'] });
            setEditingPostId(null);
        }
    });

    const handleDelete = (postId: string) => {
        if (confirm('Are you sure you want to delete this post?')) {
            deleteMutation.mutate(postId);
        }
    };

    // Construct leaderboard display data from API only
    const displayLeaderboard = leaderboardResponse?.leaderboard?.length > 0
        ? leaderboardResponse.leaderboard.map((userScore: any, index: number) => ({
            rank: index + 1,
            name: userScore.displayName || `User ${(userScore.userId as string).substring(0, 4)}`,
            score: userScore.xp,
            isUser: userScore.userId === leaderboardResponse.myScore?.userId,
        }))
        : null;

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-6xl mx-auto">

                {/* Header */}
                <header className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-black text-white flex items-center gap-3">
                            <Users className="text-brand-500" /> Community
                        </h1>
                        <p className="text-neutral-400 text-sm mt-0.5">Connect with other Zeitra athletes</p>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/dashboard/community/challenges">
                            <Button className="bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10">
                                <Trophy size={16} className="mr-2 text-amber-400" />
                                Challenges
                            </Button>
                        </Link>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Main Feed */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Post Composer */}
                        <div className="glass-card p-4 rounded-2xl border-white/[0.04]">
                            <div className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-brand-500/20 text-brand-400 font-bold flex items-center justify-center shrink-0">
                                    YOU
                                </div>
                                <div className="flex-1">
                                    <textarea
                                        placeholder="Share your workout, milestone, or meal prep..."
                                        value={newPostText}
                                        onChange={e => setNewPostText(e.target.value)}
                                        className="w-full bg-transparent border-none text-white placeholder-neutral-500 outline-none resize-none h-12 text-sm"
                                    />
                                    {newPostImage && (
                                        <div className="relative mt-2">
                                            <img src={newPostImage} alt="Upload" className="w-full max-h-48 object-cover rounded-xl" />
                                            <button onClick={() => setNewPostImage(null)} className="absolute top-2 right-2 p-1 bg-black/60 rounded-full text-white">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    )}
                                    <input
                                        ref={postImageRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            const reader = new FileReader();
                                            reader.onload = () => setNewPostImage(reader.result as string);
                                            reader.readAsDataURL(file);
                                        }}
                                    />
                                    <div className="flex justify-between items-center mt-2 pt-3 border-t border-white/[0.04]">
                                        <div className="flex gap-2 text-neutral-500">
                                            <button onClick={() => postImageRef.current?.click()} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                                                <ImageIcon size={16} />
                                            </button>
                                            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors"><Flame size={16} /></button>
                                        </div>
                                        <Button
                                            onClick={handlePost}
                                            disabled={!newPostText.trim() || createPostMutation.isPending}
                                            className="bg-brand-500 hover:bg-brand-600 text-background rounded-xl font-bold px-6 py-1 h-8 text-xs disabled:opacity-50"
                                        >
                                            {createPostMutation.isPending ? 'Posting...' : 'Post'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Feed Posts */}
                        {isLoading ? (
                            <div className="text-center py-10 text-neutral-500">Loading feed...</div>
                        ) : posts.length === 0 ? (
                            <div className="glass-card p-10 rounded-2xl border-white/[0.04] text-center">
                                <Users size={40} className="mx-auto text-neutral-600 mb-4" />
                                <p className="text-neutral-400 text-sm font-bold">No posts yet. Be the first to share!</p>
                            </div>
                        ) : posts.map((post: any, i: number) => (
                            <motion.div
                                key={post.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="glass-card p-5 rounded-2xl border-white/[0.04]"
                            >
                                {/* Post Header */}
                                <div className="flex justify-between items-start mb-4">
                                    <Link href={`/dashboard/community/user/${post.authorId}`} className="flex gap-3 items-center group">
                                        <div className="w-10 h-10 rounded-full bg-neutral-800 text-white font-bold flex items-center justify-center border border-white/10 group-hover:border-brand-500 transition-colors">
                                            {post.user.avatar}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-white font-bold text-sm group-hover:text-brand-400 transition-colors">{post.user.name}</h3>
                                                {post.user.isPro && (
                                                    <span className="bg-amber-500/20 text-amber-400 text-[9px] font-black px-1.5 py-0.5 rounded-sm uppercase">PRO</span>
                                                )}
                                            </div>
                                            <span className="text-neutral-500 text-xs">{post.timeAgo}</span>
                                        </div>
                                    </Link>
                                    <div className="flex items-center gap-2">
                                        {user?.id === post.authorId && (
                                            <>
                                                <button onClick={() => {
                                                    setEditingPostId(post.id);
                                                    setEditContent(post.content);
                                                }} className="text-neutral-500 hover:text-white p-1 text-xs font-bold transition-colors">Edit</button>
                                                <button onClick={() => handleDelete(post.id)} className="text-neutral-500 hover:text-red-400 p-1 text-xs font-bold transition-colors">Delete</button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Post Content */}
                                {editingPostId === post.id ? (
                                    <div className="mb-4">
                                        <textarea
                                            value={editContent}
                                            onChange={e => setEditContent(e.target.value)}
                                            className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-brand-500 mb-2 min-h-[80px]"
                                        />
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="ghost" onClick={() => setEditingPostId(null)} className="h-7 text-xs text-neutral-400 hover:text-white">Cancel</Button>
                                            <Button size="sm" onClick={() => updateMutation.mutate({ postId: post.id, content: editContent })} className="h-7 text-xs bg-brand-500 hover:bg-brand-600 text-background px-4">Save</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-neutral-200 text-sm leading-relaxed mb-4 whitespace-pre-wrap">
                                        {post.content}
                                    </p>
                                )}

                                {/* Post Image */}
                                {post.imageUrl && (
                                    <div className="rounded-xl overflow-hidden mb-4">
                                        <img src={post.imageUrl} alt="" className="w-full object-cover max-h-96" />
                                    </div>
                                )}

                                {/* Interactive Stats Card for Workout specific posts */}
                                {post.type === 'workout' && post.stats && (
                                    <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-3 flex gap-6 mb-4">
                                        <div>
                                            <p className="text-[10px] text-brand-400/70 font-bold uppercase tracking-widest">Duration</p>
                                            <p className="text-brand-100 font-bold text-sm">{post.stats.duration}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-brand-400/70 font-bold uppercase tracking-widest">Volume</p>
                                            <p className="text-brand-100 font-bold text-sm">{post.stats.volume}</p>
                                        </div>
                                        {post.stats.prs && (
                                            <div>
                                                <p className="text-[10px] text-brand-400/70 font-bold uppercase tracking-widest">New PRs</p>
                                                <p className="text-brand-100 font-bold text-sm flex items-center gap-1">
                                                    <Trophy size={14} className="text-amber-400" /> {post.stats.prs}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Tags */}
                                {post.tags.length > 0 && (
                                    <div className="flex gap-2 mb-4">
                                        {post.tags.map((tag: string) => (
                                            <span key={tag} className="text-[10px] bg-white/5 text-neutral-400 px-2 py-1 rounded-md">
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-6 pt-3 border-t border-white/[0.04]">
                                    <button
                                        onClick={() => toggleLike(post.id)}
                                        className={cn(
                                            "flex items-center gap-2 text-xs font-bold transition-colors",
                                            post.likedByUser ? "text-brand-500" : "text-neutral-500 hover:text-white"
                                        )}
                                    >
                                        <Heart size={16} fill={post.likedByUser ? "currentColor" : "none"} />
                                        {post.likes}
                                    </button>
                                    <button className="flex items-center gap-2 text-xs font-bold text-neutral-500 hover:text-white transition-colors">
                                        <MessageSquare size={16} /> {post.comments}
                                    </button>
                                    <button className="flex items-center gap-2 text-xs font-bold text-neutral-500 hover:text-white transition-colors ml-auto">
                                        <Share2 size={16} /> Share
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Weekly Leaderboard */}
                        <div className="glass-card p-5 rounded-2xl border-white/[0.04]">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-white font-bold text-sm flex items-center gap-2">
                                    <Crown size={16} className="text-amber-400" /> Weekly Leaderboard
                                </h3>
                            </div>
                            {displayLeaderboard ? (
                                <div className="space-y-3">
                                    {displayLeaderboard.map((user: any) => (
                                        <div
                                            key={user.rank}
                                            className={cn(
                                                "flex items-center justify-between p-2 rounded-xl",
                                                user.isUser ? "bg-brand-500/10 border border-brand-500/20" : "bg-white/[0.02]"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className={cn(
                                                    "w-5 font-black text-xs text-center",
                                                    user.rank === 1 ? 'text-amber-400' :
                                                        user.rank === 2 ? 'text-neutral-300' :
                                                            user.rank === 3 ? 'text-amber-700' : 'text-neutral-500'
                                                )}>
                                                    {user.rank}
                                                </span>
                                                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[8px] text-white font-bold">
                                                    {(user.name as string).split(' ').map((n: string) => n[0]).join('')}
                                                </div>
                                                <span className={cn("text-xs font-bold", user.isUser ? "text-brand-400" : "text-white")}>
                                                    {user.name} {user.isUser && "(You)"}
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-neutral-400 font-bold">{user.score} pts</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-6">
                                    <Trophy size={28} className="mx-auto text-neutral-600 mb-3" />
                                    <p className="text-neutral-500 text-xs font-bold">Leaderboard coming soon</p>
                                </div>
                            )}
                            {displayLeaderboard && (
                                <button className="w-full mt-4 text-[10px] text-brand-400 font-bold uppercase tracking-widest hover:text-brand-300">
                                    View Full Rankings
                                </button>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
