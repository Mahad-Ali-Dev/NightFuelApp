// Tests for the shared data-retention helper in @nightfuel/config (F34 #17).
//
// Locks the two invariants the whole DEFAULT-OFF mechanism rests on:
//   1. retentionEnabled is true ONLY for a finite number > 0 — every "off"
//      value (0, negative, NaN, Infinity, undefined/null) is DISABLED.
//   2. retentionCutoff = now - retentionDays days, exactly, deterministically
//      (now injected), and throws rather than computing a future cutoff when
//      called with a non-positive window (which would risk deleting recent data).
//
// Imported from the package entrypoint (NOT a deep src/ path) so this also
// asserts the export wiring through dist/index.js.
import { retentionEnabled, retentionCutoff } from '@nightfuel/config';

const MS_PER_DAY = 86_400_000;

describe('retentionEnabled (the default-off guard)', () => {
    it('is true ONLY for a finite number > 0', () => {
        expect(retentionEnabled(1)).toBe(true);
        expect(retentionEnabled(30)).toBe(true);
        expect(retentionEnabled(0.5)).toBe(true);
    });

    it('is false for 0 (the default), negatives, and non-finite values → DISABLED', () => {
        expect(retentionEnabled(0)).toBe(false);
        expect(retentionEnabled(-1)).toBe(false);
        expect(retentionEnabled(NaN)).toBe(false);
        expect(retentionEnabled(Infinity)).toBe(false);
    });

    it('is false for an unset window (undefined / null)', () => {
        expect(retentionEnabled(undefined)).toBe(false);
        expect(retentionEnabled(null)).toBe(false);
    });
});

describe('retentionCutoff', () => {
    it('returns exactly now - retentionDays days (deterministic with injected now)', () => {
        const now = new Date('2026-06-20T12:00:00.000Z');
        const cutoff = retentionCutoff(30, now);
        expect(cutoff.toISOString()).toBe('2026-05-21T12:00:00.000Z');
        expect(now.getTime() - cutoff.getTime()).toBe(30 * MS_PER_DAY);
    });

    it('a 1-day window puts the cutoff exactly 24h before now', () => {
        const now = new Date('2026-01-02T00:00:00.000Z');
        expect(retentionCutoff(1, now).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });

    it('throws for a non-positive window (guard with retentionEnabled first)', () => {
        const now = new Date('2026-06-20T12:00:00.000Z');
        expect(() => retentionCutoff(0, now)).toThrow();
        expect(() => retentionCutoff(-5, now)).toThrow();
    });
});
