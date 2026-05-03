// Date, number, and macro formatting utilities

import { format, formatDistanceToNow, differenceInMinutes, differenceInHours } from 'date-fns';

/**
 * Format a countdown like "4h 12m"
 */
export function formatCountdown(targetDate: Date): string {
  const now = new Date();
  const totalMins = differenceInMinutes(targetDate, now);
  if (totalMins <= 0) return '0m';
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

/**
 * Format time like "08:00" or "15:00"
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'HH:mm');
}

/**
 * Format time with period like "3:00 PM"
 */
export function formatTime12h(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'h:mm a');
}

/**
 * Format a date like "Mon, Mar 3"
 */
export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'EEE, MMM d');
}

/**
 * Format macro value with unit: "145g"
 */
export function formatMacro(value: number, unit = 'g'): string {
  return `${Math.round(value)}${unit}`;
}

/**
 * Format calories: "2,450"
 */
export function formatCalories(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Format percentage: "65%"
 */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * Format volume: "1.2 / 2.5 L"
 */
export function formatVolume(current: number, goal: number): string {
  return `${(current / 1000).toFixed(1)} / ${(goal / 1000).toFixed(1)} L`;
}

/**
 * Format weight: "135 lbs" or "61.2 kg"
 */
export function formatWeight(value: number, unit: 'lbs' | 'kg' = 'lbs'): string {
  return `${Math.round(value)} ${unit}`;
}

/**
 * Format duration in mm:ss
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format relative time: "2 hours ago"
 */
export function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}
