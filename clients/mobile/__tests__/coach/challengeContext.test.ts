import { loadSplitContext, mapForecastToPhases } from '../../src/features/coach/challengeContext';
import type { ChallengeTemplate } from '../../src/features/coach/challengeTemplates';
import { getPreferences } from '@/api/profile';
import { getCycleForecast } from '@/api/cycle';

// Replace the API modules wholesale (no axios / network); challengeContext only
// uses these two runtime exports.
jest.mock('@/api/profile', () => ({ getPreferences: jest.fn() }));
jest.mock('@/api/cycle', () => ({ getCycleForecast: jest.fn() }));

const mockGetPreferences = getPreferences as jest.MockedFunction<typeof getPreferences>;
const mockGetForecast = getCycleForecast as jest.MockedFunction<typeof getCycleForecast>;

/** A minimal template; callers override `split`/`duration`. */
const template = (over: Partial<ChallengeTemplate>): ChallengeTemplate => ({
  id: 't', title: 'T', subtitle: '', tag: '', blurb: '', goal: 'maintain',
  duration: 7, accent: '#000', heroCover: 'recovery', ...over,
});

const TODAY = new Date('2026-07-04T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
/** UTC day key `offset` days from TODAY (matches the forecast wire format). */
const key = (offset: number) => new Date(TODAY.getTime() + offset * DAY).toISOString().slice(0, 10);

beforeEach(() => jest.clearAllMocks());

describe('mapForecastToPhases', () => {
  it('aligns per-day phases to challenge days (index i = day i+1), lowercased', () => {
    const days = [
      { date: key(0), phase: 'FOLLICULAR' },
      { date: key(1), phase: 'FOLLICULAR' },
      { date: key(2), phase: 'OVULATORY' },
    ];
    expect(mapForecastToPhases(days as any, 3, TODAY)).toEqual(['follicular', 'follicular', 'ovulatory']);
  });

  it('carries the last known phase across a missing forecast day', () => {
    const days = [
      { date: key(0), phase: 'FOLLICULAR' },
      { date: key(2), phase: 'OVULATORY' }, // key(1) is absent
    ];
    expect(mapForecastToPhases(days as any, 3, TODAY)).toEqual(['follicular', 'follicular', 'ovulatory']);
  });

  it('seeds a leading gap with the first known phase', () => {
    const days = [{ date: key(1), phase: 'LUTEAL' }]; // key(0) is absent
    expect(mapForecastToPhases(days as any, 2, TODAY)).toEqual(['luteal', 'luteal']);
  });

  it('returns null when nothing is tracked (all UNKNOWN / empty)', () => {
    expect(mapForecastToPhases([{ date: key(0), phase: 'UNKNOWN' }] as any, 1, TODAY)).toBeNull();
    expect(mapForecastToPhases([], 3, TODAY)).toBeNull();
  });
});

describe('loadSplitContext', () => {
  it('returns undefined (and hits no network) for a non-personalized template', async () => {
    expect(await loadSplitContext(template({ split: undefined }))).toBeUndefined();
    expect(mockGetPreferences).not.toHaveBeenCalled();
    expect(mockGetForecast).not.toHaveBeenCalled();
  });

  it('circadian: returns the sleep window when both bounds are set', async () => {
    mockGetPreferences.mockResolvedValue({
      dietaryPreference: 'balanced', sleepWindowStart: '07:00', sleepWindowEnd: '15:00',
      allergies: [], healthConditions: [],
    });
    expect(await loadSplitContext(template({ split: 'circadian' }))).toEqual({
      sleepWindow: { start: '07:00', end: '15:00' },
    });
  });

  it('circadian: returns undefined when the sleep window is unset', async () => {
    mockGetPreferences.mockResolvedValue({
      dietaryPreference: 'balanced', sleepWindowStart: null, sleepWindowEnd: null,
      allergies: [], healthConditions: [],
    });
    expect(await loadSplitContext(template({ split: 'circadian' }))).toBeUndefined();
  });

  it('cycle-sync: maps the forecast to per-day phases (widening months for long plans)', async () => {
    mockGetForecast.mockResolvedValue({
      confidence: 'HIGH', trackingOnly: false, predictedNextPeriodStart: null,
      predictedOvulationDate: null, fertileWindow: null, reason: '',
      days: [
        { date: key(0), phase: 'LUTEAL', confidence: 'HIGH', isPredictedFertile: false, isPredictedOvulation: false, isLogged: false },
        { date: key(1), phase: 'MENSTRUAL', confidence: 'HIGH', isPredictedFertile: false, isPredictedOvulation: false, isLogged: true },
      ],
    } as any);
    const ctx = await loadSplitContext(template({ split: 'cycle-sync', duration: 7 }), TODAY);
    expect(mockGetForecast).toHaveBeenCalledWith(1);
    expect(ctx!.cyclePhases!.slice(0, 2)).toEqual(['luteal', 'menstrual']);
  });

  it('cycle-sync: returns undefined when the forecast tracks nothing', async () => {
    mockGetForecast.mockResolvedValue({
      confidence: 'NONE', trackingOnly: true, predictedNextPeriodStart: null,
      predictedOvulationDate: null, fertileWindow: null, reason: '', days: [],
    } as any);
    expect(await loadSplitContext(template({ split: 'cycle-sync' }), TODAY)).toBeUndefined();
  });

  it('is best-effort: swallows API errors and returns undefined', async () => {
    mockGetPreferences.mockRejectedValue(new Error('offline'));
    expect(await loadSplitContext(template({ split: 'circadian' }))).toBeUndefined();
  });
});
