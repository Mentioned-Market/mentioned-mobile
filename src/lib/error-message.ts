// What a failure says on screen. Users read these strings, so the mapping from
// a raw failure to plain language is a rule, kept here where it is unit tested.
import { ApiError, BAD_SHAPE } from '@/api/client';

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404) return 'Not found.';
    if (e.status === 429) return 'Too many requests. Give it a moment.';
    // A response the app could not read is our fault, not the reader's, and
    // its detail (a route and a field path) means nothing to them.
    if (e.status >= 500 || e.code === BAD_SHAPE) return 'Mentioned is having trouble. Try again shortly.';
    return e.message;
  }
  if (e instanceof Error) {
    if (e.name === 'AbortError') return 'That took too long. Check your connection.';
    if (/network request failed|unable to resolve host|unknownhost|fetch failed|failed to connect|software caused connection abort/i.test(e.message)) {
      return "You're offline. Check your connection and try again.";
    }
    return e.message;
  }
  return 'Something went wrong.';
}
