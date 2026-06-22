/**
 * computeCycleStatsFromLogs() + buildCycleHistory() — PURE stats/history suite.
 *
 * Locks the LEARN-FROM-THE-USER derivation (src/utils/cycleHistory.ts) that feeds
 * POST /v1/users/me/cycle/period (recompute) and GET /me/cycle/history. The
 * function must:
 *   - learn avgCycleLength from consecutive start-to-start gaps (NOT the 28/14
 *     template) once 2+ starts exist,
 *   - label IRREGULAR on high variance / out-of-band gaps,
 *   - degrade gracefully on a single log (null cycle length, UNKNOWN regularity)
 *     and empty input,
 *   - learn avgPeriodLength from logs that carry an endDate.
 *
 * Pure — no DB/Redis/Fastify. All dates UTC date-only.
 */
import {
    computeCycleStatsFromLogs,
    buildCycleHistory,
    PeriodLogInput,
} from '../src/utils/cycleHistory';

describe('computeCycleStatsFromLogs() — regular history', () => {
    it('learns avgCycleLength=28 from evenly spaced starts (REGULAR, low SD)', () => {
        const logs: PeriodLogInput[] = [
            { startDate: '2026-01-01' },
            { startDate: '2026-01-29' }, // +28
            { startDate: '2026-02-26' }, // +28
            { startDate: '2026-03-26' }, // +28
        ];
        const s = computeCycleStatsFromLogs(logs);
        expect(s.avgCycleLengthDays).toBe(28);
        expect(s.cycleRegularity).toBe('REGULAR');
        expect(s.cycleLengthStdDev).toBe(0);
        expect(s.loggedCycleCount).toBe(4);
        expect(s.lastPeriodStartDate?.toISOString().slice(0, 10)).toBe('2026-03-26');
    });

    it('learns the USER own length (31), not the 28 template', () => {
        const logs: PeriodLogInput[] = [
            { startDate: '2026-01-01' },
            { startDate: '2026-02-01' }, // +31
            { startDate: '2026-03-04' }, // +31
        ];
        const s = computeCycleStatsFromLogs(logs);
        expect(s.avgCycleLengthDays).toBe(31);
        expect(s.cycleRegularity).toBe('REGULAR');
    });

    it('learns avgPeriodLength from logged endDates (inclusive)', () => {
        const logs: PeriodLogInput[] = [
            { startDate: '2026-01-01', endDate: '2026-01-05' }, // 5 days inclusive
            { startDate: '2026-01-29', endDate: '2026-02-01' }, // 4 days inclusive
        ];
        const s = computeCycleStatsFromLogs(logs);
        // mean(5,4)=4.5 -> round 5
        expect(s.avgPeriodLengthDays).toBe(5);
    });
});

describe('computeCycleStatsFromLogs() — irregular / high variance', () => {
    it('flags IRREGULAR when SD of gaps is high', () => {
        const logs: PeriodLogInput[] = [
            { startDate: '2026-01-01' },
            { startDate: '2026-01-23' }, // +22
            { startDate: '2026-02-28' }, // +36
            { startDate: '2026-03-22' }, // +22
        ];
        const s = computeCycleStatsFromLogs(logs);
        expect(s.cycleRegularity).toBe('IRREGULAR');
        expect(s.cycleLengthStdDev).not.toBeNull();
        expect(s.cycleLengthStdDev! > 7).toBe(true);
    });

    it('flags IRREGULAR when a gap is physiologically out of band (skipped cycle)', () => {
        const logs: PeriodLogInput[] = [
            { startDate: '2026-01-01' },
            { startDate: '2026-01-29' }, // +28
            { startDate: '2026-04-01' }, // +62 (skipped cycle) -> out of band
        ];
        const s = computeCycleStatsFromLogs(logs);
        expect(s.cycleRegularity).toBe('IRREGULAR');
    });
});

describe('computeCycleStatsFromLogs() — degenerate inputs', () => {
    it('single log: no computable cycle length, UNKNOWN regularity, but lastStart set', () => {
        const s = computeCycleStatsFromLogs([{ startDate: '2026-06-01' }]);
        expect(s.avgCycleLengthDays).toBeNull();
        expect(s.cycleLengthStdDev).toBeNull();
        expect(s.cycleRegularity).toBe('UNKNOWN');
        expect(s.loggedCycleCount).toBe(1);
        expect(s.lastPeriodStartDate?.toISOString().slice(0, 10)).toBe('2026-06-01');
    });

    it('empty: all null / UNKNOWN / count 0', () => {
        const s = computeCycleStatsFromLogs([]);
        expect(s.avgCycleLengthDays).toBeNull();
        expect(s.avgPeriodLengthDays).toBeNull();
        expect(s.cycleLengthStdDev).toBeNull();
        expect(s.cycleRegularity).toBe('UNKNOWN');
        expect(s.lastPeriodStartDate).toBeNull();
        expect(s.loggedCycleCount).toBe(0);
    });

    it('two starts on the SAME day collapse (no 0-day cycle)', () => {
        const s = computeCycleStatsFromLogs([
            { startDate: '2026-06-01' },
            { startDate: '2026-06-01' },
        ]);
        expect(s.loggedCycleCount).toBe(1);
        expect(s.avgCycleLengthDays).toBeNull();
    });

    it('unsorted input is normalized (order-independent)', () => {
        const s = computeCycleStatsFromLogs([
            { startDate: '2026-03-26' },
            { startDate: '2026-01-01' },
            { startDate: '2026-02-26' },
            { startDate: '2026-01-29' },
        ]);
        expect(s.avgCycleLengthDays).toBe(28);
        expect(s.lastPeriodStartDate?.toISOString().slice(0, 10)).toBe('2026-03-26');
    });

    it('drops unparseable rows', () => {
        const s = computeCycleStatsFromLogs([
            { startDate: 'not-a-date' },
            { startDate: '2026-01-01' },
            { startDate: '2026-01-29' },
        ]);
        expect(s.loggedCycleCount).toBe(2);
        expect(s.avgCycleLengthDays).toBe(28);
    });
});

describe('buildCycleHistory()', () => {
    it('returns each cycle length + period length, most-recent first, last cycle length null', () => {
        const logs: PeriodLogInput[] = [
            { startDate: '2026-01-01', endDate: '2026-01-05' },
            { startDate: '2026-01-29', endDate: '2026-02-02' },
            { startDate: '2026-02-26' }, // no end logged
        ];
        const h = buildCycleHistory(logs);
        expect(h).toHaveLength(3);
        // most-recent first
        expect(h[0].startDate).toBe('2026-02-26');
        expect(h[0].cycleLengthDays).toBeNull(); // newest cycle: no next start
        expect(h[0].periodLengthDays).toBeNull(); // no end logged
        expect(h[1].startDate).toBe('2026-01-29');
        expect(h[1].cycleLengthDays).toBe(28);
        expect(h[1].periodLengthDays).toBe(5);
        expect(h[2].startDate).toBe('2026-01-01');
        expect(h[2].cycleLengthDays).toBe(28);
        expect(h[2].periodLengthDays).toBe(5);
    });

    it('empty -> []', () => {
        expect(buildCycleHistory([])).toEqual([]);
    });
});
