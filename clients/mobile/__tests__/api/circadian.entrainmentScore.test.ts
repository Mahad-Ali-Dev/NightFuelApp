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

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * Drive getModel() with a fixed engine `/v1/circadian/profile` response and a
 * fixed current shift. `endTime` is a LOCAL-time ISO string (no trailing `Z`)
 * so `new Date(...).getHours()` is timezone-stable on any CI machine.
 */
async function runGetModel(opts: {
  melatoninOnset?: unknown;
  /** Shift endTime as a local-time ISO string, or omit/empty for the missing case. */
  endTime?: string;
}) {
  // A current shift with an id so getModel() does not throw the "no shift" guard.
  mockedGetCurrent.mockResolvedValueOnce({
    id: 'shift_1',
    userId: 'u_me',
    type: 'NIGHT',
    startTime: '2026-06-13T22:00:00',
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
  // Each fixture: an engine melatoninOnset + a shift end (06:00 local => 360 min)
  // and the SAME signals fed to the lib helper directly. The api result must
  // equal the lib result, AND match the documented 0h/3h/6h gap landmarks.
  const SHIFT_END_LOCAL_ISO = '2026-06-13T06:00:00'; // 06:00 local -> 360 minutes
  const SHIFT_END_MINUTES = 360;

  const cases: Array<{ name: string; onset: string; expected: number }> = [
    { name: '0h gap (onset == shift end) -> 100', onset: '06:00', expected: 100 },
    { name: '~3h gap -> ~50', onset: '09:00', expected: 50 },
    { name: '>=6h gap -> 0 (clamped floor)', onset: '00:00', expected: 0 },
  ];

  test.each(cases)('$name', async ({ onset, expected }) => {
    const model = await runGetModel({ melatoninOnset: onset, endTime: SHIFT_END_LOCAL_ISO });

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
    await runGetModel({ melatoninOnset: '06:00', endTime: SHIFT_END_LOCAL_ISO });
    expect(mockedPost).toHaveBeenCalledWith('/v1/circadian/profile', expect.any(Object));
  });
});

describe('null -> undefined coercion (never null)', () => {
  test('a malformed melatoninOnset yields undefined (not null)', async () => {
    const model = await runGetModel({ melatoninOnset: 'not-a-time', endTime: '2026-06-13T06:00:00' });
    // The lib helper returns null for a malformed onset; getModel coerces it.
    expect(deriveEntrainmentScore({ melatoninOnset: 'not-a-time', shiftEnd: 360 })).toBeNull();
    expect(model.entrainmentScore).toBeUndefined();
    expect(model.entrainmentScore).toBe(undefined); // explicit: === undefined
    expect(model.entrainmentScore).not.toBeNull();
  });

  test('a missing melatoninOnset yields undefined (not null)', async () => {
    const model = await runGetModel({ melatoninOnset: undefined, endTime: '2026-06-13T06:00:00' });
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

describe('source dedup — one implementation, in entrainment.ts only', () => {
  const API_CIRCADIAN_PATH = path.resolve(__dirname, '../../src/api/circadian.ts');

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
