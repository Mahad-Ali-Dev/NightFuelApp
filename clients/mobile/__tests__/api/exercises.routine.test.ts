/**
 * Tests for the pure `shapeCreateRoutine` whitelist/clamp in src/api/exercises.ts.
 *
 * `shapeCreateRoutine` shapes untrusted caller input into a bounded payload that
 * mirrors the backend `createRoutineSchema` (exercise-service): `title` required,
 * `exercises` capped at 50, per-exercise `sets` clamped to 0-100 and `reps` to
 * 0-1000, and every non-whitelisted field stripped. These tests exercise the
 * pure shaper only — the apiClient is mocked so nothing touches the network.
 */

jest.mock('@/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { shapeCreateRoutine } from '@/api/exercises';

describe('shapeCreateRoutine — bounds', () => {
  test('clamps over-range sets (150 -> 100) and reps (5000 -> 1000)', () => {
    const out = shapeCreateRoutine({
      title: 'Leg Day',
      exercises: [{ name: 'Squat', sets: 150, reps: 5000 }],
    });

    expect(out.exercises).toEqual([{ name: 'Squat', sets: 100, reps: 1000 }]);
  });

  test('floors negative sets/reps to 0', () => {
    const out = shapeCreateRoutine({
      title: 'Recovery',
      exercises: [{ name: 'Stretch', sets: -5, reps: -100 }],
    });

    expect(out.exercises[0]).toEqual({ name: 'Stretch', sets: 0, reps: 0 });
  });

  test('rounds fractional sets/reps to the nearest integer before clamping', () => {
    const out = shapeCreateRoutine({
      title: 'Mixed',
      exercises: [{ name: 'Plank', sets: 2.4, reps: 9.6 }],
    });

    expect(out.exercises[0]).toEqual({ name: 'Plank', sets: 2, reps: 10 });
  });

  test('maps NaN / non-numeric sets/reps to 0', () => {
    const out = shapeCreateRoutine({
      title: 'Junk Numbers',
      exercises: [{ name: 'Curl', sets: 'abc', reps: NaN }],
    });

    expect(out.exercises[0]).toEqual({ name: 'Curl', sets: 0, reps: 0 });
  });

  test('caps an exercises array of 60 at 50', () => {
    const sixty = Array.from({ length: 60 }, (_, i) => ({ name: `Ex ${i}`, sets: 3, reps: 10 }));

    const out = shapeCreateRoutine({ title: 'Marathon', exercises: sixty });

    expect(out.exercises).toHaveLength(50);
    expect(out.exercises[0]).toEqual({ name: 'Ex 0', sets: 3, reps: 10 });
    expect(out.exercises[49]).toEqual({ name: 'Ex 49', sets: 3, reps: 10 });
  });
});

describe('shapeCreateRoutine — whitelist', () => {
  test('drops extraneous top-level fields (e.g. isAdmin / id)', () => {
    const out = shapeCreateRoutine({
      title: 'Push',
      isAdmin: true,
      id: 'r_hacked',
      userId: 'someone-else',
      exercises: [],
    });

    expect(out).toEqual({ title: 'Push', exercises: [] });
    expect(out).not.toHaveProperty('isAdmin');
    expect(out).not.toHaveProperty('id');
    expect(out).not.toHaveProperty('userId');
  });

  test('drops extraneous per-exercise fields, keeping only name/sets/reps', () => {
    const out = shapeCreateRoutine({
      title: 'Pull',
      exercises: [
        { name: 'Deadlift', sets: 5, reps: 5, weightKg: 140, id: 'x1', isAdmin: true },
      ],
    });

    expect(out.exercises[0]).toEqual({ name: 'Deadlift', sets: 5, reps: 5 });
    expect(out.exercises[0]).not.toHaveProperty('weightKg');
    expect(out.exercises[0]).not.toHaveProperty('id');
    expect(out.exercises[0]).not.toHaveProperty('isAdmin');
  });

  test('keeps optional description/splitType only when they are strings', () => {
    const withStrings = shapeCreateRoutine({
      title: 'Upper/Lower',
      description: 'A 4-day split',
      splitType: 'UPPER_LOWER',
      exercises: [],
    });
    expect(withStrings).toEqual({
      title: 'Upper/Lower',
      description: 'A 4-day split',
      splitType: 'UPPER_LOWER',
      exercises: [],
    });

    const withNonStrings = shapeCreateRoutine({
      title: 'No Meta',
      description: 123,
      splitType: { evil: true },
      exercises: [],
    });
    expect(withNonStrings).toEqual({ title: 'No Meta', exercises: [] });
    expect(withNonStrings).not.toHaveProperty('description');
    expect(withNonStrings).not.toHaveProperty('splitType');
  });
});

describe('shapeCreateRoutine — title handling', () => {
  test('trims surrounding whitespace from the title', () => {
    expect(shapeCreateRoutine({ title: '  Leg Day  ', exercises: [] }).title).toBe('Leg Day');
  });

  test('throws on an empty title', () => {
    expect(() => shapeCreateRoutine({ title: '', exercises: [] })).toThrow();
  });

  test('throws on a whitespace-only title', () => {
    expect(() => shapeCreateRoutine({ title: '   ', exercises: [] })).toThrow();
  });

  test('throws when no title (or name) is provided at all', () => {
    expect(() => shapeCreateRoutine({ exercises: [] })).toThrow();
    expect(() => shapeCreateRoutine({})).toThrow();
    expect(() => shapeCreateRoutine(null)).toThrow();
    expect(() => shapeCreateRoutine(undefined)).toThrow();
  });

  test('accepts a legacy `name` alias as the title source', () => {
    expect(shapeCreateRoutine({ name: 'Legacy Routine', exercises: [] }).title).toBe('Legacy Routine');
  });
});

describe('shapeCreateRoutine — well-formed passthrough', () => {
  test('a well-formed caller payload (as built by routines.tsx) is preserved unchanged', () => {
    // Matches the real caller: createRoutine({ title, exercises: [{name,sets,reps}] })
    const input = {
      title: 'My Routine',
      exercises: [
        { name: 'Bench Press', sets: 3, reps: 10 },
        { name: 'Squat', sets: 4, reps: 8 },
      ],
    };

    const out = shapeCreateRoutine(input);

    expect(out).toEqual({
      title: 'My Routine',
      exercises: [
        { name: 'Bench Press', sets: 3, reps: 10 },
        { name: 'Squat', sets: 4, reps: 8 },
      ],
    });
  });

  test('a missing exercises array becomes an empty array', () => {
    expect(shapeCreateRoutine({ title: 'Empty' })).toEqual({ title: 'Empty', exercises: [] });
  });

  test('a non-array exercises value becomes an empty array', () => {
    expect(shapeCreateRoutine({ title: 'Bad Ex', exercises: 'nope' })).toEqual({
      title: 'Bad Ex',
      exercises: [],
    });
  });
});
