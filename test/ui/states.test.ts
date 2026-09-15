// Error copy. Users see these strings, so the mapping from a raw failure to
// plain language is worth pinning; a Java stack trace once reached the screen.
import { ApiError } from '@/api/client';
import { errorMessage } from '@/lib/error-message';

describe('errorMessage', () => {
  it('explains a not found', () => {
    expect(errorMessage(new ApiError('/api/x', 404))).toBe('Not found.');
  });

  it('explains a rate limit', () => {
    expect(errorMessage(new ApiError('/api/x', 429))).toMatch(/Too many requests/);
  });

  it('blames the server on a 5xx without leaking the route', () => {
    const msg = errorMessage(new ApiError('/api/x', 503));
    expect(msg).toMatch(/having trouble/);
    expect(msg).not.toMatch(/api/);
  });

  it('passes through a specific API message', () => {
    expect(errorMessage(new ApiError('/api/x', 400, 'Invalid week'))).toBe('Invalid week');
  });

  it('turns a dropped connection into plain language', () => {
    // The raw text is java.net.UnknownHostException, which reached a screen once.
    expect(errorMessage(new Error('fetch failed: java.net.UnknownHostException: Unable to resolve host'))).toMatch(/offline/);
    expect(errorMessage(new TypeError('Network request failed'))).toMatch(/offline/);
  });

  it('explains a timeout', () => {
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    expect(errorMessage(abort)).toMatch(/took too long/);
  });

  it('has a fallback for anything else', () => {
    expect(errorMessage('a string')).toBe('Something went wrong.');
    expect(errorMessage(null)).toBe('Something went wrong.');
  });
});
