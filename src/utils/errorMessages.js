const DEFAULT_MESSAGE = 'Something went wrong. Please try again.';

function readPathValue(obj, path) {
  let current = obj;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function pickNestedMessage(error) {
  const paths = [
    ['message'],
    ['error'],
    ['details'],
    ['reason'],
    ['response', 'data', 'message'],
    ['response', 'data', 'error'],
    ['response', 'message'],
    ['data', 'message'],
    ['data', 'error'],
    ['nativeError', 'message'],
    ['cause', 'message'],
    ['userInfo', 'message'],
    ['userInfo', 'localizedDescription'],
  ];

  for (const path of paths) {
    const value = readPathValue(error, path);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function extractErrorMessage(error) {
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const nested = pickNestedMessage(error);
    return nested || (error.message ?? '');
  }
  if (error && typeof error === 'object') {
    return pickNestedMessage(error);
  }
  return '';
}

export function normalizeError(error, options = {}) {
  const { fallback = DEFAULT_MESSAGE, code } = options;
  const raw = extractErrorMessage(error).trim();
  const lower = raw.toLowerCase();

  let message = fallback;

  if (
    lower.includes('network request failed') ||
    lower.includes('network error') ||
    lower.includes('failed to fetch')
  ) {
    message = 'Network error. Check your internet and try again.';
  } else if (
    lower.includes('invalid_grant') ||
    lower.includes('session expired') ||
    lower.includes('token expired') ||
    lower.includes('unauthorized')
  ) {
    message = 'Your session expired. Please sign in again.';
  } else if (
    lower.includes('invalid otp') ||
    lower.includes('invalid code') ||
    lower.includes('verification code')
  ) {
    message = 'Invalid verification code. Please try again.';
  } else if (
    lower.includes('cancel') ||
    lower.includes('dismiss') ||
    lower.includes('abort')
  ) {
    message = 'Request cancelled.';
  } else if (
    lower.includes('invalid') &&
    lower.includes('sign-in url')
  ) {
    message = 'Could not open sign-in. Please try again.';
  } else if (raw && raw !== '[object Object]') {
    message = raw;
  }

  if (code) {
    return `${message} (${code})`;
  }
  return message;
}
