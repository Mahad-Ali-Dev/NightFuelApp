/**
 * Regression suite — state-service materializer ADHERENCE WINDOW correctness
 * (src/materializer.ts: handleMealLogged + rollWindow).
 *
 * Locks the two consumer-side bugs that made last7DaysAdherence wrong:
 *
 *   (1) UNDEFINED-SKIP — a meal-logged event with no boolean isAdherent must
 *       NOT append a false (0) sample. The old code did
 *       `adherent: payload.isAdherent` then `s.adherent ? 1 : 0`, so an
 *       undefined verdict counted as 0 and forced every user's adherence to 0.
 *       The fix appends nothing for a missing verdict; when the window holds no
 *       real boolean samples last7DaysAdherence stays at the NEUTRAL 1.0 default
 *       (above the decision-engine's < 0.7 volume-cut threshold → no penalty).
 *
 *   (2) PER-DAY DEDUP — rollWindow appended one sample PER meal event, so the
 *       mean was per-event, not per-DAY. Many meals on one day biased the mean
 *       toward that day's verdict. The fix collapses to one verdict per UTC
 *       calendar day (the day's latest verdict) before averaging.
 *
 * Driven with the same fake-Prisma harness as state-finite.test.ts: a class
 * module with no import-time infra, a findUnique that returns the staged
 * existing row, and an upsert that records its args.
 */
import { StateMaterializer } from '../src/materializer';

const USER = 'user-1';
const EVENT_ID = 'evt-1';

interface UpsertCall {
    where: { userId: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
}

/** A previously-stored adherence sample as it lives in the JSON column. */
interface StoredSample {
    at: string;
    adherent: boolean;
}

/**
 * Build a StateMaterializer over a fake PrismaClient that returns
 * `existingSamples` from userState.findUnique (the adherenceSamples read path)
 * and records every userState.upsert(args). No real infra is touched.
 */
function makeMaterializer(existingSamples: StoredSample[] | null = null) {
    const calls: UpsertCall[] = [];
    const fakePrisma: any = {
        userState: {
            findUnique: async () =>
                existingSamples === null ? null : { adherenceSamples: existingSamples },
            upsert: async (args: UpsertCall) => {
                calls.push(args);
                return {};
            },
        },
    };
    return { materializer: new StateMaterializer(fakePrisma), calls };
}

function mealEvent(payload: Record<string, unknown>) {
    return { eventId: EVENT_ID, userId: USER, payload } as any;
}

/** A recent (within the 7-day window) ISO timestamp on the given UTC day offset from now. */
function isoDaysAgo(days: number, hour = 12): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
}

describe('state-service materializer — handleMealLogged adherence undefined-skip', () => {
    it('a missing isAdherent on a FRESH user leaves adherence at the neutral 1.0 (no penalty)', async () => {
        const { materializer, calls } = makeMaterializer(null);
        await materializer.handleMealLogged(mealEvent({ mealLogId: 'm1', loggedAt: isoDaysAgo(0) }));

        expect(calls).toHaveLength(1);
        // No boolean verdict → no sample appended → neutral mean, NOT 0.
        expect(calls[0].create.last7DaysAdherence).toBe(1.0);
        expect(calls[0].update.last7DaysAdherence).toBe(1.0);
        // The window must stay empty (no synthesized false sample persisted).
        expect(calls[0].create.adherenceSamples).toEqual([]);
        expect(calls[0].update.adherenceSamples).toEqual([]);
    });

    it('a missing isAdherent does NOT drag down an existing all-adherent window', async () => {
        const existing: StoredSample[] = [{ at: isoDaysAgo(1), adherent: true }];
        const { materializer, calls } = makeMaterializer(existing);
        await materializer.handleMealLogged(mealEvent({ mealLogId: 'm2', loggedAt: isoDaysAgo(0) }));

        // The undefined event adds nothing; the one real (true) day → mean 1.0.
        expect(calls[0].update.last7DaysAdherence).toBe(1.0);
        // No new sample appended for the undefined verdict.
        expect((calls[0].update.adherenceSamples as StoredSample[]).length).toBe(1);
    });

    it('an explicit false IS recorded and pulls the mean below 1.0', async () => {
        const existing: StoredSample[] = [{ at: isoDaysAgo(1), adherent: true }];
        const { materializer, calls } = makeMaterializer(existing);
        await materializer.handleMealLogged(
            mealEvent({ mealLogId: 'm3', loggedAt: isoDaysAgo(0), isAdherent: false }),
        );

        // Two distinct days: one true, one false → mean 0.5.
        expect(calls[0].update.last7DaysAdherence).toBe(0.5);
        expect((calls[0].update.adherenceSamples as StoredSample[]).length).toBe(2);
    });
});

describe('state-service materializer — handleMealLogged per-day dedup', () => {
    it('many meals on the SAME day count as ONE day (mean is per-day, not per-event)', async () => {
        // Three adherent meals already stored on the same UTC day, plus a fourth
        // NON-adherent meal arriving the same day. Per-EVENT the mean would be
        // 3/4 = 0.75; per-DAY it is the day's latest verdict (false) → 0.
        const existing: StoredSample[] = [
            { at: isoDaysAgo(0, 8), adherent: true },
            { at: isoDaysAgo(0, 9), adherent: true },
            { at: isoDaysAgo(0, 10), adherent: true },
        ];
        const { materializer, calls } = makeMaterializer(existing);
        await materializer.handleMealLogged(
            mealEvent({ mealLogId: 'm4', loggedAt: isoDaysAgo(0, 11), isAdherent: false }),
        );

        // One calendar day, latest verdict false → mean 0 (NOT the per-event 0.75).
        expect(calls[0].update.last7DaysAdherence).toBe(0);
    });

    it('one adherent + one non-adherent DAY average to 0.5 regardless of meal counts', async () => {
        // Day A (2 days ago): 3 adherent meals. Day B (1 day ago): 1 non-adherent.
        const existing: StoredSample[] = [
            { at: isoDaysAgo(2, 8), adherent: true },
            { at: isoDaysAgo(2, 9), adherent: true },
            { at: isoDaysAgo(2, 10), adherent: true },
            { at: isoDaysAgo(1, 12), adherent: false },
        ];
        const { materializer, calls } = makeMaterializer(existing);
        // A new adherent meal today (day C) → 3 days: true, false, true → 2/3.
        await materializer.handleMealLogged(
            mealEvent({ mealLogId: 'm5', loggedAt: isoDaysAgo(0, 12), isAdherent: true }),
        );

        expect(calls[0].update.last7DaysAdherence).toBeCloseTo(2 / 3, 10);
    });

    it("a day's LATEST verdict wins when verdicts conflict within the day", async () => {
        // Same day: adherent early, then non-adherent later. Samples are appended
        // in chronological order, so the latest (false) is the day's verdict.
        const existing: StoredSample[] = [{ at: isoDaysAgo(0, 8), adherent: true }];
        const { materializer, calls } = makeMaterializer(existing);
        await materializer.handleMealLogged(
            mealEvent({ mealLogId: 'm6', loggedAt: isoDaysAgo(0, 20), isAdherent: false }),
        );

        // One day, latest verdict false → 0.
        expect(calls[0].update.last7DaysAdherence).toBe(0);
    });
});

describe('state-service materializer — handleMealLogged window pruning still works', () => {
    it('samples older than 7 days are dropped from both the window and the mean', async () => {
        const existing: StoredSample[] = [
            { at: isoDaysAgo(20), adherent: false }, // stale → pruned
            { at: isoDaysAgo(1), adherent: true },
        ];
        const { materializer, calls } = makeMaterializer(existing);
        await materializer.handleMealLogged(
            mealEvent({ mealLogId: 'm7', loggedAt: isoDaysAgo(0), isAdherent: true }),
        );

        // Stale false dropped; two in-window adherent days → mean 1.0.
        expect(calls[0].update.last7DaysAdherence).toBe(1.0);
        const persisted = calls[0].update.adherenceSamples as StoredSample[];
        expect(persisted.every((s) => Date.parse(s.at) >= Date.now() - 7 * 24 * 60 * 60 * 1000)).toBe(true);
    });
});
