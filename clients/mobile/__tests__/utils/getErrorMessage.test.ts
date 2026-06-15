/**
 * Focused, extended coverage for getErrorMessage — precedence rules and the
 * fallthrough branches not exercised by validation.test.ts (string errors,
 * empty objects, response without a message, falsy non-null inputs).
 */
import { getErrorMessage } from '@/utils/validation';

describe('getErrorMessage — precedence', () => {
  test('prefers response.data.message over a top-level .message', () => {
    const err = {
      response: { data: { message: 'server message' } },
      message: 'generic axios message',
    };
    expect(getErrorMessage(err)).toBe('server message');
  });

  test('falls back to top-level .message when response.data.message is absent', () => {
    const err = { response: { data: {} }, message: 'fallback message' };
    expect(getErrorMessage(err)).toBe('fallback message');
  });

  test('falls back to .message when there is no response at all', () => {
    expect(getErrorMessage({ message: 'only message' })).toBe('only message');
  });
});

describe('getErrorMessage — string and primitive inputs', () => {
  test('returns a string error verbatim', () => {
    expect(getErrorMessage('boom')).toBe('boom');
  });

  test('treats an empty string as falsy and returns the generic message', () => {
    expect(getErrorMessage('')).toBe('Something went wrong');
  });

  test('returns generic message for a number (no usable shape)', () => {
    expect(getErrorMessage(42)).toBe('Something went wrong');
  });

  test('returns generic message for a boolean true', () => {
    expect(getErrorMessage(true)).toBe('Something went wrong');
  });
});

describe('getErrorMessage — object fallthrough', () => {
  test('returns generic message for an empty object', () => {
    expect(getErrorMessage({})).toBe('Something went wrong');
  });

  test('returns generic message when response has no data.message and no .message', () => {
    expect(getErrorMessage({ response: { status: 500 } })).toBe('Something went wrong');
  });

  test('returns generic message when .message is not a usable string', () => {
    // message present but empty → falsy → generic fallback.
    expect(getErrorMessage({ message: '' })).toBe('Something went wrong');
  });

  test('ignores unrelated object keys', () => {
    expect(getErrorMessage({ code: 'ERR_NETWORK', config: {} })).toBe('Something went wrong');
  });
});

describe('getErrorMessage — nullish inputs', () => {
  test('returns generic message for null', () => {
    expect(getErrorMessage(null)).toBe('Something went wrong');
  });

  test('returns generic message for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('Something went wrong');
  });

  test('returns generic message for NaN', () => {
    expect(getErrorMessage(NaN)).toBe('Something went wrong');
  });
});

describe('getErrorMessage — real Error instances', () => {
  test('reads the message from a thrown Error', () => {
    expect(getErrorMessage(new Error('kaboom'))).toBe('kaboom');
  });

  test('reads the message from a TypeError', () => {
    expect(getErrorMessage(new TypeError('bad type'))).toBe('bad type');
  });
});
