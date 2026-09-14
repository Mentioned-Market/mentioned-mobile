// The notification feed: what the server has already decided to tell this
// wallet. Shapes captured Sep 12 2026 from `lib/db.ts` (`NotificationRow`).
//
// Push delivery is a separate thing that does not exist yet on the web side.
// This feed stands on its own without it: the rows are written whenever a
// market the wallet traded resolves, a market opens, or a dev update goes out,
// so the app can show them whether or not a push ever arrives.
import { z } from 'zod';

import { del, get, post, put, q } from './client';

/** Postgres bigints arrive as strings; a number would still be safe, so take both. */
const id = z.union([z.string(), z.number()]).transform(String);

export const Notification = z.object({
  id,
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  /** A path on the website, e.g. "/market/123". Mapped to a screen by `@/notifications/link`. */
  link: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
export type Notification = z.infer<typeof Notification>;

/** Newest first. `before` is the id of the oldest row already held. */
export const listNotifications = (opts: { before?: string; limit?: number } = {}) =>
  get(`/api/notifications${q({ before: opts.before, limit: opts.limit })}`, z.object({ notifications: z.array(Notification) })).then(
    (r) => r.notifications,
  );

/** Just the badge. Answers 0 rather than 401 when signed out. */
export const getUnreadCount = () => get('/api/notifications/unread-count', z.object({ count: z.number() })).then((r) => r.count);

/**
 * Mark rows read: the given ids, or every unread row when none are given.
 *
 * An empty array is deliberately not sent as one. The server treats `[]` as
 * "mark nothing", which is the right reading of an explicit empty list, but it
 * is never what the app means; when there is nothing to mark, do not call.
 */
export const markNotificationsRead = (ids?: string[]) =>
  post('/api/notifications/read', ids && ids.length > 0 ? { ids } : {}, z.object({ updated: z.number() })).then((r) => r.updated);

/**
 * Hand the server this device's FCM token so it can push to it.
 *
 * The route does not exist on the web yet (SPEC section 12). Until it does
 * this answers 404, which is not a failure worth showing anyone: the feed and
 * the badge work without it, so the caller simply carries on.
 */
export const registerPushToken = (token: string, deviceId?: string) =>
  post('/api/notifications/push-token', { token, platform: 'android', deviceId }, z.object({ ok: z.boolean() }).partial().passthrough());

/**
 * Stop pushing to this device for the signed-in wallet. Scoped server side to
 * the caller's own wallet, so it can only ever remove its own registration.
 */
export const unregisterPushToken = (token: string) =>
  del('/api/notifications/push-token', z.object({ ok: z.boolean() }).partial().passthrough(), { token });

/**
 * Push preferences. The same route also carries the website's Discord and
 * Telegram flags, which the app never shows, so only the push keys are read.
 * Optional because a server without the push migration returns none of them,
 * and the settings screen says so rather than showing switches that do nothing.
 */
export const NotificationSettings = z
  .object({
    push_new_markets: z.boolean().optional(),
    push_resolutions: z.boolean().optional(),
    push_dev_updates: z.boolean().optional(),
  })
  .passthrough();
export type NotificationSettings = z.infer<typeof NotificationSettings>;

export type PushSettingKey = 'push_new_markets' | 'push_resolutions' | 'push_dev_updates';

export const getNotificationSettings = () =>
  get('/api/notifications/settings', z.object({ settings: NotificationSettings })).then((r) => r.settings);

/** Change some push preferences; the server returns the whole row as it now stands. */
export const updateNotificationSettings = (patch: Partial<Record<PushSettingKey, boolean>>) =>
  put('/api/notifications/settings', patch, z.object({ settings: NotificationSettings })).then((r) => r.settings);

/** Remove every notification for the wallet. */
export const clearNotifications = () => del('/api/notifications', z.object({ cleared: z.number() })).then((r) => r.cleared);
