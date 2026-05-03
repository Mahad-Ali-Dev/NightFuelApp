/**
 * /api/food-search
 *
 * Powered by Open Food Facts — 3 million+ products, completely FREE, no API key.
 * Supports: search by name, barcode lookup, regional foods, macro + micro nutrients.
 * https://world.openfoodfacts.org
 *
 * Regional databases:
 *   pk.openfoodfacts.org  → Pakistan
 *   in.openfoodfacts.org  → India
 *   us.openfoodfacts.org  → United States
 *   uk.openfoodfacts.org  → United Kingdom
 *   ae.openfoodfacts.org  → UAE / Middle East
 *   eg.openfoodfacts.org  → Egypt
 *   tr.openfoodfacts.org  → Turkey
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── Nutrition Type ───────────────────────────────────────────────────────────

export interface FoodNutrition {
    id: string;
    name: string;
    brand?: string;
    servingSize: string;
    imageUrl?: string;
    barcode?: string;
    countries?: string[];

    // ── Macronutrients (per 100g) ──────────────────────────────────────────
    calories: number;       // kcal
    protein: number;        // g
    carbs: number;          // g
    fat: number;            // g
    fiber: number;          // g
    sugar: number;          // g
    saturatedFat: number;   // g
    transFat?: number;      // g

    // ── Micronutrients (per 100g) ──────────────────────────────────────────
    sodium: number;         // mg (converted from g)
    calcium?: number;       // mg
    iron?: number;          // mg
    potassium?: number;     // mg
    magnesium?: number;     // mg
    phosphorus?: number;    // mg
    zinc?: number;          // mg
    vitaminC?: number;      // mg
    vitaminA?: number;      // μg RAE
    vitaminD?: number;      // μg
    vitaminB12?: number;    // μg
    vitaminB6?: number;     // mg
    folate?: number;        // μg
    cholesterol?: number;   // mg
}

// ─── Parse raw Open Food Facts product → FoodNutrition ───────────────────────

function parseProduct(p: any): FoodNutrition | null {
    const name = p.product_name_en || p.product_name || '';
    if (!name || name.trim() === '') return null;

    const n = p.nutriments ?? {};

    const toMg = (val: number | undefined) =>
        val != null ? Math.round(val * 1000) : undefined;

    const toFixed1 = (val: number | undefined) =>
        val != null ? parseFloat(val.toFixed(1)) : 0;

    // Energy: prefer kcal, fall back from kJ
    const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0);

    return {
        id: p.code || `off-${Math.random().toString(36).slice(2)}`,
        name: name.trim(),
        brand: p.brands ? p.brands.split(',')[0].trim() : undefined,
        servingSize: p.serving_size || '100 g',
        imageUrl: p.image_front_url || p.image_small_url || undefined,
        barcode: p.code || undefined,
        countries: p.countries_tags
            ?.map((c: string) => c.replace('en:', '').replace(/-/g, ' '))
            .slice(0, 3),

        // Macros
        calories: Math.round(kcal),
        protein: toFixed1(n['proteins_100g']),
        carbs: toFixed1(n['carbohydrates_100g']),
        fat: toFixed1(n['fat_100g']),
        fiber: toFixed1(n['fiber_100g']),
        sugar: toFixed1(n['sugars_100g']),
        saturatedFat: toFixed1(n['saturated-fat_100g']),
        transFat: n['trans-fat_100g'] != null ? toFixed1(n['trans-fat_100g']) : undefined,
        cholesterol: n['cholesterol_100g'] != null ? toMg(n['cholesterol_100g']) : undefined,

        // Minerals
        sodium: Math.round((n['sodium_100g'] ?? 0) * 1000),
        calcium: toMg(n['calcium_100g']),
        iron: n['iron_100g'] != null ? parseFloat((n['iron_100g'] * 1000).toFixed(2)) : undefined,
        potassium: toMg(n['potassium_100g']),
        magnesium: toMg(n['magnesium_100g']),
        phosphorus: toMg(n['phosphorus_100g']),
        zinc: n['zinc_100g'] != null ? parseFloat((n['zinc_100g'] * 1000).toFixed(2)) : undefined,

        // Vitamins
        vitaminC: n['vitamin-c_100g'] != null ? toFixed1(n['vitamin-c_100g']) : undefined,
        vitaminA: n['vitamin-a_100g'] != null ? Math.round(n['vitamin-a_100g'] * 1_000_000) : undefined,
        vitaminD: n['vitamin-d_100g'] != null ? parseFloat((n['vitamin-d_100g'] * 1_000_000).toFixed(2)) : undefined,
        vitaminB12: n['vitamin-b12_100g'] != null ? parseFloat((n['vitamin-b12_100g'] * 1_000_000).toFixed(2)) : undefined,
        vitaminB6: n['vitamin-b6_100g'] != null ? toFixed1(n['vitamin-b6_100g']) : undefined,
        folate: n['folate_100g'] != null ? Math.round(n['folate_100g'] * 1_000_000) : undefined,
    };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

// ─── Allowlist for region param — prevents SSRF ───────────────────────────────
const ALLOWED_REGIONS = new Set(['world', 'us', 'pk', 'in', 'uk', 'ae', 'eg', 'tr']);

// ─── Barcode must be 1–14 digits (EAN-8, EAN-13, UPC-A, UPC-E) ───────────────
const BARCODE_RE = /^\d{1,14}$/;

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get('q')?.trim().slice(0, 200); // cap query length

    // Sanitize barcode — digits only, reject anything else
    const rawBarcode = searchParams.get('barcode')?.trim() ?? '';
    const barcode = BARCODE_RE.test(rawBarcode) ? rawBarcode : null;
    if (searchParams.has('barcode') && !barcode) {
        return NextResponse.json({ error: 'Invalid barcode format' }, { status: 400 });
    }

    // Sanitize region — only permit explicitly-listed subdomain values (prevents SSRF)
    const rawRegion = searchParams.get('region')?.toLowerCase() ?? 'world';
    const region = ALLOWED_REGIONS.has(rawRegion) ? rawRegion : 'world';

    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '24'), 1), 50);
    const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1);

    const fields = [
        'code', 'product_name', 'product_name_en', 'brands',
        'serving_size', 'nutriments', 'image_front_url', 'image_small_url',
        'countries_tags',
    ].join(',');

    const headers = {
        'User-Agent': 'NightFuel-App/1.0 (https://nightfuel.app; contact@nightfuel.app)',
    };

    try {
        // ── Barcode Lookup ────────────────────────────────────────────────────
        if (barcode) {
            const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=${fields}`;
            const res = await fetch(url, { headers, next: { revalidate: 86400 } });
            if (!res.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
            const data = await res.json();
            if (data.status !== 1 || !data.product) {
                return NextResponse.json({ error: 'Product not found' }, { status: 404 });
            }
            const food = parseProduct(data.product);
            if (!food) return NextResponse.json({ error: 'Insufficient data' }, { status: 404 });
            return NextResponse.json({ food }, {
                headers: { 'Cache-Control': 'public, s-maxage=86400' },
            });
        }

        // ── Text Search ───────────────────────────────────────────────────────
        if (!q) return NextResponse.json({ error: 'q or barcode required' }, { status: 400 });

        // Safe: region is already validated against ALLOWED_REGIONS above
        const baseHost = `https://${region}.openfoodfacts.org`;

        const url = new URL('/cgi/search.pl', baseHost);
        url.searchParams.set('search_terms', q);
        url.searchParams.set('json', '1');
        url.searchParams.set('page_size', String(limit));
        url.searchParams.set('page', String(page));
        url.searchParams.set('fields', fields);
        url.searchParams.set('sort_by', 'popularity_key');
        url.searchParams.set('action', 'process');

        const res = await fetch(url.toString(), {
            headers,
            next: { revalidate: 3600 }, // cache 1h for search
        });

        if (!res.ok) throw new Error(`OpenFoodFacts ${res.status}`);

        const data = await res.json();
        const products: FoodNutrition[] = (data.products ?? [])
            .map(parseProduct)
            .filter((p: FoodNutrition | null): p is FoodNutrition => p !== null)
            .filter((p: FoodNutrition) => p.calories > 0); // only items with calorie data

        return NextResponse.json(
            { count: products.length, total: data.count, foods: products },
            { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } }
        );

    } catch (err) {
        console.error('[food-search] Error:', err);
        return NextResponse.json({ error: 'Food search failed' }, { status: 500 });
    }
}
