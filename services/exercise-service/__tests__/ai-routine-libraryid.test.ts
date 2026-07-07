/**
 * Unit suite — AI-routine name → LibraryExercise.libraryId resolution
 * (src/index.ts, POST /v1/exercises/routines/generate).
 *
 * The generate route, AFTER it finalizes `routineData.exercises` (from BOTH the
 * AI reply and the deterministic fallback) and BEFORE createRoutine, resolves
 * every exercise NAME to a real seeded LibraryExercise row id so the mobile
 * workout screen can render rich demo/thumbnail cards and deep-link to the
 * exercise detail. The resolution is:
 *
 *   1. case-insensitive EXACT name match  (prisma.libraryExercise.findFirst,
 *      where name equals, mode:'insensitive'); else
 *   2. case-insensitive CONTAINS match    (where name contains, mode:'insensitive');
 *   else libraryId = null — and the exercise is KEPT regardless (never dropped).
 *
 * Why replicate the helper + attach-loop instead of importing src/:
 *   - src/index.ts is the service bootstrap; it constructs a PrismaClient and a
 *     RedisEventBus and calls fastify.listen() at import time, so it cannot be
 *     loaded in a unit test (same documented constraint as
 *     inline-404-redaction.test.ts / heatmap-window.test.ts).
 *   - So this suite copies the EXACT resolveLibraryId() strategy and the EXACT
 *     attach loop from src/index.ts, drives them through a fake in-memory
 *     LibraryExercise table whose findFirst models Postgres `equals`/`contains`
 *     with `mode:'insensitive'`, and asserts the resolved ids. It is written to
 *     FAIL if the resolution order regresses (e.g. contains-before-exact) or if
 *     an unknown name ever drops an exercise.
 *
 * It also LOCKS the routineExerciseSchema (copied verbatim) accepts and passes
 * `libraryId` through `.passthrough()`, which is what lets the id survive
 * validation into createRoutine's JSON `exercises` column and back out via
 * getRoutines.
 */
import { z } from 'zod';

// ── routineExerciseSchema copied VERBATIM from src/index.ts (cannot import) ─────
const routineExerciseSchema = z.object({
    name: z.string().min(1).max(120),
    sets: z.number().int().min(0).max(100).optional(),
    reps: z.number().int().min(0).max(1000).optional(),
    weightKg: z.number().min(0).max(1000).optional(),
    libraryId: z.string().nullable().optional(),
}).passthrough();

// ── A fake LibraryExercise table + a Postgres-accurate findFirst mock ───────────
// Each row mirrors the real seed shape closely enough for name resolution. The
// mock implements the two `where` shapes the helper uses — { equals, mode } and
// { contains, mode } — with case-insensitive semantics, returning the FIRST
// matching row (findFirst) or null, and honours `select: { id: true }`.
type LibRow = { id: string; name: string };

const SEED: LibRow[] = [
    { id: 'lib-bench', name: 'Barbell Bench Press' },
    { id: 'lib-squat', name: 'Barbell Squat' },
    { id: 'lib-dl', name: 'Barbell Deadlift' },
    // A longer canonical name so a shorter query resolves via CONTAINS (not exact).
    { id: 'lib-ohp', name: 'Standing Overhead Press' },
    { id: 'lib-curl', name: 'Dumbbell Bicep Curl' },
];

function makeFindFirst(rows: LibRow[]) {
    return jest.fn(async (args: any) => {
        const cond = args?.where?.name ?? {};
        const wantId = args?.select?.id === true;
        const project = (r: LibRow) => (wantId ? { id: r.id } : r);

        if (typeof cond.equals === 'string') {
            const target =
                cond.mode === 'insensitive' ? cond.equals.toLowerCase() : cond.equals;
            const hit = rows.find((r) =>
                cond.mode === 'insensitive' ? r.name.toLowerCase() === target : r.name === target,
            );
            return hit ? project(hit) : null;
        }
        if (typeof cond.contains === 'string') {
            const needle =
                cond.mode === 'insensitive' ? cond.contains.toLowerCase() : cond.contains;
            const hit = rows.find((r) =>
                cond.mode === 'insensitive'
                    ? r.name.toLowerCase().includes(needle)
                    : r.name.includes(needle),
            );
            return hit ? project(hit) : null;
        }
        return null;
    });
}

describe('routineExerciseSchema — libraryId passthrough', () => {
    it('accepts and passes through a string libraryId', () => {
        const parsed = routineExerciseSchema.safeParse({
            name: 'Barbell Bench Press',
            sets: 3,
            reps: 10,
            libraryId: 'lib-bench',
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) expect(parsed.data.libraryId).toBe('lib-bench');
    });

    it('accepts an explicit null libraryId (unmatched name)', () => {
        const parsed = routineExerciseSchema.safeParse({ name: 'Made Up Move', libraryId: null });
        expect(parsed.success).toBe(true);
        if (parsed.success) expect(parsed.data.libraryId).toBeNull();
    });

    it('accepts an omitted libraryId (older routine shape)', () => {
        const parsed = routineExerciseSchema.safeParse({ name: 'Plank', sets: 3, reps: 30 });
        expect(parsed.success).toBe(true);
        if (parsed.success) expect(parsed.data.libraryId).toBeUndefined();
    });

    it('rejects a non-string, non-null libraryId', () => {
        const parsed = routineExerciseSchema.safeParse({ name: 'Plank', libraryId: 123 as any });
        expect(parsed.success).toBe(false);
    });
});

describe('resolveLibraryId — exact-then-contains, case-insensitive', () => {
    // resolveLibraryId copied VERBATIM from src/index.ts, with `prisma` injected
    // so the unit test can drive it without a real client.
    let prisma: { libraryExercise: { findFirst: ReturnType<typeof makeFindFirst> } };

    async function resolveLibraryId(name: string): Promise<string | null> {
        const trimmed = (name ?? '').trim();
        if (!trimmed) return null;
        const exact = await prisma.libraryExercise.findFirst({
            where: { name: { equals: trimmed, mode: 'insensitive' } },
            select: { id: true },
        });
        if (exact) return exact.id;
        const partial = await prisma.libraryExercise.findFirst({
            where: { name: { contains: trimmed, mode: 'insensitive' } },
            select: { id: true },
        });
        return partial?.id ?? null;
    }

    beforeEach(() => {
        prisma = { libraryExercise: { findFirst: makeFindFirst(SEED) } };
    });

    it('resolves an EXACT name (same case) to the correct id', async () => {
        await expect(resolveLibraryId('Barbell Bench Press')).resolves.toBe('lib-bench');
    });

    it('resolves an EXACT name case-insensitively', async () => {
        await expect(resolveLibraryId('barbell DEADLIFT')).resolves.toBe('lib-dl');
    });

    it('prefers the EXACT match even when a CONTAINS match also exists', async () => {
        // 'Barbell Squat' is both an exact row AND a substring of nothing longer
        // here; assert the FIRST query (exact) is the one that hits — the contains
        // query must not even be needed.
        await expect(resolveLibraryId('Barbell Squat')).resolves.toBe('lib-squat');
        // Exactly one findFirst call ⇒ it short-circuited on the exact match.
        expect(prisma.libraryExercise.findFirst).toHaveBeenCalledTimes(1);
        expect(prisma.libraryExercise.findFirst.mock.calls[0][0].where.name).toEqual({
            equals: 'Barbell Squat',
            mode: 'insensitive',
        });
    });

    it('falls back to CONTAINS when no exact row exists', async () => {
        // 'Overhead Press' is NOT an exact row, but it is a substring of the seeded
        // 'Standing Overhead Press' → resolves via the second (contains) query.
        await expect(resolveLibraryId('Overhead Press')).resolves.toBe('lib-ohp');
        expect(prisma.libraryExercise.findFirst).toHaveBeenCalledTimes(2);
        expect(prisma.libraryExercise.findFirst.mock.calls[1][0].where.name).toEqual({
            contains: 'Overhead Press',
            mode: 'insensitive',
        });
    });

    it('returns null for an unknown name (no exact, no contains)', async () => {
        await expect(resolveLibraryId('Completely Unknown Movement')).resolves.toBeNull();
        expect(prisma.libraryExercise.findFirst).toHaveBeenCalledTimes(2);
    });

    it('returns null (no query) for a blank name', async () => {
        await expect(resolveLibraryId('   ')).resolves.toBeNull();
        expect(prisma.libraryExercise.findFirst).not.toHaveBeenCalled();
    });
});

describe('generate route attach-loop — every exercise keeps a libraryId, none dropped', () => {
    // The EXACT attach loop from src/index.ts, factored so the test can run it
    // over a finalized routineData.exercises against the fake prisma.
    let prisma: { libraryExercise: { findFirst: ReturnType<typeof makeFindFirst> } };

    async function resolveLibraryId(name: string): Promise<string | null> {
        const trimmed = (name ?? '').trim();
        if (!trimmed) return null;
        const exact = await prisma.libraryExercise.findFirst({
            where: { name: { equals: trimmed, mode: 'insensitive' } },
            select: { id: true },
        });
        if (exact) return exact.id;
        const partial = await prisma.libraryExercise.findFirst({
            where: { name: { contains: trimmed, mode: 'insensitive' } },
            select: { id: true },
        });
        return partial?.id ?? null;
    }

    async function attachLibraryIds(routineData: any) {
        if (Array.isArray(routineData.exercises)) {
            for (const ex of routineData.exercises) {
                if (ex && typeof ex === 'object' && typeof ex.name === 'string') {
                    ex.libraryId = await resolveLibraryId(ex.name);
                }
            }
        }
        return routineData;
    }

    beforeEach(() => {
        prisma = { libraryExercise: { findFirst: makeFindFirst(SEED) } };
    });

    it('attaches the correct id for known names and null for the unknown — count preserved', async () => {
        // A mixed AI routine: three known (one needing case-folding, one needing
        // CONTAINS) + one totally unknown.
        const routineData = {
            title: 'AI strength plan',
            exercises: [
                { name: 'Barbell Bench Press', sets: 5, reps: 5 }, // exact
                { name: 'barbell squat', sets: 5, reps: 5 },        // exact, case-insensitive
                { name: 'Overhead Press', sets: 4, reps: 8 },       // contains → Standing Overhead Press
                { name: 'Jefferson Curl', sets: 3, reps: 12 },      // unknown → null
            ],
        };

        const before = routineData.exercises.length;
        const resolved = await attachLibraryIds(routineData);

        // (a) No exercise is dropped — the array length is unchanged.
        expect(resolved.exercises).toHaveLength(before);

        // (b) Each known name resolved to the right id (exact-then-contains).
        expect(resolved.exercises[0].libraryId).toBe('lib-bench');
        expect(resolved.exercises[1].libraryId).toBe('lib-squat');
        expect(resolved.exercises[2].libraryId).toBe('lib-ohp');

        // (c) The unknown name yields libraryId:null WITHOUT being removed, and it
        //     keeps its original fields intact.
        expect(resolved.exercises[3]).toMatchObject({ name: 'Jefferson Curl', sets: 3, reps: 12 });
        expect(resolved.exercises[3].libraryId).toBeNull();

        // (d) Every exercise carries the libraryId key (string OR null) so the
        //     mobile client can branch on it deterministically.
        for (const ex of resolved.exercises) {
            expect(ex).toHaveProperty('libraryId');
            const v = ex.libraryId;
            expect(v === null || typeof v === 'string').toBe(true);
        }
    });

    it('the attached libraryId survives routineExerciseSchema validation (passthrough into createRoutine)', async () => {
        const routineData = {
            title: 'AI plan',
            exercises: [
                { name: 'Dumbbell Bicep Curl', sets: 3, reps: 12 }, // exact → lib-curl
                { name: 'Mystery Move', sets: 3, reps: 10 },         // unknown → null
            ],
        };
        await attachLibraryIds(routineData);

        // Validate each resolved exercise the way createRoutineSchema would.
        const parsedKnown = routineExerciseSchema.safeParse(routineData.exercises[0]);
        const parsedUnknown = routineExerciseSchema.safeParse(routineData.exercises[1]);
        expect(parsedKnown.success).toBe(true);
        expect(parsedUnknown.success).toBe(true);
        if (parsedKnown.success) expect(parsedKnown.data.libraryId).toBe('lib-curl');
        if (parsedUnknown.success) expect(parsedUnknown.data.libraryId).toBeNull();
    });

    it('handles the deterministic FALLBACK exercise shape ({name,sets,reps}) too', async () => {
        // buildFallbackRoutine emits { name, sets, reps } with NO libraryId; the
        // loop must add one (string or null) for each — same as the AI path.
        const fallbackLike = {
            title: 'Beginner general plan',
            exercises: [
                { name: 'Barbell Squat', sets: 4, reps: 10 }, // exact → lib-squat
                { name: 'Bench Press', sets: 4, reps: 10 },    // contains → Barbell Bench Press
                { name: 'Pistol Squat', sets: 3, reps: 8 },    // unknown → null
            ],
        };
        const resolved = await attachLibraryIds(fallbackLike);
        expect(resolved.exercises).toHaveLength(3);
        expect(resolved.exercises[0].libraryId).toBe('lib-squat');
        expect(resolved.exercises[1].libraryId).toBe('lib-bench'); // 'Bench Press' ⊂ 'Barbell Bench Press'
        expect(resolved.exercises[2].libraryId).toBeNull();
    });
});
