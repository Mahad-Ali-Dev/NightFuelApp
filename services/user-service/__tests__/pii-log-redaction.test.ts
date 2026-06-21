/**
 * Regression suite — PII-in-logs redaction (HIGH #9 / MEDIUM #14).
 *
 * Background: UserService.updateProfile previously logged the full profile-update
 * `data` payload on error (logger.error({ userId, err, data })) — and dumped it to
 * a dev file — which includes GDPR Art.9 special-category fields (menstrual-cycle,
 * period, health). updatePreferences likewise logged the raw request `body`
 * (allergies, injury-safe mode, dietary preference).
 *
 * The fix logs ONLY userId + the error + a REDACTED set of field NAMES
 * (`fields: Object.keys(...)`), never the field VALUES. This suite spies the
 * service-module logger and asserts:
 *   - the error log carries userId, err and a `fields` array of names, and
 *   - none of the sensitive VALUES appear anywhere in the logged arguments.
 *
 * Strategy: `@nightfuel/config` is mocked so `createLogger` returns a shared spy
 * logger BEFORE the service module is imported (the service captures its logger in
 * a module-level const at import time). A fake Prisma whose upsert rejects drives
 * the catch branch. No DB / Redis is touched.
 */

// The mocked createLogger returns a single shared spy logger. The factory is
// hoisted above all top-level consts, so it BUILDS the spy itself (prefixed
// `mock*` to satisfy jest's out-of-scope guard) and we retrieve it after import
// via the mocked module.
jest.mock('@nightfuel/config', () => {
    const mockSharedLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        fatal: jest.fn(),
        trace: jest.fn(),
    };
    return {
        createLogger: () => mockSharedLogger,
        __mockSharedLogger: mockSharedLogger,
    };
});

// fs is mocked so the dev-only debug dump in updateProfile never touches disk and
// so we can assert the dumped payload is also redacted.
jest.mock('fs', () => ({
    appendFileSync: jest.fn(),
}));

import fs from 'fs';
import * as config from '@nightfuel/config';
import { UserService } from '../src/user.service';

// The shared spy logger the service module captured at import time.
const mockLogger = (config as any).__mockSharedLogger as {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    fatal: jest.Mock;
    trace: jest.Mock;
};

const USER_ID = '55555555-5555-5555-5555-555555555555';

// Sensitive VALUES that must NEVER appear in any log argument.
const SENSITIVE_VALUES = [
    '2026-06-01', // lastPeriodStartDate
    '28',         // avgCycleLengthDays (as string)
    'IRREGULAR',  // cycleRegularity
    'peanuts',    // allergies
];

/** Recursively stringify everything passed to logger.error / fs.appendFileSync. */
function dumpCalls(mockFn: jest.Mock): string {
    return mockFn.mock.calls
        .map((args) => args.map((a) => safeStringify(a)).join(' '))
        .join('\n');
}

function safeStringify(v: unknown): string {
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('UserService.updateProfile — PII-in-logs redaction (HIGH #9)', () => {
    function buildServiceWithFailingUpsert() {
        const prisma: any = {
            userProfile: {
                upsert: jest.fn().mockRejectedValue(new Error('Prisma boom')),
            },
        };
        // RedisEventBus is only a type in the constructor signature — pass a stub.
        return new UserService(prisma, {} as any);
    }

    it('does NOT log special-category VALUES; logs userId + field NAMES only', async () => {
        const svc = buildServiceWithFailingUpsert();

        await expect(
            svc.updateProfile(USER_ID, {
                cycleTrackingEnabled: true,
                avgCycleLengthDays: 28,
                cycleRegularity: 'IRREGULAR',
                lastPeriodStartDate: '2026-06-01',
            } as any),
        ).rejects.toThrow();

        // The catch-branch error log fired.
        expect(mockLogger.error).toHaveBeenCalled();
        const logged = dumpCalls(mockLogger.error);

        // userId is present; field NAMES are present.
        expect(logged).toContain(USER_ID);
        expect(logged).toContain('cycleRegularity');
        expect(logged).toContain('lastPeriodStartDate');

        // No sensitive VALUE leaks into the logs.
        for (const val of SENSITIVE_VALUES) {
            expect(logged).not.toContain(val);
        }
        // The raw `data` key must not be logged as a payload object.
        for (const call of mockLogger.error.mock.calls) {
            const meta = call[0] ?? {};
            expect(meta).not.toHaveProperty('data');
        }
    });

    it('the dev-only file dump is also redacted (no payload values)', async () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        try {
            const svc = buildServiceWithFailingUpsert();
            await expect(
                svc.updateProfile(USER_ID, {
                    avgCycleLengthDays: 28,
                    lastPeriodStartDate: '2026-06-01',
                } as any),
            ).rejects.toThrow();

            const dumped = dumpCalls(fs.appendFileSync as unknown as jest.Mock);
            expect(dumped).toContain('fields');
            for (const val of SENSITIVE_VALUES) {
                expect(dumped).not.toContain(val);
            }
        } finally {
            process.env.NODE_ENV = prev;
        }
    });
});

describe('UserService.updatePreferences — PII-in-logs redaction (MEDIUM #14)', () => {
    function buildServiceWithFailingPrefsUpsert() {
        const prisma: any = {
            userPreferences: {
                upsert: jest.fn().mockRejectedValue(new Error('Prisma boom')),
            },
        };
        return new UserService(prisma, {} as any);
    }

    it('does NOT log allergies / injury-safe / dietary VALUES; logs field NAMES only', async () => {
        const svc = buildServiceWithFailingPrefsUpsert();

        await expect(
            svc.updatePreferences(USER_ID, {
                allergies: ['peanuts'],
                isInjurySafeMode: true,
                dietaryPreference: 'VEGAN',
            } as any),
        ).rejects.toThrow();

        expect(mockLogger.error).toHaveBeenCalled();
        const logged = dumpCalls(mockLogger.error);

        expect(logged).toContain(USER_ID);
        expect(logged).toContain('allergies');     // NAME present
        expect(logged).not.toContain('peanuts');   // VALUE absent

        // The raw `body` must not be logged as a payload object.
        for (const call of mockLogger.error.mock.calls) {
            const meta = call[0] ?? {};
            expect(meta).not.toHaveProperty('body');
        }
    });
});
