/**
 * Tests for `localDateKey` — the date-key helper behind <ActivityHeatmap />.
 *
 * The heatmap grid iterates LOCAL calendar days (today / getDay / setDate) but
 * USED to key/label its cells off the UTC date (`cursor.toISOString()`), and key
 * the workout-day map off the UTC date too (`createdAt.split('T')[0]`). For any
 * user east of UTC those two frames disagree, so a workout (and the "today"
 * highlight) could render on the wrong day/column. The fix collapses everything
 * onto ONE frame by deriving the `YYYY-MM-DD` key from the LOCAL Y/M/D fields.
 *
 * This suite pins that local-frame contract. To stay timezone-stable on any CI
 * machine (mirroring __tests__/utils/circadian.test.ts's estimateAlertness
 * cases), every Date is built from explicit LOCAL wall-clock components, so the
 * expected key is the same local Y/M/D regardless of the runner's timezone.
 */
// Import from the pure date-key module (not the RN/expo component, which pulls
// in expo-font and can't load under jest) — see src/components/activityHeatmapDate.ts.
import { localDateKey } from '@/components/activityHeatmapDate';

describe('localDateKey', () => {
  test('returns the LOCAL calendar day as zero-padded YYYY-MM-DD', () => {
    // 2026-06-13, built from local components → local-frame key.
    expect(localDateKey(new Date(2026, 5, 13, 9, 30, 0, 0))).toBe('2026-06-13');
  });

  test('zero-pads single-digit month and day', () => {
    // January (month index 0) and the 2nd → "2026-01-02".
    expect(localDateKey(new Date(2026, 0, 2, 0, 0, 0, 0))).toBe('2026-01-02');
  });

  test('keys off the LOCAL day even just before local midnight', () => {
    // 23:59 local on the 13th stays on the 13th (a UTC read could roll to the
    // 14th for a user ahead of UTC — the very bug this helper closes).
    expect(localDateKey(new Date(2026, 5, 13, 23, 59, 0, 0))).toBe('2026-06-13');
  });

  test('keys off the LOCAL day just after local midnight', () => {
    // 00:01 local on the 14th stays on the 14th (a UTC read could fall back to
    // the 13th for a user behind UTC).
    expect(localDateKey(new Date(2026, 5, 14, 0, 1, 0, 0))).toBe('2026-06-14');
  });

  test('agrees with the Date\'s own LOCAL getFullYear/getMonth/getDate', () => {
    // Independent of any fixed string: the key must always be the Date's LOCAL
    // calendar fields, so the grid (which iterates with the SAME local fields)
    // and the workout map land in one column.
    for (const d of [
      new Date(2025, 11, 31, 18, 0, 0, 0), // year boundary
      new Date(2024, 1, 29, 12, 0, 0, 0),  // leap day
      new Date(2026, 6, 4, 7, 15, 0, 0),
    ]) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      expect(localDateKey(d)).toBe(`${y}-${m}-${day}`);
    }
  });

  test('is pure — same instant yields the same key on repeat calls', () => {
    const d = new Date(2026, 5, 13, 9, 30, 0, 0);
    expect(localDateKey(d)).toBe(localDateKey(new Date(d.getTime())));
  });
});
