// The toast queue's one rule, kept apart from the component so it is tested:
// a message that is already showing or waiting is not queued a second time.
// Saying one thing three times in a row reads as a fault, whatever caused it.

export type Toast = { id: number; emoji: string; title: string; body?: string };

export type ToastQueue = { queue: Toast[]; next: number };

/** The queue after `t` is asked for: unchanged when the same message is already in it. */
export function enqueueToast(state: ToastQueue, t: Omit<Toast, 'id'>): ToastQueue {
  if (state.queue.some((q) => q.emoji === t.emoji && q.title === t.title && q.body === t.body)) return state;
  return { queue: [...state.queue, { ...t, id: state.next }], next: state.next + 1 };
}
