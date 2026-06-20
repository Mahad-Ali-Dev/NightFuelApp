/**
 * updatePreferences persistence suite — proves NotificationService.updatePreferences
 * WRITES every field the request schema (updatePreferencesSchema) accepts.
 *
 * The live bug this locks: updatePreferences only spread 6 of the 11 schema-
 * accepted preference fields into the Prisma `update` payload —
 * mealReminderEnabled / shiftAlertEnabled / planReadyEnabled /
 * adherenceAlertEnabled / quietHoursStart / quietHoursEnd — silently DROPPING
 * workoutReminderEnabled, sleepReminderEnabled, streakUpdateEnabled,
 * weeklyReportEnabled and coachMessageEnabled. Toggling any of those 5 in the
 * app returned 200 but never persisted (the value reverted on reload).
 *
 * Strategy — Prisma stub capture: updatePreferences is a thin partial-update
 * passthrough, so the contract that matters is the exact `data` object handed to
 * `prisma.notificationPreference.update`. We instantiate the REAL service with a
 * minimal in-memory Prisma double whose `update` records its argument, drive a
 * real call, and assert on the captured `data`. No DB is touched — the bug was a
 * missing object spread, and the `update` payload is precisely where it lived, so
 * asserting there is what catches a regression (a re-dropped field).
 *
 * `upsert` is stubbed too because updatePreferences calls getOrCreatePreferences
 * (which upserts) before updating; its argument is irrelevant to this contract.
 */
import { NotificationService } from '../src/notification.service';
import type { UpdatePreferencesBody } from '../src/schemas';

const USER_ID = '44444444-4444-4444-4444-444444444444';

// The five fields the live bug silently dropped — toggling them returned 200 but
// never persisted. This list is the heart of the regression.
const PREVIOUSLY_DROPPED = [
    'workoutReminderEnabled',
    'sleepReminderEnabled',
    'streakUpdateEnabled',
    'weeklyReportEnabled',
    'coachMessageEnabled',
] as const;

// Every boolean toggle the request schema accepts (the type-flag fields). Kept
// in lockstep with updatePreferencesSchema in src/schemas.ts.
const ALL_BOOLEAN_FIELDS = [
    'mealReminderEnabled',
    'shiftAlertEnabled',
    'planReadyEnabled',
    'adherenceAlertEnabled',
    ...PREVIOUSLY_DROPPED,
] as const;

/**
 * Minimal Prisma double: `update` captures the args it was called with and
 * echoes back a plausible row; `upsert` is a no-op the pre-update
 * getOrCreatePreferences call needs. Only the `notificationPreference` delegate
 * is modelled — nothing else is exercised by updatePreferences.
 */
function makePrismaStub() {
    const update = jest.fn(async (args: any) => ({ id: 'pref-1', userId: USER_ID, ...args.data }));
    const upsert = jest.fn(async () => ({ id: 'pref-1', userId: USER_ID }));
    const prisma = {
        notificationPreference: { update, upsert },
    };
    return { prisma, update, upsert };
}

describe('notification-service — updatePreferences persists every schema-accepted field', () => {
    it('writes ALL five previously-dropped toggles into the Prisma update payload', async () => {
        const { prisma, update } = makePrismaStub();
        const service = new NotificationService(prisma as any);

        // Flip every previously-dropped flag to a NON-default value so a silent
        // drop would be observable (defaults are all `true`).
        const body: UpdatePreferencesBody = {
            workoutReminderEnabled: false,
            sleepReminderEnabled: false,
            streakUpdateEnabled: false,
            weeklyReportEnabled: false,
            coachMessageEnabled: false,
        };

        await service.updatePreferences(USER_ID, body);

        expect(update).toHaveBeenCalledTimes(1);
        const data = update.mock.calls[0][0].data;
        for (const field of PREVIOUSLY_DROPPED) {
            // Present AND carrying the requested value — not merely defined.
            expect(data).toHaveProperty(field, false);
        }
    });

    it('persists every boolean toggle the schema accepts when all are provided', async () => {
        const { prisma, update } = makePrismaStub();
        const service = new NotificationService(prisma as any);

        // Toggle all eleven schema fields at once with distinguishable values.
        const body: UpdatePreferencesBody = {
            mealReminderEnabled: false,
            shiftAlertEnabled: true,
            planReadyEnabled: false,
            adherenceAlertEnabled: true,
            workoutReminderEnabled: false,
            sleepReminderEnabled: true,
            streakUpdateEnabled: false,
            weeklyReportEnabled: true,
            coachMessageEnabled: false,
            quietHoursStart: '23:30',
            quietHoursEnd: '06:15',
        };

        await service.updatePreferences(USER_ID, body);

        const data = update.mock.calls[0][0].data;
        // Every boolean toggle round-trips with its exact requested value.
        for (const field of ALL_BOOLEAN_FIELDS) {
            expect(data).toHaveProperty(field, body[field]);
        }
        // The non-boolean (time) fields persist too — no field is left behind.
        expect(data).toHaveProperty('quietHoursStart', '23:30');
        expect(data).toHaveProperty('quietHoursEnd', '06:15');
        // The whole accepted surface was written: 11 fields, nothing extra.
        expect(Object.keys(data).sort()).toEqual(
            [...ALL_BOOLEAN_FIELDS, 'quietHoursStart', 'quietHoursEnd'].sort(),
        );
    });

    it('preserves partial-update semantics — an omitted field is NOT written', async () => {
        const { prisma, update } = makePrismaStub();
        const service = new NotificationService(prisma as any);

        // Provide ONLY one of the previously-dropped fields; the others (and the
        // originally-handled ones) must be absent from the update payload so a
        // partial PUT never clobbers untouched columns.
        const body: UpdatePreferencesBody = { coachMessageEnabled: true };

        await service.updatePreferences(USER_ID, body);

        const data = update.mock.calls[0][0].data;
        expect(data).toEqual({ coachMessageEnabled: true });
        // Spot-check: a sibling previously-dropped field and an original field are
        // both absent because they were not in the request.
        expect(data).not.toHaveProperty('weeklyReportEnabled');
        expect(data).not.toHaveProperty('mealReminderEnabled');
    });

    it('updates the row for the requesting user by userId', async () => {
        const { prisma, update } = makePrismaStub();
        const service = new NotificationService(prisma as any);

        await service.updatePreferences(USER_ID, { sleepReminderEnabled: false });

        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { userId: USER_ID } }),
        );
    });
});
