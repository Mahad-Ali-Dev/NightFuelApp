/**
 * Tests for the PURE health-sync mapping core (src/lib/healthSyncMap.ts).
 *
 * This is the module that fixes the root cause the F31 device path had ZERO
 * coverage for: the RAW HealthKit / Health-Connect platform samples → normalized
 * one-session-per-night sleep, with a synthesized baseline quality, awakening-
 * derived disturbances, and the incremental / most-recent-night twin-feed
 * decision. It imports NOTHING native, so it runs directly on the jest gate with
 * fixtures that mirror the ACTUAL adapter output.
 *
 * Defects exercised:
 *   D1 — a fragmented HealthKit night with NO quality collapses to one session
 *        WITH a synthesized quality (the refinement now has something to move).
 *   D2 — fragmentation collapses to one session/night; a multi-night 7-day window
 *        feeds ONLY the latest night to the live twin; Android one-per-night
 *        normalizes the same way; repeated syncs of the same window re-fire NOTHING.
 *   D4 — synthesized quality is floored at 1 / capped at 10.
 */
import {
  collapseHealthKitNights,
  normalizeHealthConnectNights,
  selectLiveSleepNights,
  synthesizeQuality,
  mapHealthKitSleepSamples,
  mapHealthConnectSleepSamples,
  DEFAULT_SLEEP_QUALITY,
  MIN_SLEEP_QUALITY,
  MAX_SLEEP_QUALITY,
  type RawHkSleepSample,
  type RawHcSleepSession,
} from '@/lib/healthSyncMap';

// HealthKit sleepAnalysis category values.
const IN_BED = 0;
const AWAKE = 2;
const ASLEEP_CORE = 3;
const ASLEEP_DEEP = 4;
const ASLEEP_REM = 5;

const iso = (s: string) => new Date(s).toISOString();

/**
 * A REALISTIC fragmented HealthKit night: one in-bed envelope plus many per-stage
 * asleep segments and two mid-night awake segments — NONE carrying a quality.
 * 23:00→07:00 in bed (8h); ~7h asleep across stages; 2 awakenings.
 */
function fragmentedHkNight(dayStart: string): RawHkSleepSample[] {
  return [
    { startDate: `${dayStart}T23:00:00.000Z`, endDate: `${dayStart}T23:10:00.000Z`, value: IN_BED },
    { startDate: `${dayStart}T23:10:00.000Z`, endDate: `${dayStart}T23:55:00.000Z`, value: ASLEEP_CORE },
    { startDate: `${dayStart}T23:55:00.000Z`, endDate: `${dayStart}T23:58:00.000Z`, value: AWAKE },
    { startDate: `${dayStart}T23:58:00.000Z`, endDate: nextDay(dayStart, '02:30'), value: ASLEEP_DEEP },
    { startDate: nextDay(dayStart, '02:30'), endDate: nextDay(dayStart, '02:35'), value: AWAKE },
    { startDate: nextDay(dayStart, '02:35'), endDate: nextDay(dayStart, '05:00'), value: ASLEEP_CORE },
    { startDate: nextDay(dayStart, '05:00'), endDate: nextDay(dayStart, '07:00'), value: ASLEEP_REM },
  ];
}
function nextDay(dayStart: string, hhmm: string): string {
  const d = new Date(`${dayStart}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const [h, m] = hhmm.split(':');
  d.setUTCHours(Number(h), Number(m), 0, 0);
  return d.toISOString();
}

describe('synthesizeQuality', () => {
  it('high efficiency → high quality, low efficiency → lower quality, both clamped 1..10', () => {
    const hour = 60 * 60 * 1000;
    const high = synthesizeQuality(7.6 * hour, 8 * hour); // 95% efficiency
    const low = synthesizeQuality(5 * hour, 8 * hour); // ~62% efficiency
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(MAX_SLEEP_QUALITY);
    expect(low).toBeGreaterThanOrEqual(MIN_SLEEP_QUALITY);
  });

  it('falls back to the manual-log default (7) when in-bed time is unknown', () => {
    expect(synthesizeQuality(8 * 3600_000, 0)).toBe(DEFAULT_SLEEP_QUALITY);
    expect(synthesizeQuality(0, 0)).toBe(DEFAULT_SLEEP_QUALITY);
  });
});

describe('collapseHealthKitNights (D2 fragmentation + D1 quality synthesis)', () => {
  it('collapses a fragmented night (many stage segments, no quality) into ONE session WITH a quality', () => {
    const nights = collapseHealthKitNights(fragmentedHkNight('2026-06-15'));
    expect(nights).toHaveLength(1);
    const n = nights[0]!;
    expect(n.startTime).toBe(iso('2026-06-15T23:00:00.000Z'));
    expect(n.endTime).toBe(iso('2026-06-16T07:00:00.000Z'));
    // Quality was synthesized (the raw samples had none) and is in-range.
    expect(n.quality).toBeGreaterThanOrEqual(MIN_SLEEP_QUALITY);
    expect(n.quality).toBeLessThanOrEqual(MAX_SLEEP_QUALITY);
    // Two AWAKE segments → two disturbances.
    expect(n.disturbances).toBe(2);
  });

  it('splits two separate nights (gap > 3h) into two sessions', () => {
    const two = [...fragmentedHkNight('2026-06-15'), ...fragmentedHkNight('2026-06-16')];
    const nights = collapseHealthKitNights(two);
    expect(nights).toHaveLength(2);
    expect(nights[0]!.startTime).toBe(iso('2026-06-15T23:00:00.000Z'));
    expect(nights[1]!.startTime).toBe(iso('2026-06-16T23:00:00.000Z'));
  });

  it('drops unparseable / inverted segments without throwing', () => {
    const raw: RawHkSleepSample[] = [
      { startDate: 'not-a-date', endDate: 'nope', value: ASLEEP_CORE },
      { startDate: '2026-06-15T07:00:00.000Z', endDate: '2026-06-15T06:00:00.000Z', value: ASLEEP_CORE }, // inverted
    ];
    expect(collapseHealthKitNights(raw)).toEqual([]);
  });
});

describe('normalizeHealthConnectNights (Android one-per-night)', () => {
  it('normalizes a one-per-night SleepSession into the same model with a synthesized quality', () => {
    const raw: RawHcSleepSession[] = [
      { startTime: '2026-06-15T23:00:00.000Z', endTime: '2026-06-16T07:00:00.000Z' },
    ];
    const nights = normalizeHealthConnectNights(raw);
    expect(nights).toHaveLength(1);
    expect(nights[0]!.startTime).toBe(iso('2026-06-15T23:00:00.000Z'));
    expect(nights[0]!.quality).toBeGreaterThanOrEqual(MIN_SLEEP_QUALITY);
    expect(nights[0]!.disturbances).toBe(0); // no stage breakdown → no awakenings
  });

  it('counts awake stages as disturbances when a stage breakdown is present', () => {
    const raw: RawHcSleepSession[] = [
      {
        startTime: '2026-06-15T23:00:00.000Z',
        endTime: '2026-06-16T07:00:00.000Z',
        stages: [
          { stage: 'STAGE_TYPE_SLEEPING', startTime: '2026-06-15T23:00:00.000Z', endTime: '2026-06-16T02:00:00.000Z' },
          { stage: 'STAGE_TYPE_AWAKE', startTime: '2026-06-16T02:00:00.000Z', endTime: '2026-06-16T02:10:00.000Z' },
          { stage: 'STAGE_TYPE_SLEEPING', startTime: '2026-06-16T02:10:00.000Z', endTime: '2026-06-16T07:00:00.000Z' },
        ],
      },
    ];
    const nights = normalizeHealthConnectNights(raw);
    expect(nights[0]!.disturbances).toBe(1);
  });
});

describe('selectLiveSleepNights (D2 most-recent / incremental twin feed)', () => {
  const week = [
    { startTime: '2026-06-14T23:00:00.000Z', endTime: '2026-06-15T07:00:00.000Z', quality: 7, disturbances: 0 },
    { startTime: '2026-06-15T23:00:00.000Z', endTime: '2026-06-16T07:00:00.000Z', quality: 7, disturbances: 0 },
    { startTime: '2026-06-16T23:00:00.000Z', endTime: '2026-06-17T07:00:00.000Z', quality: 7, disturbances: 0 },
  ];

  it('with no prior sync, feeds ONLY the most-recent night to the twin (no 7-night fan-out)', () => {
    const live = selectLiveSleepNights(week, null);
    expect(live).toHaveLength(1);
    expect(live[0]!.startTime).toBe('2026-06-16T23:00:00.000Z');
  });

  it('repeated sync of the SAME window (lastSyncedAt after the latest night) fires NOTHING', () => {
    // Already synced through 2026-06-17 morning → the latest night is not strictly after.
    const live = selectLiveSleepNights(week, '2026-06-17T09:00:00.000Z');
    expect(live).toEqual([]);
  });

  it('a NEW night strictly after lastSyncedAt feeds the twin', () => {
    const live = selectLiveSleepNights(week, '2026-06-16T08:00:00.000Z');
    expect(live).toHaveLength(1);
    expect(live[0]!.startTime).toBe('2026-06-16T23:00:00.000Z');
  });
});

describe('mapHealthKitSleepSamples (end-to-end pure pipeline)', () => {
  it('a fragmented 7-day window → ONE wire sleep sample for the latest night, with quality + disturbances', () => {
    const raw = [
      ...fragmentedHkNight('2026-06-14'),
      ...fragmentedHkNight('2026-06-15'),
      ...fragmentedHkNight('2026-06-16'),
    ];
    const samples = mapHealthKitSleepSamples(raw, null);
    expect(samples).toHaveLength(1);
    const s = samples[0]!;
    expect(s.kind).toBe('sleep');
    expect(s.source).toBe('apple_health');
    expect(s.startTime).toBe(iso('2026-06-16T23:00:00.000Z'));
    expect(typeof s.quality).toBe('number');
    expect(s.quality).toBeGreaterThanOrEqual(MIN_SLEEP_QUALITY);
    expect(s.quality).toBeLessThanOrEqual(MAX_SLEEP_QUALITY);
    expect(s.disturbances).toBe(2);
  });

  it('repeated sync of the same window emits NO sleep sample (no double-count)', () => {
    const raw = fragmentedHkNight('2026-06-16');
    const samples = mapHealthKitSleepSamples(raw, '2026-06-17T09:00:00.000Z');
    expect(samples).toEqual([]);
  });
});

describe('mapHealthConnectSleepSamples (end-to-end pure pipeline)', () => {
  it('a multi-night window → ONE wire sleep sample for the latest night (google_fit)', () => {
    const raw: RawHcSleepSession[] = [
      { startTime: '2026-06-14T23:00:00.000Z', endTime: '2026-06-15T07:00:00.000Z' },
      { startTime: '2026-06-15T23:00:00.000Z', endTime: '2026-06-16T07:00:00.000Z' },
    ];
    const samples = mapHealthConnectSleepSamples(raw, null);
    expect(samples).toHaveLength(1);
    expect(samples[0]!.source).toBe('google_fit');
    expect(samples[0]!.startTime).toBe(iso('2026-06-15T23:00:00.000Z'));
    expect(typeof samples[0]!.quality).toBe('number');
  });
});
