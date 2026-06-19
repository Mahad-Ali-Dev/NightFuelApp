/**
 * Idempotency suite — the recipe seeder's guard-by-title write path
 * (src/seed-recipes.ts `seed()` + the pure `planRecipeWrite` helper).
 *
 * `Recipe` has NO `@unique` on `title`, so a bare `upsert` would require a
 * user-gated migration. Instead the seeder is made re-runnable the file-only
 * way: for each `MOCK_RECIPES` entry it does a `findFirst({ where: { title } })`
 * guard and then UPDATES the matched row (else CREATES a new one). This locks
 * that contract so a second full pass can never duplicate the 50 recipes:
 *
 *   1. cold DB (findFirst -> null for every title): exactly MOCK_RECIPES.length
 *      create() calls and ZERO update() calls;
 *   2. warm DB (findFirst -> an existing row for a title): update() — not
 *      create() — fires for that title, so a full re-seed yields zero net new
 *      rows (asserted as zero create() calls / MOCK_RECIPES.length update()s);
 *   3. titles are matched EXACTLY (no `mode: 'insensitive'`) and every write
 *      payload's keys are a subset of the allowed Recipe columns; plus
 *   4. a direct unit test of the pure planRecipeWrite() decision helper.
 *
 * The module-level `new PrismaClient()` in seed-recipes.ts is intercepted by a
 * `jest.mock` of the generated client, so importing the module opens NO DB
 * connection and the test can both feed findFirst() results and count
 * create()/update() calls. seed-recipes.ts still guards its CLI auto-run behind
 * `require.main === module`, so importing it here never triggers a live write.
 *
 * If anyone reverts to a bare create() loop, switches the guard to a
 * case-insensitive match, or leaks a non-Recipe key into the write payload,
 * this file goes red.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Mock the generated Prisma client BEFORE importing the seeder ─────────────
// jest hoists this factory above the imports, so it must be fully self-contained
// (it may only reference `mock`-prefixed module-scope vars). A single shared
// mock instance is built inside the factory and returned from EVERY
// `new PrismaClient()`, so the module-level client the seeder closes over is the
// exact object the test drives and asserts against. We retrieve that handle
// after import via `jest.requireMock` (see `prisma` below).
jest.mock('../src/generated/prisma', () => {
    const mockInstance = {
        recipe: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        $disconnect: jest.fn(),
    };
    return { PrismaClient: jest.fn(() => mockInstance) };
});

// Imported AFTER the mock is registered.
import { MOCK_RECIPES, planRecipeWrite, seed } from '../src/seed-recipes';

// The shared mock instance the seeder's module-level `new PrismaClient()`
// returned. `new` on the mocked constructor yields the same singleton.
const { PrismaClient } = jest.requireMock('../src/generated/prisma') as {
    PrismaClient: new () => {
        recipe: {
            findFirst: jest.Mock;
            create: jest.Mock;
            update: jest.Mock;
        };
        $disconnect: jest.Mock;
    };
};
const prismaMock = new PrismaClient();
const recipe = prismaMock.recipe;

// The exact column set a Recipe write may carry — mirrors the Prisma `Recipe`
// model's user-writable columns (id/createdAt/updatedAt are DB-managed). The
// seed write payload keys must be a subset of these.
const ALLOWED_RECIPE_COLUMNS = [
    'title',
    'description',
    'image',
    'prepTimeMins',
    'cookTimeMins',
    'servings',
    'calories',
    'protein',
    'carbs',
    'fat',
    'tags',
    'ingredients',
    'instructions',
];

describe('meal-service recipe seeder — guard-by-title idempotency', () => {
    beforeEach(() => {
        recipe.findFirst.mockReset();
        recipe.create.mockReset();
        recipe.update.mockReset();
        prismaMock.$disconnect.mockReset();
    });

    // ── (1) Cold DB: nothing exists -> all creates, no updates ───────────────
    describe('first run against an empty catalog (findFirst -> null)', () => {
        it('issues exactly one create() per recipe and zero update() calls', async () => {
            recipe.findFirst.mockResolvedValue(null as never);

            await seed();

            expect(recipe.findFirst).toHaveBeenCalledTimes(MOCK_RECIPES.length);
            expect(recipe.create).toHaveBeenCalledTimes(MOCK_RECIPES.length);
            expect(recipe.update).not.toHaveBeenCalled();
        });

        it('matches titles EXACTLY — no case-insensitive mode on the guard', async () => {
            recipe.findFirst.mockResolvedValue(null as never);

            await seed();

            const seededTitles = MOCK_RECIPES.map((r) => r.title);
            const lookedUpTitles = recipe.findFirst.mock.calls.map(
                ([arg]: [any]) => arg.where.title,
            );

            // Every lookup uses the verbatim title, in order...
            expect(lookedUpTitles).toEqual(seededTitles);
            // ...and never a fuzzy/case-insensitive matcher.
            for (const [arg] of recipe.findFirst.mock.calls as [any][]) {
                expect(arg.where).toEqual({ title: expect.any(String) });
                expect(arg.where).not.toHaveProperty('title.mode');
                expect(JSON.stringify(arg.where)).not.toContain('insensitive');
                // Guard reads only the id back — keeps the lookup cheap.
                expect(arg.select).toEqual({ id: true });
            }
        });

        it('hands Prisma only valid Recipe columns in the create payload', async () => {
            recipe.findFirst.mockResolvedValue(null as never);

            await seed();

            expect(recipe.create).toHaveBeenCalled();
            for (const [arg] of recipe.create.mock.calls as [any][]) {
                const keys = Object.keys(arg.data);
                for (const key of keys) {
                    expect(ALLOWED_RECIPE_COLUMNS).toContain(key);
                }
                // The two JSON columns are always present in the write.
                expect(arg.data).toHaveProperty('ingredients');
                expect(arg.data).toHaveProperty('instructions');
            }
        });
    });

    // ── (2) Warm DB: rows exist -> updates, no creates -> zero net new rows ──
    describe('re-run against a populated catalog (findFirst -> existing row)', () => {
        it('updates the matched row instead of creating a duplicate', async () => {
            // Every title already exists; return a stable id per call.
            recipe.findFirst.mockImplementation(async () => ({ id: 'existing-id' }));

            await seed();

            // A full second pass adds ZERO new rows...
            expect(recipe.create).not.toHaveBeenCalled();
            // ...and updates each existing recipe in place by its id.
            expect(recipe.update).toHaveBeenCalledTimes(MOCK_RECIPES.length);
            for (const [arg] of recipe.update.mock.calls as [any][]) {
                expect(arg.where).toEqual({ id: 'existing-id' });
                // Update payload is the same valid-column set as create.
                for (const key of Object.keys(arg.data)) {
                    expect(ALLOWED_RECIPE_COLUMNS).toContain(key);
                }
            }
        });

        it('calls update() (not create()) for a single pre-existing title', async () => {
            const target = MOCK_RECIPES[0]!.title;
            recipe.findFirst.mockImplementation(async (arg: any) =>
                arg.where.title === target ? { id: 'row-0' } : null,
            );

            await seed();

            // The one matched title was updated, by its id...
            expect(recipe.update).toHaveBeenCalledTimes(1);
            expect(recipe.update.mock.calls[0]![0]).toMatchObject({
                where: { id: 'row-0' },
            });
            // ...and the update payload carried that recipe's title.
            expect((recipe.update.mock.calls[0]![0] as any).data.title).toBe(target);
            // ...while every other (missing) title still got created.
            expect(recipe.create).toHaveBeenCalledTimes(MOCK_RECIPES.length - 1);
            const createdTitles = recipe.create.mock.calls.map(
                ([a]: [any]) => a.data.title,
            );
            expect(createdTitles).not.toContain(target);
        });
    });

    // ── (4) Pure decision helper ─────────────────────────────────────────────
    describe('planRecipeWrite() pure helper', () => {
        it('returns "create" when no row exists', () => {
            expect(planRecipeWrite(null)).toBe('create');
        });

        it('returns "update" when a row exists', () => {
            expect(planRecipeWrite({ id: 'abc-123' })).toBe('update');
        });
    });
});
