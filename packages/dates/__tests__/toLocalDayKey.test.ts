// Tests for @nightfuel/dates day-key helpers.
// Each case fixes a single instant in UTC and asserts the local day-key in a
// specific IANA zone. These are the boundary conditions that broke the old
// `slice(0, 10)` pattern in the streak services.

import { toLocalDayKey, toUTCDayKey } from '../src/index';

describe('toLocalDayKey', () => {
    // (a) UTC midnight is the easy baseline — local key in 'UTC' must match the
    // ISO day. If this fails the en-CA formatter assumption is broken.
    it('(a) UTC midnight resolves to the same YYYY-MM-DD in UTC', () => {
        const d = new Date('2026-06-15T00:00:00Z');
        expect(toLocalDayKey(d, 'UTC')).toBe('2026-06-15');
    });

    // (b) 23:30 ET on Dec 31 is 04:30 UTC on Jan 1 — the bug we are fixing.
    // The user's calendar still says Dec 31, so the streak must record Dec 31.
    it('(b) 23:30 America/New_York on Dec 31 keeps the prior-year day key', () => {
        // 23:30 EST (UTC-5) on 2025-12-31 → 04:30 UTC on 2026-01-01.
        const d = new Date('2026-01-01T04:30:00Z');
        expect(toLocalDayKey(d, 'America/New_York')).toBe('2025-12-31');
        // Sanity: the legacy UTC-day behavior would have rolled the streak.
        expect(toUTCDayKey(d)).toBe('2026-01-01');
    });

    // (c) Cross-zone: confirms the formatter honors the requested tz instead of
    // the system tz. Pick an instant that straddles the LA-vs-ET day boundary
    // so the same Date returns different day keys per zone.
    it('(c) cross-zone: same instant has different day keys in LA vs NY', () => {
        // 02:00 EST (UTC-5) on 2026-01-01 → 07:00 UTC.
        // That instant is 23:00 PST (UTC-8) on 2025-12-31 in Los Angeles.
        const d = new Date('2026-01-01T07:00:00Z');
        expect(toLocalDayKey(d, 'America/Los_Angeles')).toBe('2025-12-31');
        expect(toLocalDayKey(d, 'America/New_York')).toBe('2026-01-01');
    });

    // (d) DST spring-forward: 02:00 ET on 2026-03-08 jumps to 03:00. An instant
    // *during* the jump still has a valid local day key.
    it('(d) DST spring-forward 2026-03-08 01:30 America/New_York is 2026-03-08', () => {
        // 01:30 EST (UTC-5) on 2026-03-08 → 06:30 UTC.
        const d = new Date('2026-03-08T06:30:00Z');
        expect(toLocalDayKey(d, 'America/New_York')).toBe('2026-03-08');
    });

    // (e) DST fall-back: 01:30 occurs twice on 2025-11-02 in ET (EDT then EST).
    // Either occurrence must produce the same day key.
    it('(e) DST fall-back 2025-11-02 01:30 America/New_York is 2025-11-02', () => {
        // First 01:30 EDT (UTC-4) → 05:30 UTC.
        const firstPass = new Date('2025-11-02T05:30:00Z');
        // Second 01:30 EST (UTC-5) → 06:30 UTC.
        const secondPass = new Date('2025-11-02T06:30:00Z');
        expect(toLocalDayKey(firstPass, 'America/New_York')).toBe('2025-11-02');
        expect(toLocalDayKey(secondPass, 'America/New_York')).toBe('2025-11-02');
    });

    // (f) Pacific/Auckland is UTC+12 (or +13 in NZDT). At UTC noon the NZ wall
    // clock is already in the next day. This guards the "user in NZ logs a
    // morning workout, but UTC says it's still the previous day" case.
    it('(f) Pacific/Auckland at UTC noon is the next calendar day', () => {
        // 2026-06-15 12:00 UTC. NZ is UTC+12 in June (no DST → NZST).
        // Local wall clock = 2026-06-16 00:00 NZST.
        const d = new Date('2026-06-15T12:00:00Z');
        expect(toLocalDayKey(d, 'Pacific/Auckland')).toBe('2026-06-16');
        // UTC day key still points at the previous day.
        expect(toUTCDayKey(d)).toBe('2026-06-15');
    });

    // (g) Garbage tz must not throw. The helper falls back to the UTC day,
    // matching the legacy slice(0,10) behavior so streak data stays valid.
    it("(g) invalid tz like 'Foo/Bar' falls back to the UTC day key", () => {
        const d = new Date('2026-06-15T12:00:00Z');
        expect(toLocalDayKey(d, 'Foo/Bar')).toBe('2026-06-15');
        expect(toLocalDayKey(d, '')).toBe('2026-06-15');
    });

    // (h) String input — call-sites currently pass DB-row ISO strings. The
    // helper must accept them without an explicit `new Date(...)` at the
    // call-site.
    it("(h) string input '2026-06-16T03:00:00Z' in 'America/Los_Angeles' is 2026-06-15", () => {
        // 03:00 UTC on 2026-06-16 → 20:00 PDT (UTC-7) on 2026-06-15 in LA.
        expect(toLocalDayKey('2026-06-16T03:00:00Z', 'America/Los_Angeles')).toBe('2026-06-15');
    });
});
