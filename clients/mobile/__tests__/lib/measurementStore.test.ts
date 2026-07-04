/**
 * Unit tests for the local camera-PPG measurement history store
 * (src/lib/ppg/measurementStore.ts). Uses a stateful in-memory AsyncStorage mock
 * so add → list round-trips are observable, and asserts the newest-first order,
 * the size cap, tag persistence, corrupt-blob resilience, and clear().
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    setItem: jest.fn((k: string, v: string) => {
      store[k] = v;
      return Promise.resolve();
    }),
    getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
    removeItem: jest.fn((k: string) => {
      delete store[k];
      return Promise.resolve();
    }),
    __reset: () => {
      store = {};
    },
    __seed: (k: string, v: string) => {
      store[k] = v;
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addMeasurement,
  listMeasurements,
  clearMeasurements,
  MAX_MEASUREMENTS,
  type NewMeasurement,
} from '@/lib/ppg/measurementStore';

const KEY = 'nf.hr.measurements';
const sample: NewMeasurement = { bpm: 72, confidence: 0.8, quality: 'good', tag: 'resting' };

beforeEach(() => {
  (AsyncStorage as any).__reset();
});

describe('measurementStore', () => {
  it('starts empty', async () => {
    expect(await listMeasurements()).toEqual([]);
  });

  it('adds a measurement and reads it back with filled id/ts/source', async () => {
    const list = await addMeasurement(sample);
    expect(list).toHaveLength(1);
    const rec = list[0]!;
    expect(rec.bpm).toBe(72);
    expect(rec.tag).toBe('resting');
    expect(rec.source).toBe('camera_ppg');
    expect(typeof rec.id).toBe('string');
    expect(rec.id.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(rec.ts))).toBe(false);
    // persisted, not just returned
    expect(await listMeasurements()).toHaveLength(1);
  });

  it('keeps newest first', async () => {
    await addMeasurement({ ...sample, bpm: 60 });
    await addMeasurement({ ...sample, bpm: 90 });
    const list = await listMeasurements();
    expect(list.map((m) => m.bpm)).toEqual([90, 60]);
  });

  it('rounds the stored BPM', async () => {
    const list = await addMeasurement({ ...sample, bpm: 72.6 });
    expect(list[0]!.bpm).toBe(73);
  });

  it('caps the history at MAX_MEASUREMENTS', async () => {
    for (let i = 0; i < MAX_MEASUREMENTS + 10; i++) {
      await addMeasurement({ ...sample, bpm: 60 + (i % 40) });
    }
    expect((await listMeasurements()).length).toBe(MAX_MEASUREMENTS);
  });

  it('clear() wipes history', async () => {
    await addMeasurement(sample);
    await clearMeasurements();
    expect(await listMeasurements()).toEqual([]);
  });

  it('resolves to [] on a corrupt blob (never throws)', async () => {
    (AsyncStorage as any).__seed(KEY, '{not valid json');
    expect(await listMeasurements()).toEqual([]);
  });

  it('drops junk entries from a partially-valid blob', async () => {
    (AsyncStorage as any).__seed(
      KEY,
      JSON.stringify([{ id: 'a', ts: new Date().toISOString(), bpm: 70, tag: 'resting' }, { nope: true }, 42]),
    );
    const list = await listMeasurements();
    expect(list).toHaveLength(1);
    expect(list[0]!.bpm).toBe(70);
  });
});
