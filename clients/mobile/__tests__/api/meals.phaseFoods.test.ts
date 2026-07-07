/**
 * meals.phaseFoods.test.ts
 *
 * Locks the request CONTRACT for the NEW phase-foods endpoint in
 * src/api/meals.ts against the meal-service:
 *
 *   getPhaseFoods(phase, limit?) → GET /v1/meals/phase-foods with the phase (and
 *   optional limit) forwarded as query params, returning the
 *   { phase, focusNutrient, focusLabel, rationale, foods } payload verbatim.
 *
 * Mock convention mirrors the sibling api suites (profile.test.ts /
 * users.test.ts): @/api/client is stubbed so axios never loads.
 *
 * Additive: NEW test file only.
 */

jest.mock('@/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

import { getPhaseFoods } from '@/api/meals';
import { apiClient } from '@/api/client';

const mockedGet = apiClient.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

const PHASE_FOODS = {
  phase: 'MENSTRUAL',
  focusNutrient: 'ironMg',
  focusLabel: 'Iron',
  rationale: 'During your menstrual phase, iron-rich foods can support how you feel.',
  foods: [
    { id: 'f1', name: 'Spinach', calories: 23, protein: 3, carbs: 4, fat: 0, servingSize: '100g', ironMg: 2.7 },
    { id: 'f2', name: 'Lentils', calories: 116, protein: 9, carbs: 20, fat: 0, servingSize: '100g', ironMg: 3.3 },
  ],
};

describe('getPhaseFoods', () => {
  test('GETs /v1/meals/phase-foods with the phase param and returns the payload verbatim', async () => {
    mockedGet.mockResolvedValueOnce({ data: PHASE_FOODS });

    const result = await getPhaseFoods('MENSTRUAL');

    expect(mockedGet).toHaveBeenCalledWith('/v1/meals/phase-foods', {
      params: { phase: 'MENSTRUAL', limit: undefined },
    });
    expect(result).toBe(PHASE_FOODS);
    expect(result.focusNutrient).toBe('ironMg');
    expect(result.foods).toHaveLength(2);
  });

  test('forwards an explicit limit when provided', async () => {
    mockedGet.mockResolvedValueOnce({ data: { ...PHASE_FOODS, phase: 'LUTEAL' } });

    await getPhaseFoods('LUTEAL', 6);

    expect(mockedGet).toHaveBeenCalledWith('/v1/meals/phase-foods', {
      params: { phase: 'LUTEAL', limit: 6 },
    });
  });
});
