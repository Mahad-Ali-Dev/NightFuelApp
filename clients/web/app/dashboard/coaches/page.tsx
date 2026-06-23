'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { getCoachDirectory, enrollAsCoach, bookCoachSession } from '@/lib/api';
import {
    ChevronLeft, Users, Star, Award, Search,
    Filter, MessageCircle, MapPin,
    Dumbbell, Apple, DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface CoachProfile {
    id: string;
    userId: string;
    specialty: string;
    bio: string;
    hourlyRate: number;
    rating: number;
    active: boolean;
}

export default function CoachesDirectoryPage() {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [isProcessing, setIsProcessing] = useState(false);

    const handleOnboard = async () => {
        try {
            setIsProcessing(true);
            const { data } = await enrollAsCoach();
            if (data?.onboardingUrl) {
                window.location.href = data.onboardingUrl;
            }
        } catch (err) {
            console.error('Failed to start onboarding', err);
            alert('Failed to start Stripe onboarding. Please try again later.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCheckout = async (coachId: string, amount: number) => {
        try {
            setIsProcessing(true);
            const { data } = await bookCoachSession(coachId, amount);
            if (data?.checkoutUrl) {
                window.location.href = data.checkoutUrl;
            }
        } catch (err: any) {
            console.error('Failed to start checkout', err);
            alert(err.response?.data?.error || 'Failed to initialize checkout. The coach may not have set up payments yet.');
        } finally {
            setIsProcessing(false);
        }
    };

    const { data: dbCoaches = [], isLoading } = useQuery({
        queryKey: ['coachesDirectory'],
        queryFn: async () => {
            const { data } = await getCoachDirectory();
            return data;
        }
    });

    const coaches = (dbCoaches || []).map((c: any) => ({
        id: c.id,
        name: c.bio?.split(' ')[0] || 'Coach',
        avatar: (c.bio?.split(' ')[0] || 'C').substring(0, 2).toUpperCase(),
        specialty: [c.specialty].filter(Boolean),
        rating: c.rating ?? 0,
        reviews: 0,
        location: 'Online',
        price: c.hourlyRate ? `$${c.hourlyRate}/mo` : 'Contact',
        bio: c.bio || 'No bio provided',
        isPro: true,
        available: c.active ?? true,
    }));

    const CATEGORIES = ['All', 'Strength', 'Nutrition', 'Hypertrophy', 'Endurance', 'Rehab'];

    const filteredCoaches = coaches.filter((c: any) => {
        const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
            c.specialty.some((s: string) => s.toLowerCase().includes(search.toLowerCase()));
        const matchesCategory = selectedCategory === 'All' || c.specialty.includes(selectedCategory);
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => router.back()} className="bg-white/5 hover:bg-white/10 text-white rounded-xl">
                            <ChevronLeft size={20} />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-black text-white flex items-center gap-3">
                                <Users className="text-brand-500" /> Coach Directory
                            </h1>
                            <p className="text-neutral-400 text-sm mt-0.5">Find the perfect expert to reach your goals</p>
                        </div>
                    </div>
                    <Button
                        onClick={handleOnboard}
                        disabled={isProcessing}
                        className="bg-brand-500 hover:bg-brand-600 text-background rounded-xl font-bold"
                    >
                        <DollarSign size={16} className="mr-2" />
                        Become a Coach
                    </Button>
                </header>

                {/* Filters */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white/[0.02] p-2 rounded-2xl border border-white/[0.04]">
                    {/* Search */}
                    <div className="relative w-full md:w-72">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <Input
                            placeholder="Search by name or specialty..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-white/5 border-white/10 text-white pl-9 rounded-xl text-sm"
                        />
                    </div>

                    {/* Categories */}
                    <div className="flex gap-2 overflow-x-auto w-full md:w-auto custom-scrollbar pb-1 md:pb-0">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={cn(
                                    'px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border',
                                    selectedCategory === cat
                                        ? 'bg-brand-500 text-background border-brand-500/50 shadow-lg shadow-brand-500/20'
                                        : 'bg-white/5 text-neutral-400 border-white/10 hover:bg-white/10'
                                )}
                            >
                                {cat}
                            </button>
                        ))}
                        <Button variant="ghost" size="icon" className="shrink-0 bg-white/5 text-neutral-400 hover:text-white rounded-xl">
                            <Filter size={16} />
                        </Button>
                    </div>
                </div>

                {/* Grid */}
                {isLoading ? (
                    <div className="text-center py-20 text-neutral-500">Loading coaches...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6">
                        <AnimatePresence mode="popLayout">
                            {filteredCoaches.map((coach: any, i: number) => (
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.2 }}
                                    key={coach.id}
                                    className="glass-card rounded-2xl border-white/[0.04] p-5 md:p-6 group hover:border-white/10 transition-colors"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex gap-4 items-center">
                                            <div className="w-16 h-16 rounded-2xl bg-neutral-800 text-white font-black text-xl flex items-center justify-center border border-white/10 shadow-lg relative overflow-hidden">
                                                <div className="absolute inset-0 bg-gradient-to-br from-brand-500/20 to-transparent"></div>
                                                <span className="relative z-10">{coach.avatar}</span>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-white font-black text-lg">{coach.name}</h3>
                                                    {coach.isPro && (
                                                        <span className="bg-amber-500/20 text-amber-400 text-[9px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-widest flex items-center gap-1">
                                                            <Award size={10} /> Certified
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1 font-medium">
                                                    <span className="flex items-center gap-1">
                                                        <Star size={12} className="text-amber-400 fill-amber-400" />
                                                        <span className="text-white font-bold">{coach.rating}</span>
                                                        ({coach.reviews})
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <MapPin size={12} /> {coach.location}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Specialities */}
                                    <div className="flex gap-2 mb-4">
                                        {coach.specialty.map((spec: string) => (
                                            <span key={spec} className="flex items-center gap-1 text-[10px] font-bold text-neutral-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg">
                                                {spec === 'Nutrition' ? <Apple size={10} /> : <Dumbbell size={10} />}
                                                {spec}
                                            </span>
                                        ))}
                                    </div>

                                    <p className="text-sm text-neutral-400 leading-relaxed mb-6 line-clamp-2">
                                        "{coach.bio}"
                                    </p>

                                    <div className="flex items-center gap-4 pt-4 border-t border-white/[0.04]">
                                        <div className="flex-1">
                                            <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-0.5">Starting at</p>
                                            <p className="text-brand-400 font-black text-lg">{coach.price}</p>
                                        </div>

                                        <Link href={`/dashboard/coaches/chat?coach=${coach.id}`}>
                                            <Button
                                                variant="ghost"
                                                className="bg-white/5 hover:bg-brand-500/20 text-neutral-300 hover:text-brand-400 rounded-xl px-3"
                                            >
                                                <MessageCircle size={18} />
                                            </Button>
                                        </Link>

                                        <Button
                                            onClick={() => handleCheckout(coach.id, parseInt(coach.price.replace(/[^0-9]/g, ''), 10) * 100 || 5000)}
                                            disabled={!coach.available || isProcessing}
                                            className={cn(
                                                "rounded-xl font-bold transition-all px-6",
                                                coach.available
                                                    ? "bg-white text-black hover:bg-brand-500 hover:text-background"
                                                    : "bg-white/5 text-neutral-500 cursor-not-allowed"
                                            )}
                                        >
                                            {coach.available ? 'Book Session' : 'Waitlist Full'}
                                        </Button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}

                {!isLoading && coaches.length === 0 && (
                    <div className="text-center py-20 px-4 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                        <Users size={48} className="mx-auto text-neutral-700 mb-4" />
                        <h3 className="text-white font-bold text-lg">No Coaches Yet</h3>
                        <p className="text-neutral-500 text-sm mt-2 max-w-sm mx-auto">
                            No coaches have registered yet. Be the first to join as a coach!
                        </p>
                    </div>
                )}

                {coaches.length > 0 && filteredCoaches.length === 0 && (
                    <div className="text-center py-20 px-4 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                        <Search size={48} className="mx-auto text-neutral-700 mb-4" />
                        <h3 className="text-white font-bold text-lg">No Coaches Found</h3>
                        <p className="text-neutral-500 text-sm mt-2 max-w-sm mx-auto">
                            Try adjusting your search criteria or clear your filters to see more results.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
