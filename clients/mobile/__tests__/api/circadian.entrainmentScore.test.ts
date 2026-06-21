/**
 * Tests for the entrainment-score DEDUP in src/api/circadian.ts.
 *
 * Background: api/circadian.ts used to carry a PRIVATE `deriveEntrainmentScore`
 * that was byte-identical to the EXPORTED `deriveEntrainmentScore` in
 * src/lib/circadian/entrainment.ts. That duplicate has been deleted; getModel()
 * now calls the shared lib helper (mapping the engine signals onto its
 * EntrainmentSignals shape and coercing `null -> undefined`). This suite locks
 * that wiring:
 *
 *   (a) for representative engine responses, getModel().entrainmentScore equals
 *       the lib's deriveEntrainmentScore() for the same {melatoninOnset,
 *       shiftEnd} fixtures (0h gap -> 100, 3h gap -> 50, 6h gap -> 0),
 *   (b) a missing/malformed melatoninOnset OR shift-end yields `undefined`
 *       (NOT null — proving the null->undefined coercion), and
 *   (c) a source scan finds NO second `function deriveEntrainmentScore` in
 *       api/circadian.ts (the math now lives only in entrainment.ts, imported).
 *
 * apiClient.post and shifts.getCurrent are mocked so getModel() runs offline.
 * Note: api/circadian.ts imports './client' / './shifts' relatively, but jest's
 * moduleNameMapper resolves '@/api/client' / '@/api/shifts' to the SAME physical
 * modules, so mocking the '@/'-aliased paths intercepts those relative imports
 * (same precedent as __tests__/api/chat.test.ts).
 */

import fs from 'fs';
import path from 'path';

jest.mock('@/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('@/api/shifts', () => ({
  getCurrent: jest.fn(),
}));

import { getModel } from '@/api/circadian';
import { apiClient } from '@/api/client';
import { getCurrent } from '@/api/shifts';
import { deriveEntrainmentScore } from '@/lib/circadian/entrainment';

const mockedPost = apiClient.post as jest.Mock;
const mockedGetCurrent = getCurrent as jest.Mock;

// Module-scoped so BOTH source-scan blocks (the UTC-frame and dedup describes)
// can read the api/circadian.ts source from one shared path.
const API_CIRCADIAN_PATH = path.resolve(__dirname, '../../src/api/circadian.ts');

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * Drive getModel() with a fixed engine `/v1/circadian/profile` response and a
 * fixed current shift. `endTime` is a UTC ISO string (trailing `Z`) so
 * `new Date(...).getUTCHours()` is timezone-stable on any CI machine AND matches
 * the frame of the engine's UTC `melatoninOnset` clock string — the same frame
 * shiftEndMinutes() now reads (getUTCHours/getUTCMinutes). A LOCAL-time string
 * (no `Z`) would re-introduce the device-offset bug this fix closes.
 */
async function runGetModel(opts: {
  melatoninOnset?: unknown;
  /** Shift endTime as a UTC ISO string (`...Z`), or omit/empty for the missing case. */
  endTime?: string;
}) {
  // A current shift with an id so getModel() does not throw the "no shift" guard.
  mockedGetCurrent.mockResolvedValueOnce({
    id: 'shift_1',
    userId: 'u_me',
    type: 'NIGHT',
    startTime: '2026-06-13T22:00:00.000Z',
    endTime: opts.endTime ?? '',
    timezone: 'UTC',
  });
  // The engine response: only melatoninOnset matters for the score here.
  mockedPost.mockResolvedValueOnce({
    data: {
      shiftId: 'shift_1',
      userId: 'u_me',
      melatoninOnset: opts.melatoninOnset,
    },
  });
  return getModel();
}

describe('getModel() entrainmentScore — shared with lib deriveEntrainmentScore', () => {
  // Each fixture: an engine melatoninOnset + a shift end (06:00 UTC => 360 min)
  // and the SAME signals fed to the lib helper directly. The api result must
  // equal the lib result, AND match the documented 0h/3h/6h gap landmarks.
  // The shift end is read in UTC (getUTCHours/getUTCMinutes) to share the engine's
  // UTC melatoninOnset frame, so the fixture is a UTC ISO string (`...Z`).
  const SHIFT_END_UTC_ISO = '2026-06-13T06:00:00.000Z'; // 06:00 UTC -> 360 minutes
  const SHIFT_END_MINUTES = 360;

  const cases: Array<{ name: string; onset: string; expected: number }> = [
    { name: '0h gap (onset == shift end) -> 100', onset: '06:00', expected: 100 },
    { name: '~3h gap -> ~50', onset: '09:00', expected: 50 },
    { name: '>=6h gap -> 0 (clamped floor)', onset: '00:00', expected: 0 },
  ];

  test.each(cases)('$name', async ({ onset, expected }) => {
    const model = await runGetModel({ melatoninOnset: onset, endTime: SHIFT_END_UTC_ISO });

    // (a) matches the documented landmark value …
    expect(model.entrainmentScore).toBe(expected);

    // … and equals the lib helper for the SAME signals (shiftEnd as the minutes
    // value getModel() derives from the local-time endTime). One math, one home.
    const fromLib = deriveEntrainmentScore({ melatoninOnset: onset, shiftEnd: SHIFT_END_MINUTES });
    expect(model.entrainmentScore).toBe(fromLib);
    // The lib returns a genuine number here (never null) for these fixtures.
    expect(fromLib).toBe(expected);
  });

  test('POSTs to the circadian profile endpoint (getModel still wired offline)', async () => {
    await runGetModel({ melatoninOnset: '06:00', endTime: SHIFT_END_UTC_ISO });
    expect(mockedPost).toHaveBeenCalledWith('/v1/circadian/profile', expect.any(Object));
  });
});

describe('null -> undefined coercion (never null)', () => {
  test('a malformed melatoninOnset yields undefined (not null)', async () => {
    const model = await runGetModel({ melatoninOnset: 'not-a-time', endTime: '2026-06-13T06:00:00.000Z' });
    // The lib helper returns null for a malformed onset; getModel coerces it.
    expect(deriveEntrainmentScore({ melatoninOnset: 'not-a-time', shiftEnd: 360 })).toBeNull();
    expect(model.entrainmentScore).toBeUndefined();
    expect(model.entrainmentScore).toBe(undefined); // explicit: === undefined
    expect(model.entrainmentScore).not.toBeNull();
  });

  test('a missing melatoninOnset yields undefined (not null)', async () => {
    const model = await runGetModel({ melatoninOnset: undefined, endTime: '2026-06-13T06:00:00.000Z' });
    expect(model.entrainmentScore).toBe(undefined);
    expect(model.entrainmentScore).not.toBeNull();
  });

  test('a missing shift end (empty endTime) yields undefined (not null)', async () => {
    // shiftEndMinutes('') -> null -> lib returns null -> coerced to undefined.
    const model = await runGetModel({ melatoninOnset: '06:00', endTime: '' });
    expect(model.entrainmentScore).toBe(undefined);
    expect(model.entrainmentScore).not.toBeNull();
  });

  test('an unparseable shift end (bad ISO) yields undefined (not null)', async () => {
    const model = await runGetModel({ melatoninOnset: '06:00', endTime: 'not-a-date' });
    expect(model.entrainmentScore).toBe(undefined);
    expect(model.entrainmentScore).not.toBeNull();
  });
});

describe('UTC frame — shift end shares the engine melatoninOnset frame', () => {
  // The engine's melatoninOnset is a UTC "HH:MM" clock string. shiftEndMinutes
  // now reads the shift end in UTC (getUTCHours/getUTCMinutes) so the two are on
  // ONE 24h dial. These cases pin that frame: the score is driven by the UTC
  // wall-clock of endTime, NOT its local wall-clock (which would re-introduce a
  // device-offset error). All fixtures are explicit UTC instants (`...Z`).

  test('a UTC-offset endTime is read in UTC (08:00Z -> 480 min, not its local hour)', async () => {
    // 08:00Z onset vs an 08:00Z shift end -> 0h gap -> 100, on ANY machine tz.
    // If shiftEndMinutes still read LOCAL hours, the gap (and score) would shift
    // by the device offset and this would NOT be 100 off-UTC CI machines.
    const model = await runGetModel({ melatoninOnset: '08:00', endTime: '2026-06-13T08:00:00.000Z' });
    expect(model.entrainmentScore).toBe(100);
    // Equivalent to feeding the UTC-minutes signal straight to the lib helper.
    expect(deriveEntrainmentScore({ melatoninOnset: '08:00', shiftEnd: 480 })).toBe(100);
  });

  test('the same instant expressed with a +02:00 offset reads the SAME UTC minutes', async () => {
    // 08:00Z == 10:00+02:00. Reading UTC gives 480 either way, so a 08:00Z onset
    // is still a 0h gap -> 100. A LOCAL read of "10:00" would wrongly give 600.
    const model = await runGetModel({ melatoninOnset: '08:00', endTime: '2026-06-13T10:00:00.000+02:00' });
    expect(model.entrainmentScore).toBe(100);
  });

  test('a genuine 3h UTC gap -> 50 regardless of the offset notation used', async () => {
    // Shift ends 06:00Z (360 min); melatonin onset 09:00 (540 min) -> 180 min gap
    // -> 50. Expressed via a -05:00 offset (01:00-05:00 == 06:00Z) to prove the
    // reading is the UTC instant, not the local wall-clock.
    const model = await runGetModel({ melatoninOnset: '09:00', endTime: '2026-06-13T01:00:00.000-05:00' });
    expect(model.entrainmentScore).toBe(50);
    expect(deriveEntrainmentScore({ melatoninOnset: '09:00', shiftEnd: 360 })).toBe(50);
  });

  test('source: shiftEndMinutes reads the UTC frame, not local getHours/getMinutes', () => {
    const src = fs.readFileSync(API_CIRCADIAN_PATH, 'utf8');
    // It must read UTC fields …
    expect(/getUTCHours\(\)/.test(src)).toBe(true);
    expect(/getUTCMinutes\(\)/.test(src)).toBe(true);
    // … and must NOT fall back to the local-frame readers (the bug).
    expect(/\.getHours\(\)/.test(src)).toBe(false);
    expect(/\.getMinutes\(\)/.test(src)).toBe(false);
  });
});

describe('source dedup — one implementation, in entrainment.ts only', () => {
  test('api/circadian.ts defines NO local `function deriveEntrainmentScore`', () => {
    const src = fs.readFileSync(API_CIRCADIAN_PATH, 'utf8');
    // No function declaration of the helper anywhere in the api module …
    expect(/function\s+deriveEntrainmentScore\b/.test(src)).toBe(false);
    // … and it must arrive via an import from the shared lib instead.
    expect(src).toContain("from '@/lib/circadian/entrainment'");
    expect(/import\s*\{[^}]*\bderiveEntrainmentScore\b[^}]*\}\s*from\s*'@\/lib\/circadian\/entrainment'/.test(src)).toBe(true);
  });

  test('the now-unused local clock helpers were removed from api/circadian.ts', () => {
    const src = fs.readFileSync(API_CIRCADIAN_PATH, 'utf8');
    // clockToMinutes / circularGapMinutes were only used by the deleted private
    // derivation; deleting them keeps the module free of dead code.
    expect(/function\s+clockToMinutes\b/.test(src)).toBe(false);
    expect(/function\s+circularGapMinutes\b/.test(src)).toBe(false);
    // shiftEndMinutes is STILL needed (it feeds the shared helper) — keep it.
    expect(/function\s+shiftEndMinutes\b/.test(src)).toBe(true);
  });
});
