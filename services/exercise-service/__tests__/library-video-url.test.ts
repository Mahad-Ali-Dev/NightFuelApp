/**
 * Unit suite — `videoUrl` is surfaced in the LibraryExercise API responses
 * (src/exercise.service.ts: searchLibrary + getLibraryExerciseById).
 *
 * `video_url` is the self-hosted MP4 exercise-demo column (added alongside the
 * pre-existing `image_url` still and `demo_url` tutorial-link columns). The
 * mobile app streams it in-player via the gate-safe expo-video seam; when the
 * row has no clip the app falls back to its animated image-frame loop / the
 * demoUrl tutorial link. This suite locks the contract that BOTH DB-backed
 * library responses map the column through to the response object's `videoUrl`
 * field — and that a clip-less row omits it (undefined) rather than leaking a
 * raw null, exactly like the sibling imageUrl/demoUrl optionals.
 *
 * Why this drives ExerciseService directly (vs. copying the route like
 * library-bounds.test.ts): the field-mapping under test lives in the SERVICE,
 * not the route. Unlike src/index.ts (which boots a PrismaClient + RedisEventBus
 * + fastify.listen() at import and so cannot be unit-loaded), the
 * ExerciseService class is a plain constructor-injected unit — so we instantiate
 * it with a fake PrismaClient whose libraryExercise.findMany/findUnique return
 * fixed rows, and a no-op EventBus. No DB, hermetic. Mirrors the
 * fake-prisma/in-memory style of gdpr-export.test.ts / ai-routine-libraryid.test.ts.
 */
import { ExerciseService } from '../src/exercise.service';

// A seeded LibraryExercise row carrying a self-hosted MP4 clip.
const ROW_WITH_VIDEO = {
    id: 'lib-bench',
    name: 'Barbell Bench Press',
    muscleGroup: 'chest',
    equipment: 'barbell',
    instructions: 'Lower the bar to your chest, then press up.',
    imageUrl: 'https://cdn.example.com/bench.png',
    demoUrl: 'https://www.youtube.com/watch?v=rT7DgCr-3pg',
    videoUrl: 'https://cdn.example.com/demos/bench.mp4',
    difficulty: 'intermediate',
    bodyPart: 'chest',
    category: 'gym',
    createdAt: new Date('2026-06-22T00:00:00.000Z'),
};

// A clip-less row — video_url is NULL in the DB, as it is for every legacy /
// not-yet-reseeded LibraryExercise. The response must OMIT videoUrl (undefined),
// never surface a raw null.
const ROW_WITHOUT_VIDEO = {
    ...ROW_WITH_VIDEO,
    id: 'lib-pushup',
    name: 'Push-Up',
    equipment: null,
    instructions: null,
    imageUrl: null,
    demoUrl: null,
    videoUrl: null,
    bodyPart: null,
    category: 'home',
};

type LibRow = typeof ROW_WITH_VIDEO;

/** A fake PrismaClient exposing only the two methods these service paths touch. */
function makePrisma(rows: LibRow[]) {
    return {
        libraryExercise: {
            findMany: jest.fn(async () => rows),
            findUnique: jest.fn(async (args: any) =>
                rows.find((r) => r.id === args?.where?.id) ?? null,
            ),
        },
    } as any;
}

const noopEventBus = { publish: jest.fn(async () => undefined) } as any;

describe('ExerciseService — videoUrl surfaced in library responses', () => {
    describe('searchLibrary (DB branch)', () => {
        it('maps video_url through to the response `videoUrl` field', async () => {
            const svc = new ExerciseService(makePrisma([ROW_WITH_VIDEO]), noopEventBus);
            const results = await svc.searchLibrary({ query: 'bench' }, 50);

            expect(results).toHaveLength(1);
            expect(results[0]).toMatchObject({
                id: 'lib-bench',
                name: 'Barbell Bench Press',
                videoUrl: 'https://cdn.example.com/demos/bench.mp4',
            });
            // The sibling optionals are untouched (no regression to imageUrl/demoUrl).
            expect(results[0].imageUrl).toBe('https://cdn.example.com/bench.png');
            expect(results[0].demoUrl).toBe('https://www.youtube.com/watch?v=rT7DgCr-3pg');
        });

        it('omits videoUrl (undefined) for a clip-less row — never a raw null', async () => {
            const svc = new ExerciseService(makePrisma([ROW_WITHOUT_VIDEO]), noopEventBus);
            const results = await svc.searchLibrary({ query: 'push' }, 50);

            expect(results).toHaveLength(1);
            expect(results[0].videoUrl).toBeUndefined();
            // The key is present on the object but undefined (not null), matching
            // how the sibling imageUrl/demoUrl optionals degrade.
            expect(results[0].videoUrl).not.toBeNull();
        });
    });

    describe('getLibraryExerciseById (DB branch)', () => {
        it('maps video_url through to the detail response `videoUrl` field', async () => {
            const svc = new ExerciseService(makePrisma([ROW_WITH_VIDEO]), noopEventBus);
            const ex = await svc.getLibraryExerciseById('lib-bench');

            expect(ex).not.toBeNull();
            expect(ex!.videoUrl).toBe('https://cdn.example.com/demos/bench.mp4');
        });

        it('omits videoUrl (undefined) for a clip-less detail row', async () => {
            const svc = new ExerciseService(makePrisma([ROW_WITHOUT_VIDEO]), noopEventBus);
            const ex = await svc.getLibraryExerciseById('lib-pushup');

            expect(ex).not.toBeNull();
            expect(ex!.videoUrl).toBeUndefined();
        });
    });
});
