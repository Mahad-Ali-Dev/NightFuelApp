'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    ChevronLeft, Search, Apple, Wheat, Beef,
    Egg, Milk, Leaf, Fish, Cookie, Droplets
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface FoodItem {
    id: string;
    name: string;
    brand?: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    imageUrl?: string;
    servingSize: string;
}

const CATEGORIES = [
    { id: 'fruits', label: 'Fruits', icon: Apple, color: 'text-red-400', bg: 'bg-red-500/15', query: 'fruit' },
    { id: 'vegetables', label: 'Vegetables', icon: Leaf, color: 'text-emerald-400', bg: 'bg-emerald-500/15', query: 'vegetable' },
    { id: 'grains', label: 'Grains', icon: Wheat, color: 'text-amber-400', bg: 'bg-amber-500/15', query: 'wheat bread rice' },
    { id: 'protein', label: 'Protein', icon: Beef, color: 'text-orange-400', bg: 'bg-orange-500/15', query: 'chicken beef protein' },
    { id: 'dairy', label: 'Dairy', icon: Milk, color: 'text-blue-400', bg: 'bg-blue-500/15', query: 'milk yogurt cheese' },
    { id: 'eggs', label: 'Eggs', icon: Egg, color: 'text-yellow-400', bg: 'bg-yellow-500/15', query: 'eggs' },
    { id: 'seafood', label: 'Seafood', icon: Fish, color: 'text-cyan-400', bg: 'bg-cyan-500/15', query: 'fish salmon tuna' },
    { id: 'snacks', label: 'Snacks', icon: Cookie, color: 'text-pink-400', bg: 'bg-pink-500/15', query: 'snack bar chips' },
    { id: 'beverages', label: 'Beverages', icon: Droplets, color: 'text-violet-400', bg: 'bg-violet-500/15', query: 'juice water soda' },
];

export default function FoodEncyclopediaPage() {
    const router = useRouter();
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const activeCategory = CATEGORIES.find((c) => c.id === selectedCategory);
    const query = searchQuery || activeCategory?.query || '';

    const { data: foods = [], isLoading } = useQuery({
        queryKey: ['food-encyclopedia', query],
        queryFn: async () => {
            if (!query) return [];
            const res = await fetch(`/api/food-search?q=${encodeURIComponent(query)}&limit=24`);
            const data = await res.json();
            return data.foods ?? [];
        },
        enabled: query.length > 0,
        staleTime: 60_000,
    });

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="bg-white/5 hover:bg-white/10 text-white rounded-xl">
                        <ChevronLeft size={20} />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-black text-white">Food Encyclopedia</h1>
                        <p className="text-neutral-400 text-sm mt-0.5">Browse 3M+ foods by category</p>
                    </div>
                </header>

                {/* Search */}
                <div className="relative">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <Input
                        placeholder="Search any food..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setSelectedCategory(null); }}
                        className="pl-11 bg-white/5 border-white/10 text-white h-12 rounded-xl"
                    />
                </div>

                {/* Categories */}
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
                    {CATEGORIES.map((cat) => (
                        <motion.button
                            key={cat.id}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setSelectedCategory(selectedCategory === cat.id ? null : cat.id); setSearchQuery(''); }}
                            className={cn(
                                'flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all',
                                selectedCategory === cat.id
                                    ? `${cat.bg} ${cat.color} border-current/20`
                                    : 'bg-white/[0.03] border-white/[0.06] text-neutral-500 hover:bg-white/[0.06]'
                            )}
                        >
                            <cat.icon size={20} />
                            <span className="text-[10px] font-bold">{cat.label}</span>
                        </motion.button>
                    ))}
                </div>

                {/* Results */}
                {isLoading ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="glass-card h-52 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : foods.length === 0 && query ? (
                    <div className="glass-card p-12 text-center rounded-2xl">
                        <Search size={32} className="text-neutral-700 mx-auto mb-3" />
                        <p className="text-neutral-500">No foods found for "{query}"</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {(foods as FoodItem[]).map((food, i) => (
                            <motion.div
                                key={food.id || i}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.03 }}
                                className="glass-card p-4 rounded-xl border-white/[0.04] hover:bg-white/[0.03] transition-all"
                            >
                                {food.imageUrl && (
                                    <div className="w-full h-24 rounded-lg overflow-hidden bg-white/5 mb-3">
                                        <img
                                            src={food.imageUrl}
                                            alt={food.name}
                                            className="w-full h-full object-contain"
                                            loading="lazy"
                                        />
                                    </div>
                                )}
                                <p className="text-white font-bold text-sm leading-tight line-clamp-2">{food.name}</p>
                                {food.brand && <p className="text-neutral-600 text-[10px] mt-0.5">{food.brand}</p>}

                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-3">
                                    {[
                                        { label: 'Cal', value: food.calories, color: 'text-orange-400' },
                                        { label: 'Protein', value: `${food.protein}g`, color: 'text-blue-400' },
                                        { label: 'Carbs', value: `${food.carbs}g`, color: 'text-amber-400' },
                                        { label: 'Fat', value: `${food.fat}g`, color: 'text-red-400' },
                                    ].map((m) => (
                                        <div key={m.label} className="flex justify-between">
                                            <span className="text-neutral-600 text-[10px]">{m.label}</span>
                                            <span className={cn('text-[10px] font-bold', m.color)}>{m.value}</span>
                                        </div>
                                    ))}
                                </div>

                                <p className="text-neutral-700 text-[9px] mt-2">per {food.servingSize}</p>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
