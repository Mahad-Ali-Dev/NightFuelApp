/**
 * Input validation utilities for forms.
 */

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isStrongPassword(pw: string): boolean {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

/** Strip HTML tags and trim whitespace. */
export function sanitizeInput(text: string): string {
  return text.trim().replace(/<[^>]*>/g, '');
}

/** Validate a time string is in HH:MM format. */
export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

/** Ensure a numeric input is within bounds. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Get a human-readable error message from an API error. */
export function getErrorMessage(error: unknown): string {
  if (!error) return 'Something went wrong';

  // Axios error shape
  if (typeof error === 'object' && error !== null) {
    const axiosError = error as {
      response?: { data?: { message?: string } };
      message?: string;
    };
    if (axiosError.response?.data?.message) return axiosError.response.data.message;
    if (axiosError.message) return axiosError.message;
  }

  if (typeof error === 'string') return error;
  return 'Something went wrong';
}
