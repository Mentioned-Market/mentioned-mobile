// A message is said once. Three copies of the sign-in screen each announced
// "Signed in", and the queue showed all three one after another.
import { enqueueToast, type ToastQueue } from '@/lib/toast-queue';

const empty: ToastQueue = { queue: [], next: 1 };
const all = (...toasts: { emoji: string; title: string; body?: string }[]) => toasts.reduce(enqueueToast, empty);

describe('the toast queue', () => {
  it('does not queue a message that is already showing or waiting', () => {
    const hi = { emoji: '👋', title: 'Signed in' };
    const state = all(hi, hi, hi);
    expect(state.queue).toHaveLength(1);
    expect(state.next).toBe(2);
  });

  it('hands back the same state when nothing was added, so nothing re-renders', () => {
    const once = enqueueToast(empty, { emoji: '👋', title: 'Signed in' });
    expect(enqueueToast(once, { emoji: '👋', title: 'Signed in' })).toBe(once);
  });

  it('still queues messages that differ in any part', () => {
    const state = all(
      { emoji: '✨', title: '+50 points', body: 'For sharing' },
      { emoji: '✨', title: '+50 points', body: 'For a pick' },
      { emoji: '✨', title: '+10 points', body: 'For a pick' },
      { emoji: '👋', title: '+10 points', body: 'For a pick' },
    );
    expect(state.queue).toHaveLength(4);
  });

  it('gives each queued toast its own id, and can say the same thing again once it has gone', () => {
    const state = all({ emoji: '🏆', title: 'First' }, { emoji: '🏆', title: 'Second' });
    expect(state.queue.map((t) => t.id)).toEqual([1, 2]);
    const shown = { queue: state.queue.slice(1), next: state.next };
    expect(enqueueToast(shown, { emoji: '🏆', title: 'First' }).queue.map((t) => t.title)).toEqual(['Second', 'First']);
  });
});
