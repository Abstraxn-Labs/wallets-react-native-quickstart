const DEFAULT_MESSAGE = 'Something went wrong. Please try again.';

function extractErrorMessage(error) {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message ?? '';
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    return error.message;
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
  } else if (raw) {
    message = raw;
  }

  if (code) {
    return `${message} (${code})`;
  }
  return message;
}
