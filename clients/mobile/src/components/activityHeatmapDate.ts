/**
 * Pure date-key helper for <ActivityHeatmap />, split into its own module so it
 * can be unit-tested without importing the RN/expo component (which transitively
 * pulls in expo-font and can't load under jest).
 *
 * A Date's calendar day as a `YYYY-MM-DD` key in the LOCAL frame.
 *
 * The grid iterates LOCAL days (today/getDay/setDate), so cell keys, the
 * workout-day map, and the "today" highlight must ALL key off the local calendar
 * day too. Using `toISOString()` here (UTC) would place east-of-UTC users'
 * activity on the wrong column/day — so we read the local Y/M/D fields and
 * zero-pad them to one consistent frame.
 */
export function localDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
