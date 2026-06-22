/**
 * Input validation utilities for forms.
 */

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isStrongPassword(pw: string): boolean {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

/**
 * Normalize an email the same way the backend does before persisting/looking
 * it up: trim surrounding whitespace and lowercase. Keeping this identical to
 * the server prevents the client from submitting a value the server would
 * store/match differently (e.g. ' Me@Example.COM ' -> 'me@example.com').
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Return the labels of the password rules that are NOT yet satisfied, ordered
 * to match the inline PasswordRequirements checklist. An empty array means the
 * password passes every rule (equivalent to `isStrongPassword` returning true).
 * Wording mirrors the backend rejection copy so the client never surfaces a
 * different message than the server would.
 */
export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 8) issues.push('At least 8 characters');
  if (!/[A-Z]/.test(pw)) issues.push('One uppercase letter (A-Z)');
  if (!/[0-9]/.test(pw)) issues.push('One number (0-9)');
  return issues;
}

/** Strip HTML tags and trim whitespace.
 *
 * Applies the tag-stripping pass repeatedly until the string stops changing.
 * A single pass is unsafe: overlapping/nested constructs like `<scr<script>ipt>`
 * leave a live `<script>` behind after one replace, because `String.replace`
 * does not re-scan the text it produced. Looping to a fixed point closes that
 * incomplete-multi-character-sanitization hole (CodeQL js/incomplete-multi-character-sanitization).
 */
export function sanitizeInput(text: string): string {
  let prev = text.trim();
  let next = prev.replace(/<[^>]*>/g, '');
  while (next !== prev) {
    prev = next;
    next = next.replace(/<[^>]*>/g, '');
  }
  return next;
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
