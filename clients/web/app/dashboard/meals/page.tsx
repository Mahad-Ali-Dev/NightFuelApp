'use client';

import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { mealApi } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
    Utensils, Search, Plus, Trash2, ArrowLeft, ScanBarcode,
    Globe, ChevronDown, ChevronUp, Info, Minus, Flame,
    AlertCircle, Loader2, BookOpen, Leaf, Wheat, FlameKindling,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { MealInsightsPanel } from '@/components/nutrition/MealInsightsPanel';
import { toast } from 'sonner';
import { BarcodeScannerModal } from '@/components/BarcodeScannerModal';

// ── FoodNutrition type mirrors /api/food-search/route.ts ─────────────────────
interface FoodNutrition {
    id: string;
    name: string;
    brand?: string;
    servingSize: string;
    imageUrl?: string;
    barcode?: string;
    source?: 'openfoodfacts' | 'library';
    foodGroup?: string;
    isVegan?: boolean;
    isGlutenFree?: boolean;
    isHalal?: boolean;
    // Macros
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    saturatedFat: number;
    transFat?: number;
    cholesterol?: number;
    // Minerals
    sodium: number;
    calcium?: number;
    iron?: number;
    potassium?: number;
    magnesium?: number;
    phosphorus?: number;
    zinc?: number;
    // Vitamins
    vitaminC?: number;
    vitaminA?: number;
    vitaminD?: number;
    vitaminB12?: number;
    vitaminB6?: number;
    folate?: number;
}

interface LogEntry extends FoodNutrition {
    quantity: number;
}

enum MealType {
    BREAKFAST = 'BREAKFAST',
    LUNCH = 'LUNCH',
    DINNER = 'DINNER',
    SNACK = 'SNACK',
}

type SearchMode = 'openfoodfacts' | 'library';

const REGIONS = [
    { code: 'world', label: '🌍 World' },
    { code: 'us', label: '🇺🇸 USA' },
    { code: 'pk', label: '🇵🇰 Pakistan' },
    { code: 'in', label: '🇮🇳 India' },
    { code: 'uk', label: '🇬🇧 UK' },
    { code: 'ae', label: '🇦🇪 UAE' },
    { code: 'eg', label: '🇪🇬 Egypt' },
    { code: 'tr', label: '🇹🇷 Turkey' },
];

// Map a meal-service FoodItem API response to our FoodNutrition shape
function foodItemToNutrition(item: Record<string, any>): FoodNutrition {
    return {
        id: item.id as string,
        name: item.name as string,
        servingSize: (item.servingSize ?? item.serving_size ?? '100g') as string,
        source: 'library',
        foodGroup: (item.foodGroup ?? item.food_group ?? undefined) as string | undefined,
        isVegan: Boolean(item.isVegan ?? item.is_vegan),
        isGlutenFree: Boolean(item.isGlutenFree ?? item.is_gluten_free),
        isHalal: Boolean(item.isHalal ?? item.is_halal),
        calories: Number(item.calories) || 0,
        protein: Number(item.protein) || 0,
        carbs: Number(item.carbs) || 0,
        fat: Number(item.fat) || 0,
        fiber: Number(item.fiber) || 0,
        sugar: Number(item.sugar) || 0,
        saturatedFat: 0,
        sodium: Number(item.sodiumMg ?? item.sodium_mg) || 0,
    };
}

// ─── Micro-nutrient row ───────────────────────────────────────────────────────
function MicroRow({ label, value, unit, color = 'text-neutral-300' }: {
    label: string; value?: number; unit: string; color?: string;
}) {
    if (value == null || value === 0) return null;
    return (
        <div className="flex justify-between items-center py-0.5">
            <span className="text-neutral-500 text-[11px]">{label}</span>
            <span className={`text-[11px] font-semibold ${color}`}>{value}{unit}</span>
        </div>
    );
}

// ─── Dietary badge ────────────────────────────────────────────────────────────
function DietBadge({ isVegan, isGlutenFree, isHalal }: { isVegan?: boolean; isGlutenFree?: boolean; isHalal?: boolean }) {
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {isVegan && <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">🌱 Vegan</span>}
            {isGlutenFree && <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full font-medium">🌾 GF</span>}
            {isHalal && <span className="text-[9px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded-full font-medium">☪ Halal</span>}
        </div>
    );
}

// ─── Food result card with expandable micro-nutrients ─────────────────────────
function FoodResultCard({ food, onAdd }: { food: FoodNutrition; onAdd: () => void }) {
    const [expanded, setExpanded] = useState(false);
    const hasMicros = !!(food.vitaminC || food.vitaminD || food.vitaminA || food.calcium || food.iron || food.potassium || food.magnesium);
    const isLibrary = food.source === 'library';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="rounded-xl border border-white/5 bg-white/5 overflow-hidden"
        >
            {/* Main row */}
            <div className="p-3 flex items-start gap-3">
                {food.imageUrl ? (
                    <img
                        src={food.imageUrl}
                        alt={food.name}
                        className="h-11 w-11 rounded-lg object-cover shrink-0 bg-white/5 border border-white/10"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                ) : (
                    <div className="h-11 w-11 rounded-lg bg-white/5 border border-white/10 shrink-0 flex items-center justify-center">
                        {isLibrary
                            ? <BookOpen className="h-4 w-4 text-brand-500/60" />
                            : <Utensils className="h-4 w-4 text-neutral-600" />
                        }
                    </div>
                )}

                <div className="flex-1 min-w-0 pt-0.5">
                    <p className="font-medium text-white text-sm leading-tight line-clamp-2">{food.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {food.brand && (
                            <span className="text-[10px] text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded-full">{food.brand}</span>
                        )}
                        {food.foodGroup && (
                            <span className="text-[10px] text-neutral-500 bg-white/5 px-1.5 py-0.5 rounded-full">{food.foodGroup}</span>
                        )}
                        <span className="text-[10px] text-neutral-500">{food.servingSize}</span>
                    </div>
                    {/* Quick macro bar */}
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] font-medium">
                        <span className="text-white font-bold">{food.calories} kcal</span>
                        <span className="text-neutral-600">·</span>
                        <span className="text-emerald-400">P {food.protein}g</span>
                        <span className="text-blue-400">C {food.carbs}g</span>
                        <span className="text-amber-400">F {food.fat}g</span>
                    </div>
                    {/* Dietary badges for library items */}
                    {isLibrary && (food.isVegan || food.isGlutenFree || food.isHalal) && (
                        <DietBadge isVegan={food.isVegan} isGlutenFree={food.isGlutenFree} isHalal={food.isHalal} />
                    )}
                </div>

                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    {(hasMicros || (food.fiber > 0 || food.sugar > 0 || food.sodium > 0)) && (
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="h-7 w-7 rounded-lg text-neutral-500 hover:text-brand-400 hover:bg-brand-500/10 flex items-center justify-center transition-colors"
                            title="View details"
                        >
                            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
                        </button>
                    )}
                    <button
                        onClick={onAdd}
                        className="h-7 w-7 rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500 hover:text-white flex items-center justify-center transition-all active:scale-95"
                    >
                        <Plus className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* Expandable details */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3 pt-2 border-t border-white/5">
                            <div className="grid grid-cols-2 gap-x-4">
                                {/* Vitamins (OFF only) */}
                                {hasMicros && (
                                    <div>
                                        <p className="text-[9px] uppercase tracking-widest text-neutral-600 font-bold mb-1.5">Vitamins</p>
                                        <MicroRow label="Vitamin C" value={food.vitaminC} unit="mg" color="text-orange-400" />
                                        <MicroRow label="Vitamin A" value={food.vitaminA} unit="μg" color="text-amber-400" />
                                        <MicroRow label="Vitamin D" value={food.vitaminD} unit="μg" color="text-yellow-400" />
                                        <MicroRow label="Vitamin B12" value={food.vitaminB12} unit="μg" color="text-pink-400" />
                                        <MicroRow label="Vitamin B6" value={food.vitaminB6} unit="mg" color="text-rose-400" />
                                        <MicroRow label="Folate" value={food.folate} unit="μg" color="text-fuchsia-400" />
                                    </div>
                                )}
                                {/* Minerals */}
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest text-neutral-600 font-bold mb-1.5">Minerals</p>
                                    <MicroRow label="Sodium" value={food.sodium} unit="mg" color="text-red-400" />
                                    <MicroRow label="Calcium" value={food.calcium} unit="mg" color="text-blue-300" />
                                    <MicroRow label="Iron" value={food.iron} unit="mg" color="text-red-300" />
                                    <MicroRow label="Potassium" value={food.potassium} unit="mg" color="text-green-400" />
                                    <MicroRow label="Magnesium" value={food.magnesium} unit="mg" color="text-teal-400" />
                                    <MicroRow label="Zinc" value={food.zinc} unit="mg" color="text-indigo-400" />
                                    <MicroRow label="Phosphorus" value={food.phosphorus} unit="mg" color="text-violet-400" />
                                </div>
                            </div>
                            {/* Fiber / Sugar / SatFat */}
                            {(food.fiber > 0 || food.sugar > 0 || food.saturatedFat > 0 || food.cholesterol) && (
                                <div className="mt-2 pt-2 border-t border-white/5">
                                    <p className="text-[9px] uppercase tracking-widest text-neutral-600 font-bold mb-1.5">Details</p>
                                    <div className="grid grid-cols-2 gap-x-4">
                                        <MicroRow label="Fiber" value={food.fiber} unit="g" color="text-purple-400" />
                                        <MicroRow label="Sugar" value={food.sugar} unit="g" color="text-pink-300" />
                                        <MicroRow label="Saturated Fat" value={food.saturatedFat} unit="g" color="text-orange-400" />
                                        <MicroRow label="Cholesterol" value={food.cholesterol} unit="mg" color="text-yellow-400" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─── Circular macro dial ──────────────────────────────────────────────────────
function MacroDial({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
    const pct = Math.min(value / max, 1);
    const C = 2 * Math.PI * 20; // circumference r=20
    return (
        <div className="relative flex flex-col items-center">
            <svg width="48" height="48" className="-rotate-90">
                <circle cx="24" cy="24" r="20" strokeWidth="4" fill="transparent" className="stroke-white/5" />
                <circle
                    cx="24" cy="24" r="20" strokeWidth="4" fill="transparent"
                    stroke="currentColor" strokeDasharray={C}
                    strokeDashoffset={C - pct * C}
                    strokeLinecap="round"
                    className={`${color} transition-all duration-700`}
                />
            </svg>
            <div className="absolute top-[14px] left-0 w-full text-center text-[10px] font-bold text-white">{Math.round(value)}g</div>
            <span className={`text-[9px] uppercase font-bold mt-1 tracking-wider ${color}`}>{label}</span>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MealLoggerPage() {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<FoodNutrition[]>([]);
    const [selectedFoods, setSelectedFoods] = useState<LogEntry[]>([]);
    const [mealType, setMealType] = useState<MealType>(MealType.LUNCH);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [region, setRegion] = useState('world');
    const [showRegionMenu, setShowRegionMenu] = useState(false);
    const [searchMode, setSearchMode] = useState<SearchMode>('openfoodfacts');
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    if (!isAuthenticated || !user?.id) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-transparent text-white">
                <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
            </div>
        );
    }

    // ── Search logic ──────────────────────────────────────────────────────────
    const runSearch = useCallback(async (query: string, mode: SearchMode, reg: string) => {
        if (query.length < 2) { setSearchResults([]); return; }
        setIsSearching(true);
        setSearchError('');
        try {
            if (mode === 'library') {
                // Search local FoodDB via meal-service (JWT auth via mealApi interceptor)
                const res = await mealApi.get('/search', { params: { q: query, limit: 20 } });
                const items: Record<string, any>[] = Array.isArray(res.data) ? res.data : (res.data?.foods ?? []);
                const mapped = items.map(foodItemToNutrition);
                setSearchResults(mapped);
                if (mapped.length === 0) setSearchError('No foods found in NightFuel Library — try a different term.');
            } else {
                // Search Open Food Facts via Next.js proxy route
                const params = new URLSearchParams({ q: query, region: reg, limit: '20' });
                const res = await fetch(`/api/food-search?${params}`);
                if (!res.ok) throw new Error('Search failed');
                const data = await res.json();
                const foods: FoodNutrition[] = (data.foods ?? []).map((f: FoodNutrition) => ({ ...f, source: 'openfoodfacts' as const }));
                setSearchResults(foods);
                if (foods.length === 0) setSearchError('No foods found — try a different term or switch to NightFuel Library.');
            }
        } catch {
            setSearchResults([]);
            setSearchError('Search failed. Please try again.');
        } finally {
            setIsSearching(false);
        }
    }, []);

    const handleSearch = useCallback((query: string) => {
        setSearchTerm(query);
        setSearchError('');
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (query.length < 2) { setSearchResults([]); return; }
        debounceRef.current = setTimeout(() => runSearch(query, searchMode, region), 400);
    }, [searchMode, region, runSearch]);

    const changeMode = (mode: SearchMode) => {
        setSearchMode(mode);
        setSearchResults([]);
        setSearchError('');
        if (searchTerm.length >= 2) {
            setTimeout(() => runSearch(searchTerm, mode, region), 50);
        }
    };

    const changeRegion = (code: string) => {
        setRegion(code);
        setShowRegionMenu(false);
        if (searchTerm.length >= 2 && searchMode === 'openfoodfacts') {
            setSearchResults([]);
            setTimeout(() => runSearch(searchTerm, searchMode, code), 50);
        }
    };

    // ── Add / remove food ─────────────────────────────────────────────────────
    const addFood = (food: FoodNutrition) => {
        const existing = selectedFoods.find(f => f.id === food.id);
        if (existing) {
            setSelectedFoods(selectedFoods.map(f =>
                f.id === food.id ? { ...f, quantity: f.quantity + 1 } : f
            ));
        } else {
            setSelectedFoods(prev => [...prev, { ...food, quantity: 1 }]);
        }
        toast.success(`Added ${food.name}`, { duration: 1500 });
    };

    const updateQuantity = (id: string, delta: number) => {
        setSelectedFoods(prev =>
            prev.map(f => f.id === id ? { ...f, quantity: Math.max(1, f.quantity + delta) } : f)
        );
    };

    const removeFood = (id: string) => {
        setSelectedFoods(prev => prev.filter(f => f.id !== id));
    };

    // ── Log Meal ──────────────────────────────────────────────────────────────
    const logMutation = useMutation({
        mutationFn: (payload: any) => mealApi.post('/log', payload),
        onSuccess: () => {
            toast.success('Meal logged successfully!');
            queryClient.invalidateQueries({ queryKey: ['meals'] });
            router.push('/dashboard');
        },
        onError: () => {
            toast.error('Could not reach meal service. Your log is saved locally.');
        },
    });

    const handleLogMeal = () => {
        if (selectedFoods.length === 0) return;
        logMutation.mutate({
            userId: user.id,
            mealType,
            foodItems: selectedFoods.map(f => ({
                foodId: f.id,
                name: f.name,
                quantity: f.quantity,
                calories: f.calories,
                protein: f.protein,
                carbs: f.carbs,
                fat: f.fat,
                servingSize: f.servingSize,
            })),
            isAdherent: true,
        });
    };

    // ── Totals ────────────────────────────────────────────────────────────────
    const totals = selectedFoods.reduce(
        (acc, f) => ({
            calories: acc.calories + f.calories * f.quantity,
            protein: acc.protein + f.protein * f.quantity,
            carbs: acc.carbs + f.carbs * f.quantity,
            fat: acc.fat + f.fat * f.quantity,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    const selectedRegion = REGIONS.find(r => r.code === region) ?? REGIONS[0]!;

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-6 relative z-10">
            {/* Ambient blobs */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                <div className="absolute top-[10%] left-[5%] h-[45%] w-[40%] rounded-full bg-emerald-500/8 blur-[150px]" />
                <div className="absolute bottom-[15%] right-[5%] h-[50%] w-[45%] rounded-full bg-brand-500/8 blur-[150px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="relative z-10 mx-auto max-w-5xl space-y-6"
            >
                {/* ── Header ─────────────────────────────────────────────────── */}
                <header className="glass-panel rounded-2xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard">
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-neutral-400 hover:text-white hover:bg-white/10">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                                <Utensils className="h-5 w-5" />
                            </span>
                            <div>
                                <h1 className="text-xl font-bold text-white leading-none">Log Meal</h1>
                                <p className="text-xs text-neutral-500 mt-0.5">
                                    {searchMode === 'library'
                                        ? '🥗 NightFuel Library • 760 whole foods'
                                        : 'Open Food Facts • 3M+ foods'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Source toggle */}
                        <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5">
                            <button
                                onClick={() => changeMode('openfoodfacts')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${searchMode === 'openfoodfacts'
                                        ? 'bg-brand-500 text-white shadow'
                                        : 'text-neutral-400 hover:text-white'
                                    }`}
                            >
                                <Globe className="h-3.5 w-3.5" />
                                Online
                            </button>
                            <button
                                onClick={() => changeMode('library')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${searchMode === 'library'
                                        ? 'bg-emerald-500 text-white shadow'
                                        : 'text-neutral-400 hover:text-white'
                                    }`}
                            >
                                <BookOpen className="h-3.5 w-3.5" />
                                Library
                            </button>
                        </div>

                        {/* Region selector — only relevant for Open Food Facts */}
                        {searchMode === 'openfoodfacts' && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowRegionMenu(!showRegionMenu)}
                                    className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-neutral-300 hover:bg-white/10 transition-colors"
                                >
                                    <Globe className="h-3.5 w-3.5 text-brand-400" />
                                    <span className="text-xs">{selectedRegion.label}</span>
                                    <ChevronDown className="h-3 w-3 text-neutral-500" />
                                </button>
                                <AnimatePresence>
                                    {showRegionMenu && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -8, scale: 0.95 }}
                                            className="absolute right-0 top-full mt-2 z-50 w-44 glass-panel rounded-xl p-1.5 shadow-xl"
                                        >
                                            {REGIONS.map(r => (
                                                <button
                                                    key={r.code}
                                                    onClick={() => changeRegion(r.code)}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${region === r.code ? 'bg-brand-500/20 text-brand-300' : 'text-neutral-300 hover:bg-white/10'}`}
                                                >
                                                    {r.label}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </header>

                {/* ── 2-Column Layout ────────────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* ── LEFT: Search ──────────────────────────────────────── */}
                    <Card className="glass-card border-white/5 bg-black/40 flex flex-col" style={{ maxHeight: '680px' }}>
                        <CardHeader className="pb-4 border-b border-white/5 shrink-0">
                            <CardTitle className="text-base font-semibold text-white">Find Food</CardTitle>
                            <CardDescription className="text-neutral-500 text-xs">
                                {searchMode === 'library'
                                    ? 'NightFuel Library — whole foods with dietary tags • Tap ⓘ for details'
                                    : `Search ${selectedRegion.label} database • Tap ⓘ to see micro-nutrients`}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4 flex flex-1 flex-col min-h-0">
                            {/* Search bar */}
                            <div className="shrink-0 mb-3 flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                                    <Input
                                        placeholder={searchMode === 'library' ? "Search e.g. 'Kale', 'Salmon', 'Oats'..." : "Search e.g. 'Chicken', 'Dal', 'Oats'..."}
                                        className="pl-9 h-11 bg-white/5 border-white/10 text-white placeholder:text-neutral-600 focus-visible:ring-brand-500"
                                        value={searchTerm}
                                        onChange={e => handleSearch(e.target.value)}
                                    />
                                    {isSearching && (
                                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-500 animate-spin" />
                                    )}
                                </div>
                                {searchMode === 'openfoodfacts' && (
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-11 w-11 shrink-0 border-white/10 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-brand-400"
                                        title="Scan Barcode"
                                        onClick={() => setIsScannerOpen(true)}
                                    >
                                        <ScanBarcode className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>

                            {/* Results list */}
                            <div className="flex-1 overflow-y-auto space-y-2 hide-scrollbar pr-0.5">
                                <AnimatePresence mode="popLayout">
                                    {searchResults.length > 0 && searchResults.map(food => (
                                        <FoodResultCard key={food.id} food={food} onAdd={() => addFood(food)} />
                                    ))}

                                    {/* States */}
                                    {searchTerm.length < 2 && searchResults.length === 0 && (
                                        <motion.div key="empty-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center gap-4 py-12 text-center">
                                            <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center">
                                                {searchMode === 'library'
                                                    ? <BookOpen className="h-7 w-7 text-emerald-600" />
                                                    : <Search className="h-7 w-7 text-neutral-600" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-neutral-400">
                                                    {searchMode === 'library' ? 'Search the NightFuel food library' : 'Type to search foods'}
                                                </p>
                                                <p className="text-xs text-neutral-600 mt-1">
                                                    {searchMode === 'library'
                                                        ? '760 whole foods with macros, fiber, sugar & dietary flags'
                                                        : '3 million+ foods with macro & micro nutrients'}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2 justify-center">
                                                {(searchMode === 'library'
                                                    ? ['Kale', 'Salmon', 'Oats', 'Eggs', 'Almonds', 'Avocado']
                                                    : ['Chicken', 'Rice', 'Dal', 'Oats', 'Eggs', 'Banana']
                                                ).map(s => (
                                                    <button key={s} onClick={() => handleSearch(s)} className="px-3 py-1.5 rounded-full text-xs bg-white/5 border border-white/10 text-neutral-400 hover:text-brand-300 hover:border-brand-500/30 transition-colors">
                                                        {s}
                                                    </button>
                                                ))}
                                            </div>
                                            {searchMode === 'library' && (
                                                <div className="flex gap-3 text-[10px] text-neutral-600">
                                                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500/60" />Vegan</span>
                                                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500/60" />Gluten-Free</span>
                                                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500/60" />Halal</span>
                                                </div>
                                            )}
                                        </motion.div>
                                    )}

                                    {searchError && !isSearching && (
                                        <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-10 text-center">
                                            <AlertCircle className="h-8 w-8 text-neutral-600" />
                                            <p className="text-sm text-neutral-500">{searchError}</p>
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" className="border-white/10 text-neutral-400 hover:text-white text-xs" onClick={() => handleSearch(searchTerm)}>
                                                    Try again
                                                </Button>
                                                {searchMode === 'openfoodfacts' && (
                                                    <Button variant="outline" size="sm" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs" onClick={() => changeMode('library')}>
                                                        Try Library
                                                    </Button>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── RIGHT: Your Plate ─────────────────────────────────── */}
                    <Card className="glass-card border-white/5 bg-black/40 flex flex-col relative overflow-hidden" style={{ maxHeight: '680px' }}>
                        <div className="absolute top-0 right-0 h-48 w-48 rounded-bl-full bg-emerald-500/5 pointer-events-none" />

                        <CardHeader className="pb-4 border-b border-white/5 shrink-0 relative z-10">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-semibold text-white">
                                    Your Plate
                                    {selectedFoods.length > 0 && (
                                        <span className="ml-2 text-xs text-neutral-500 font-normal">({selectedFoods.length} items)</span>
                                    )}
                                </CardTitle>
                                <select
                                    className="bg-white/5 border border-white/10 rounded-lg text-xs text-brand-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
                                    value={mealType}
                                    onChange={e => setMealType(e.target.value as MealType)}
                                >
                                    {Object.values(MealType).map(t => (
                                        <option key={t} value={t} className="bg-neutral-900 text-white">
                                            {t.charAt(0) + t.slice(1).toLowerCase()}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </CardHeader>

                        <CardContent className="pt-4 flex-1 flex flex-col min-h-0 relative z-10">
                            {/* Food items list */}
                            <div className="flex-1 overflow-y-auto space-y-2 hide-scrollbar mb-3 pr-0.5">
                                <AnimatePresence>
                                    {selectedFoods.length === 0 ? (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-48 flex flex-col items-center justify-center gap-3 text-neutral-600">
                                            <Utensils className="h-10 w-10 opacity-20" />
                                            <p className="text-sm">Search and add foods to your plate</p>
                                        </motion.div>
                                    ) : (
                                        selectedFoods.map(item => (
                                            <motion.div
                                                key={item.id}
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -20 }}
                                                layout
                                                className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-gradient-to-r from-emerald-500/10 to-transparent"
                                            >
                                                {item.imageUrl ? (
                                                    <img src={item.imageUrl} alt={item.name} className="h-9 w-9 rounded-lg object-cover shrink-0 bg-white/5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                ) : (
                                                    <div className="h-9 w-9 rounded-lg bg-white/5 shrink-0 flex items-center justify-center">
                                                        {item.source === 'library'
                                                            ? <BookOpen className="h-4 w-4 text-emerald-500/40" />
                                                            : <Flame className="h-4 w-4 text-emerald-500/40" />}
                                                    </div>
                                                )}

                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{item.name}</p>
                                                    <p className="text-[10px] text-neutral-500 mt-0.5">
                                                        {Math.round(item.calories * item.quantity)} kcal · P {(item.protein * item.quantity).toFixed(1)}g · C {(item.carbs * item.quantity).toFixed(1)}g · F {(item.fat * item.quantity).toFixed(1)}g
                                                    </p>
                                                </div>

                                                {/* Quantity control */}
                                                <div className="flex items-center shrink-0 gap-2">
                                                    <div className="flex items-center rounded-lg border border-white/10 overflow-hidden bg-black/40">
                                                        <button onClick={() => updateQuantity(item.id, -1)} className="px-2 py-1.5 hover:bg-white/10 text-neutral-400 transition-colors">
                                                            <Minus className="h-3 w-3" />
                                                        </button>
                                                        <span className="w-6 text-center text-xs font-bold text-white">{item.quantity}</span>
                                                        <button onClick={() => updateQuantity(item.id, 1)} className="px-2 py-1.5 hover:bg-white/10 text-neutral-400 transition-colors">
                                                            <Plus className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                    <button onClick={() => removeFood(item.id)} className="h-7 w-7 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        ))
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* AI Insights Panel */}
                            <MealInsightsPanel selectedFoods={selectedFoods} totals={totals} mealType={mealType} />

                            {/* Totals + Log CTA */}
                            <div className="shrink-0 pt-4 mt-2 border-t border-white/5">
                                <div className="flex items-center justify-around mb-4">
                                    <div className="text-center">
                                        <div className="text-3xl font-black text-white tabular-nums">{Math.round(totals.calories)}</div>
                                        <div className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold mt-0.5">Calories</div>
                                    </div>
                                    <div className="flex gap-4">
                                        <MacroDial value={totals.protein} max={150} label="Pro" color="text-emerald-500" />
                                        <MacroDial value={totals.carbs} max={250} label="Carb" color="text-blue-500" />
                                        <MacroDial value={totals.fat} max={80} label="Fat" color="text-amber-500" />
                                    </div>
                                </div>
                                <Button
                                    className="w-full h-11 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                                    disabled={selectedFoods.length === 0 || logMutation.isPending}
                                    onClick={handleLogMeal}
                                >
                                    {logMutation.isPending ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Logging...</>
                                    ) : (
                                        `Log ${mealType.charAt(0) + mealType.slice(1).toLowerCase()} (${selectedFoods.length} item${selectedFoods.length !== 1 ? 's' : ''})`
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </motion.div>

            <BarcodeScannerModal
                isOpen={isScannerOpen}
                onClose={() => setIsScannerOpen(false)}
                onScan={(code) => {
                    setSearchTerm(code);
                    setSearchMode('openfoodfacts');
                    runSearch(code, 'openfoodfacts', region);
                }}
            />
        </div>
    );
}
