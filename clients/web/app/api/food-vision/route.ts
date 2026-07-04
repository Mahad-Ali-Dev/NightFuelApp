/**
 * /api/food-vision  —  POINT-AT-A-PLATE photo food recognition
 *
 * The vision complement to /api/food-search (the barcode/text gateway). The
 * client sends a single JPEG (base64 data URL) of a plate; we ask a multimodal
 * LLM to identify the primary dish and ESTIMATE its per-typical-serving
 * nutrition, then return the SAME `{ food: FoodNutrition }` shape /api/food-
 * search emits so the mobile result UI (macro panel + Micronutrients grid +
 * addToMeal threading) is reused verbatim.
 *
 * Provider: Groq via its OpenAI-compatible Chat Completions API.
 *   • Base   : https://api.groq.com/openai/v1   (override with OPENAI_BASE_URL)
 *   • Key    : env OPENAI_API_KEY                (SERVER-SIDE ONLY)
 *   • Model  : meta-llama/llama-4-scout-17b-16e-instruct  (vision-capable)
 *
 * Honesty: the numbers are an LLM ESTIMATE from a single photo, never a label
 * reading. We return `source: 'vision-estimate'` + a `confidence` (0..1) so the
 * UI can badge it as an estimate; on no-food / low-confidence / parse failure we
 * return a clear JSON error (NOT a 500) so the client can offer "try again /
 * add manually".
 */

import { NextRequest, NextResponse } from 'next/server';
import { enforceScanQuota } from '@/lib/scanQuota';

// Vision inference can take a while on a cold model — give the route room.
export const runtime = 'nodejs';
export const maxDuration = 30;

// ─── Nutrition Type ───────────────────────────────────────────────────────────
// Identical to /api/food-search's FoodNutrition so the mobile client (whose
// FoodResult mirrors that shape) reuses every field. Units match food-search:
//   • macros are grams, `calories` is kcal
//   • minerals + vitaminC / vitaminB6 / cholesterol are milligrams (mg)
//   • vitaminA / vitaminD / vitaminB12 / folate are micrograms (µg)
export interface FoodNutrition {
    id: string;
    name: string;
    brand?: string;
    servingSize: string;
    imageUrl?: string;
    barcode?: string;
    countries?: string[];

    // Macronutrients (per serving)
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    saturatedFat: number;
    transFat?: number;

    // Micronutrients (per serving)
    sodium: number;
    calcium?: number;
    iron?: number;
    potassium?: number;
    magnesium?: number;
    phosphorus?: number;
    zinc?: number;
    vitaminC?: number;
    vitaminA?: number;
    vitaminD?: number;
    vitaminB12?: number;
    vitaminB6?: number;
    folate?: number;
    cholesterol?: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const GROQ_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1';
const VISION_MODEL = process.env.FOOD_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

// Cap the inbound image so a giant upload can't blow the body limit or the
// model's context. ~5MB of base64 (the data-URL payload, not the decoded bytes).
const MAX_IMAGE_CHARS = 5 * 1024 * 1024;

// Upstream call timeout — fail fast rather than hanging the request.
const UPSTREAM_TIMEOUT_MS = 25_000;

// Below this model-reported confidence we treat the result as "not sure enough"
// and return a low_confidence error so the client offers try-again / manual.
const MIN_CONFIDENCE = 0.3;

// Accept only real image data URLs (jpeg/png/webp/heic). Anything else is rejected
// before we spend an upstream call.
const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp|heic|heif);base64,/i;

// ─── Strict prompt ────────────────────────────────────────────────────────────
// The model must return JSON ONLY, with the EXACT FoodNutrition key set so the
// response threads straight into the shared mobile panel. Unknown micros are
// null (the client renders only present, finite ones).
const SYSTEM_PROMPT =
    'You are a nutrition vision estimator. You receive ONE photo of food and ' +
    'identify the single primary dish or food item, then estimate its nutrition ' +
    'for ONE TYPICAL SERVING as shown. You are NOT reading a nutrition label — ' +
    'you are estimating from appearance, so be honest about uncertainty via the ' +
    'confidence field. Reply with a SINGLE JSON object and NOTHING else: no prose, ' +
    'no markdown, no code fences.';

const USER_PROMPT =
    'Identify the primary food in this image and estimate the nutrition for one ' +
    'typical serving. Respond with ONLY a JSON object using EXACTLY these keys:\n' +
    '{\n' +
    '  "name": string,            // concise dish name, e.g. "Grilled chicken salad"\n' +
    '  "confidence": number,      // 0..1, your confidence this is food AND the estimate is reasonable\n' +
    '  "portionNote": string,     // short note on the serving you assumed, e.g. "~1 plate, 350g"\n' +
    '  "calories": number,        // kcal for the serving\n' +
    '  "protein": number,         // g\n' +
    '  "carbs": number,           // g\n' +
    '  "fat": number,             // g\n' +
    '  "fiber": number,           // g\n' +
    '  "sugar": number,           // g\n' +
    '  "saturatedFat": number,    // g\n' +
    '  "sodium": number,          // mg\n' +
    '  "calcium": number,         // mg\n' +
    '  "iron": number,            // mg\n' +
    '  "potassium": number,       // mg\n' +
    '  "magnesium": number,       // mg\n' +
    '  "zinc": number,            // mg\n' +
    '  "vitaminC": number,        // mg\n' +
    '  "vitaminA": number,        // µg\n' +
    '  "vitaminD": number,        // µg\n' +
    '  "vitaminB12": number,      // µg\n' +
    '  "vitaminB6": number,       // mg\n' +
    '  "folate": number,          // µg\n' +
    '  "cholesterol": number      // mg\n' +
    '}\n' +
    'Use null for any nutrient you cannot reasonably estimate. If the image shows ' +
    'NO food (a person, scenery, a blank wall, an object), return ' +
    '{"name":"","confidence":0,"portionNote":"no food detected"} and null nutrients. ' +
    'Numbers must be plain numbers (no units, no ranges, no strings).';

// ─── JSON extraction (defensive) ──────────────────────────────────────────────
// response_format json_object SHOULD give us clean JSON, but we never trust it
// blindly: strip ```json fences and, failing a direct parse, pull the first
// balanced {...} block out of the text. Returns null when nothing parses.
function extractJson(raw: string): any | null {
    if (!raw) return null;
    let text = raw.trim();

    // Strip a leading/trailing markdown code fence if the model added one.
    const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
    if (fence && fence[1]) text = fence[1].trim();

    // 1. Direct parse.
    try {
        return JSON.parse(text);
    } catch {
        // fall through to block extraction
    }

    // 2. First balanced {...} block — scan with brace depth so a nested object
    //    doesn't truncate early. Skips braces inside double-quoted strings.
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) {
                const candidate = text.slice(start, i + 1);
                try {
                    return JSON.parse(candidate);
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

// ─── Coercion helpers ─────────────────────────────────────────────────────────
// The model may emit a string ("12 g"), a null, or a junk value for any field.
// Coerce to a clean number or null/undefined so we never forward a NaN or a
// fabricated value into the shared panel.

/** A finite number ≥ 0, or null. Strips a stray unit suffix from a string. */
function num(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
    if (typeof v === 'string') {
        const m = /-?\d+(\.\d+)?/.exec(v.replace(',', '.'));
        if (!m) return null;
        const n = parseFloat(m[0]);
        return Number.isFinite(n) && n >= 0 ? n : null;
    }
    return null;
}

/** Round to a whole number, or undefined when absent. */
function whole(v: unknown): number | undefined {
    const n = num(v);
    return n == null ? undefined : Math.round(n);
}

/** One decimal place, or undefined when absent. */
function dp1(v: unknown): number | undefined {
    const n = num(v);
    return n == null ? undefined : parseFloat(n.toFixed(1));
}

/** Two decimal places, or undefined when absent (trace minerals/vitamins). */
function dp2(v: unknown): number | undefined {
    const n = num(v);
    return n == null ? undefined : parseFloat(n.toFixed(2));
}

// ─── Parse model JSON → FoodNutrition (mirrors food-search's parseProduct) ────
// Returns { food, confidence } on success, or a string error token on failure
// (no_food / low_confidence / parse_failed) so the caller maps it to a clean
// JSON error instead of a 500.
type VisionParse =
    | { ok: true; food: FoodNutrition; confidence: number; portionNote: string }
    | { ok: false; error: 'no_food' | 'low_confidence' | 'parse_failed'; confidence?: number };

function parseVision(obj: any): VisionParse {
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'parse_failed' };

    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    const confidence = (() => {
        const c = num(obj.confidence);
        if (c == null) return 0;
        // Clamp to 0..1 (a model may answer 0..100 or out of range).
        return c > 1 ? Math.min(c / 100, 1) : Math.min(Math.max(c, 0), 1);
    })();
    const portionNote = typeof obj.portionNote === 'string' ? obj.portionNote.trim() : '';

    // No identifiable food.
    if (!name) return { ok: false, error: 'no_food', confidence };

    // Require at least a calorie estimate — a "food" with no energy is not usable.
    const calories = whole(obj.calories);
    if (calories == null) return { ok: false, error: 'no_food', confidence };

    // Not confident enough to present as a result.
    if (confidence < MIN_CONFIDENCE) return { ok: false, error: 'low_confidence', confidence };

    const food: FoodNutrition = {
        id: `vision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        servingSize: portionNote || '1 serving',

        // Macros (g) — calories already validated above.
        calories,
        protein: dp1(obj.protein) ?? 0,
        carbs: dp1(obj.carbs) ?? 0,
        fat: dp1(obj.fat) ?? 0,
        fiber: dp1(obj.fiber) ?? 0,
        sugar: dp1(obj.sugar) ?? 0,
        saturatedFat: dp1(obj.saturatedFat) ?? 0,

        // Minerals (mg) — sodium always present (0 default, matching food-search).
        sodium: whole(obj.sodium) ?? 0,
        calcium: whole(obj.calcium),
        iron: dp2(obj.iron),
        potassium: whole(obj.potassium),
        magnesium: whole(obj.magnesium),
        zinc: dp2(obj.zinc),

        // Vitamins + cholesterol.
        vitaminC: dp1(obj.vitaminC),
        vitaminA: whole(obj.vitaminA),
        vitaminD: dp2(obj.vitaminD),
        vitaminB12: dp2(obj.vitaminB12),
        vitaminB6: dp1(obj.vitaminB6),
        folate: whole(obj.folate),
        cholesterol: whole(obj.cholesterol),
    };

    return { ok: true, food, confidence, portionNote };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    // 0. Daily scan quota — gated BEFORE any upstream vision call (the expensive,
    //    billable step). Reuses the shared @nightfuel/config AI-quota policy
    //    (AI_LIMITS[plan].scans, resolvePlan, assertWithinDailyLimit,
    //    AI_QUOTA_EXCEEDED). Over cap → 429 with the standard body; missing/invalid
    //    JWT → 401. The `scans` unit is consumed via quota.commit() only when we
    //    actually return a recognized food below (a no-food/low-confidence/error
    //    result does NOT burn a scan — same rule exercise-service applies to
    //    AI generations).
    const quota = await enforceScanQuota(req);
    if (!quota.ok) return quota.response;

    // 1. Env / key — the call is server-side only; without a key we can't run.
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('[food-vision] OPENAI_API_KEY is not set');
        return NextResponse.json({ error: 'vision_unavailable' }, { status: 503 });
    }

    // 2. Body — accept `image` or `imageBase64`; validate presence + format + size.
    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const image: unknown = body?.image ?? body?.imageBase64;
    if (typeof image !== 'string' || image.length === 0) {
        return NextResponse.json({ error: 'image_required' }, { status: 400 });
    }
    if (image.length > MAX_IMAGE_CHARS) {
        return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
    }
    if (!DATA_URL_RE.test(image)) {
        return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
    }

    // 3. Call Groq's OpenAI-compatible vision endpoint with a hard timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    let upstream: Response;
    try {
        upstream = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: VISION_MODEL,
                temperature: 0.2,
                max_tokens: 900,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: USER_PROMPT },
                            { type: 'image_url', image_url: { url: image } },
                        ],
                    },
                ],
            }),
            signal: controller.signal,
        });
    } catch (err: any) {
        clearTimeout(timer);
        if (err?.name === 'AbortError') {
            console.error('[food-vision] upstream timeout');
            return NextResponse.json({ error: 'timeout' }, { status: 504 });
        }
        console.error('[food-vision] upstream fetch error:', err?.message ?? err);
        return NextResponse.json({ error: 'vision_failed' }, { status: 502 });
    } finally {
        clearTimeout(timer);
    }

    if (!upstream.ok) {
        // Surface a clean error; the upstream body may carry a rate-limit note.
        const detail = await upstream.text().catch(() => '');
        console.error(`[food-vision] Groq ${upstream.status}: ${detail.slice(0, 300)}`);
        // 429 is the free-tier token cap — let the client say "try again shortly".
        if (upstream.status === 429) {
            return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
        }
        return NextResponse.json({ error: 'vision_failed' }, { status: 502 });
    }

    // 4. Pull the model's text content and parse it defensively.
    let content = '';
    try {
        const data = await upstream.json();
        content = data?.choices?.[0]?.message?.content ?? '';
    } catch (err) {
        console.error('[food-vision] could not read upstream JSON:', err);
        return NextResponse.json({ error: 'parse_failed' }, { status: 502 });
    }

    const parsedJson = extractJson(content);
    const result = parseVision(parsedJson);

    if (!result.ok) {
        // no_food / low_confidence / parse_failed — all 200-shaped client errors
        // (NOT 500s): the camera should stay usable and offer try-again / manual.
        // No usable food was returned, so we do NOT consume a scan (quota.commit
        // is skipped) — the user isn't billed for a miss. We still echo the quota
        // headers so the client can surface "N left" even on a miss.
        return NextResponse.json(
            {
                error: result.error,
                ...(result.confidence != null ? { confidence: result.confidence } : {}),
            },
            { status: 200, headers: quota.headers },
        );
    }

    // 5. Success — a real recognized food. Consume ONE scan from the daily quota
    //    (best-effort; a Redis hiccup never fails the response the client is
    //    waiting on) and echo the remaining balance in the response headers.
    await quota.commit();
    const remainingAfter = Math.max(0, quota.remaining - 1);
    return NextResponse.json(
        {
            food: result.food,
            source: 'vision-estimate',
            confidence: result.confidence,
            portionNote: result.portionNote,
        },
        { headers: { ...quota.headers, 'X-Scan-Remaining': String(remainingAfter) } },
    );
}
