// Push, from the app's point of view: register once signed in, and go
// somewhere sensible when one is tapped.
//
// Registration waits for a session on purpose. The permission prompt is worth
// far more once someone has an account than at first launch, and the token is
// useless to the server before it knows whose it is.
import { useRouter, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { notificationTarget } from '@/notifications/link';
import { registerForPush } from '@/notifications/push';
import { useSession } from '@/store/session';

export function usePush() {
  const router = useRouter();
  const token = useSession((s) => s.token);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    // Never throws, and a refusal is a normal outcome, so there is nothing to
    // handle here: the feed and the badge work either way.
    registerForPush().then((registered) => {
      if (!cancelled && registered) console.log('[push] registered with the server');
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // A tap opens what the notification is about. The link comes from the same
  // server field the feed uses, so both agree on where a row goes; anything
  // that cannot be mapped opens the feed, where the row is readable in full.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const link = response.notification.request.content.data?.link;
      const target = notificationTarget(typeof link === 'string' ? link : null);
      router.push((target?.kind === 'route' ? target.href : '/notifications') as Href);
    });
    return () => sub.remove();
  }, [router]);
}
