import { withAlpha } from '@/theme/utils';

describe('withAlpha', () => {
  test('converts white to rgba', () => {
    expect(withAlpha('#ffffff', 1)).toBe('rgba(255,255,255,1)');
  });

  test('converts black to rgba', () => {
    expect(withAlpha('#000000', 0)).toBe('rgba(0,0,0,0)');
  });

  test('parses lowercase hex channels correctly', () => {
    // 1a=26, 2b=43, 3c=60
    expect(withAlpha('#1a2b3c', 0.5)).toBe('rgba(26,43,60,0.5)');
  });

  test('parses uppercase hex channels correctly', () => {
    expect(withAlpha('#FF8800', 0.25)).toBe('rgba(255,136,0,0.25)');
  });

  test('preserves the exact alpha value passed in', () => {
    expect(withAlpha('#123456', 0.42)).toBe('rgba(18,52,86,0.42)');
    expect(withAlpha('#123456', 1)).toBe('rgba(18,52,86,1)');
    expect(withAlpha('#123456', 0)).toBe('rgba(18,52,86,0)');
  });

  test('handles a mid-range grey', () => {
    // 80 = 128 in each channel
    expect(withAlpha('#808080', 0.6)).toBe('rgba(128,128,128,0.6)');
  });

  test('ignores characters past the 7th (only reads #RRGGBB)', () => {
    // An 8-digit value (#RRGGBBAA) only has its first 6 hex digits read.
    expect(withAlpha('#1020304f', 0.5)).toBe('rgba(16,32,48,0.5)');
  });

  test('returns a string that matches the rgba() shape', () => {
    const out = withAlpha('#abcdef', 0.9);
    expect(out).toMatch(/^rgba\(\d{1,3},\d{1,3},\d{1,3},[\d.]+\)$/);
  });
});
