import {
  isValidEmail,
  isStrongPassword,
  sanitizeInput,
  isValidTime,
  clamp,
  getErrorMessage,
} from '@/utils/validation';

describe('isValidEmail', () => {
  test.each([
    ['simple@example.com', true],
    ['firstname.lastname@example.co.uk', true],
    ['hello+tag@example.com', true],
    ['', false],
    ['no-at-sign.com', false],
    ['@no-local-part.com', false],
    ['no-domain@', false],
    ['has space@example.com', false],
    ['no-tld@example', false],
  ])('%s -> %s', (input, expected) => {
    expect(isValidEmail(input)).toBe(expected);
  });

  test('trims surrounding whitespace before checking', () => {
    expect(isValidEmail('  user@example.com  ')).toBe(true);
  });
});

describe('isStrongPassword', () => {
  test('accepts a password with 8+ chars, uppercase, and digit', () => {
    expect(isStrongPassword('Abcdef12')).toBe(true);
    expect(isStrongPassword('VeryLongPassword99')).toBe(true);
  });

  test('rejects passwords shorter than 8 chars', () => {
    expect(isStrongPassword('Abc1')).toBe(false);
    expect(isStrongPassword('A1bcdef')).toBe(false);
  });

  test('rejects passwords without an uppercase letter', () => {
    expect(isStrongPassword('lowercase123')).toBe(false);
  });

  test('rejects passwords without a digit', () => {
    expect(isStrongPassword('NoDigitHere')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isStrongPassword('')).toBe(false);
  });
});

describe('sanitizeInput', () => {
  test('strips simple HTML tags', () => {
    expect(sanitizeInput('<script>evil()</script>hello')).toBe('evilhello');
    expect(sanitizeInput('<b>bold</b>')).toBe('bold');
  });

  test('trims whitespace', () => {
    expect(sanitizeInput('  hi  ')).toBe('hi');
  });

  test('handles empty input', () => {
    expect(sanitizeInput('')).toBe('');
  });
});

describe('isValidTime', () => {
  test.each([
    ['00:00', true],
    ['07:30', true],
    ['12:00', true],
    ['23:59', true],
    ['24:00', false],
    ['25:00', false],
    ['12:60', false],
    ['7:30', false],     // single-digit hour
    ['12-30', false],    // wrong separator
    ['', false],
    ['hello', false],
  ])('%s -> %s', (input, expected) => {
    expect(isValidTime(input)).toBe(expected);
  });
});

describe('clamp', () => {
  test('keeps value within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  test('clamps below min to min', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(-100, 0, 10)).toBe(0);
  });

  test('clamps above max to max', () => {
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(100, 0, 10)).toBe(10);
  });
});

describe('getErrorMessage', () => {
  test('returns axios response.data.message when present', () => {
    expect(
      getErrorMessage({ response: { data: { message: 'API said no' } } }),
    ).toBe('API said no');
  });

  test('falls back to .message', () => {
    expect(getErrorMessage(new Error('plain error'))).toBe('plain error');
  });

  test('returns generic message for null/undefined', () => {
    expect(getErrorMessage(null)).toBe('Something went wrong');
    expect(getErrorMessage(undefined)).toBe('Something went wrong');
  });
});
