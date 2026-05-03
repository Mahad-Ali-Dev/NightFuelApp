'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft, Search, Filter, Clock, Flame,
    Utensils, Info, Plus, Heart, ChefHat
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { mealApi } from '@/lib/api';

interface Recipe {
    id: string;
    title: string;
    description: string;
    image: string;
    prepTime: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    tags: string[];
    ingredients: string[];
    instructions: string[];
    difficulty: 'Easy' | 'Medium' | 'Hard';
}

export default function RecipesPage() {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [selectedTag, setSelectedTag] = useState('All');
    const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);

    const { data: dbRecipes = [], isLoading } = useQuery({
        queryKey: ['recipes'],
        queryFn: async () => {
            try {
                const res = await mealApi.get('/recipes');
                return res.data || [];
            } catch {
                return [];
            }
        }
    });

    const TAGS = ['All', 'High Protein', 'Meal Prep', 'Breakfast', 'Lunch', 'Dinner', 'Post-Workout'];

    const filteredRecipes = (dbRecipes as any[]).filter(r => {
        const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase()) ||
            r.ingredients.some((i: string) => i.toLowerCase().includes(search.toLowerCase()));
        const matchesTag = selectedTag === 'All' || r.tags.includes(selectedTag);
        return matchesSearch && matchesTag;
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
                                <ChefHat className="text-brand-500" /> Recipes
                            </h1>
                            <p className="text-neutral-400 text-sm mt-0.5">Macro-friendly meals for your goals</p>
                        </div>
                    </div>
                </header>

                <AnimatePresence mode="wait">
                    {!activeRecipe ? (
                        /* ─── Recipe Grid View ────────────────────────────────────────── */
                        <motion.div
                            key="grid"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            {/* Filters */}
                            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white/[0.02] p-2 rounded-2xl border border-white/[0.04]">
                                <div className="relative w-full md:w-80">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                                    <Input
                                        placeholder="Search recipes or ingredients..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="w-full bg-white/5 border-white/10 text-white pl-9 rounded-xl text-sm"
                                    />
                                </div>
                                <div className="flex gap-2 overflow-x-auto w-full md:w-auto custom-scrollbar pb-1 md:pb-0">
                                    {TAGS.map((tag: string) => (
                                        <button
                                            key={tag}
                                            onClick={() => setSelectedTag(tag)}
                                            className={cn(
                                                'px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border',
                                                selectedTag === tag
                                                    ? 'bg-brand-500 text-white border-brand-500/50 shadow-lg shadow-brand-500/20'
                                                    : 'bg-white/5 text-neutral-400 border-white/10 hover:bg-white/10'
                                            )}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                    <Button variant="ghost" size="icon" className="shrink-0 bg-white/5 text-neutral-400 hover:text-white rounded-xl">
                                        <Filter size={16} />
                                    </Button>
                                </div>
                            </div>

                            {filteredRecipes.length === 0 && !isLoading && (
                                <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                                    <ChefHat className="h-16 w-16 mb-4 opacity-30" />
                                    <p className="text-sm font-medium">No recipes found</p>
                                    <p className="text-xs mt-1 text-zinc-600">Recipes will appear here when added by your meal plan or coaches.</p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredRecipes.map((recipe, i) => (
                                    <motion.div
                                        key={recipe.id}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: i * 0.05 }}
                                        onClick={() => setActiveRecipe(recipe)}
                                        className="glass-card rounded-2xl border-white/[0.04] overflow-hidden group cursor-pointer hover:border-white/10 transition-all hover:shadow-2xl hover:shadow-brand-500/10"
                                    >
                                        <div className="h-48 relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10" />
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={recipe.image}
                                                alt={recipe.title}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                            <div className="absolute top-3 right-3 z-20 flex gap-2">
                                                <button className="p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-colors">
                                                    <Heart size={16} />
                                                </button>
                                            </div>
                                            <div className="absolute bottom-3 left-4 z-20 flex items-center gap-4 text-xs font-bold text-white">
                                                <span className="flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-lg">
                                                    <Flame size={14} className="text-orange-400" /> {recipe.calories} kcal
                                                </span>
                                                <span className="flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-lg">
                                                    <Clock size={14} className="text-neutral-300" /> {(recipe as any).prepTimeMins ?? recipe.prepTime ?? '?'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="p-5">
                                            <h3 className="text-white font-bold text-lg leading-tight mb-2 group-hover:text-brand-400 transition-colors">
                                                {recipe.title}
                                            </h3>

                                            <div className="flex gap-2 mb-4 overflow-x-auto pb-1 custom-scrollbar">
                                                {recipe.tags.slice(0, 3).map((tag: string) => (
                                                    <span key={tag} className="text-[10px] bg-white/5 text-neutral-400 px-2 py-1 rounded-md whitespace-nowrap">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>

                                            <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/[0.04]">
                                                <div className="text-center">
                                                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Protein</p>
                                                    <p className="text-brand-400 font-black text-sm">{recipe.protein}g</p>
                                                </div>
                                                <div className="text-center border-l border-r border-white/[0.04]">
                                                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Carbs</p>
                                                    <p className="text-white font-bold text-sm">{recipe.carbs}g</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Fat</p>
                                                    <p className="text-white font-bold text-sm">{recipe.fat}g</p>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    ) : (
                        /* ─── Recipe Detail View ──────────────────────────────────────── */
                        <motion.div
                            key="detail"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-6"
                        >
                            <button
                                onClick={() => setActiveRecipe(null)}
                                className="flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white transition-colors"
                            >
                                <ChevronLeft size={16} /> Back to recipes
                            </button>

                            <div className="grid lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-1 space-y-6">
                                    <div className="h-64 rounded-2xl overflow-hidden relative shadow-2xl">
                                        <img src={activeRecipe.image} alt={activeRecipe.title} className="w-full h-full object-cover" />
                                    </div>

                                    <div className="glass-card p-5 rounded-2xl border-white/[0.04]">
                                        <h3 className="text-white font-bold text-sm mb-4">Macros per serving</h3>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                                                <span className="text-neutral-400 flex items-center gap-2"><Flame size={16} className="text-orange-400" /> Calories</span>
                                                <span className="text-white font-bold">{activeRecipe.calories}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                                                <span className="text-neutral-400 flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-brand-500" /> Protein</span>
                                                <span className="text-brand-400 font-bold">{activeRecipe.protein}g</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                                                <span className="text-neutral-400 flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-blue-500" /> Carbs</span>
                                                <span className="text-white font-bold">{activeRecipe.carbs}g</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-neutral-400 flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-amber-500" /> Fat</span>
                                                <span className="text-white font-bold">{activeRecipe.fat}g</span>
                                            </div>
                                        </div>
                                    </div>

                                    <Button className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl py-6">
                                        <Plus size={18} className="mr-2" /> Add to Meal Planner
                                    </Button>
                                </div>

                                <div className="lg:col-span-2 space-y-8">
                                    <div>
                                        <h2 className="text-3xl font-black text-white mb-3">{activeRecipe.title}</h2>
                                        <p className="text-neutral-400 leading-relaxed text-sm md:text-base">
                                            {activeRecipe.description}
                                        </p>
                                    </div>

                                    <div className="flex gap-4 p-4 bg-white/[0.02] border border-white/[0.04] rounded-2xl">
                                        <div className="flex-1 flex flex-col items-center justify-center p-2">
                                            <Clock size={20} className="text-neutral-400 mb-2" />
                                            <span className="text-white font-bold text-sm">{(activeRecipe as any).prepTimeMins ?? activeRecipe.prepTime ?? 0} min</span>
                                            <span className="text-xs text-neutral-500">Total Time</span>
                                        </div>
                                        <div className="w-px bg-white/[0.06]" />
                                        <div className="flex-1 flex flex-col items-center justify-center p-2">
                                            <Utensils size={20} className="text-neutral-400 mb-2" />
                                            <span className="text-white font-bold text-sm">{activeRecipe.ingredients.length}</span>
                                            <span className="text-xs text-neutral-500">Ingredients</span>
                                        </div>
                                        <div className="w-px bg-white/[0.06]" />
                                        <div className="flex-1 flex flex-col items-center justify-center p-2">
                                            <Info size={20} className="text-neutral-400 mb-2" />
                                            <span className="text-white font-bold text-sm">{((activeRecipe as any).prepTimeMins ?? (activeRecipe as any).prepTime ?? 30) < 15 ? 'Easy' : ((activeRecipe as any).prepTimeMins ?? (activeRecipe as any).prepTime ?? 30) < 30 ? 'Medium' : 'Hard'}</span>
                                            <span className="text-xs text-neutral-500">Difficulty</span>
                                        </div>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                                <Utensils size={18} className="text-brand-400" /> Ingredients
                                            </h3>
                                            <ul className="space-y-3">
                                                {activeRecipe.ingredients.map((ing, i) => (
                                                    <li key={i} className="flex items-center gap-3 text-sm text-neutral-300 p-3 bg-white/5 rounded-xl border border-white/5">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                                                        {ing}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div className="space-y-4">
                                            <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                                <ChefHat size={18} className="text-brand-400" /> Instructions
                                            </h3>
                                            <div className="space-y-4">
                                                {activeRecipe.instructions.map((step, i) => (
                                                    <div key={i} className="flex gap-4 items-start">
                                                        <div className="w-6 h-6 rounded-md bg-brand-500/20 text-brand-400 font-bold flex flex-col items-center justify-center shrink-0 text-xs border border-brand-500/20">
                                                            {i + 1}
                                                        </div>
                                                        <p className="text-neutral-300 text-sm leading-relaxed pt-0.5">
                                                            {step}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
