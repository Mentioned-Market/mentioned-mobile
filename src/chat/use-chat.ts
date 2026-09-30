// One chat room, live: the newest messages, older ones on request, and new
// ones as they are said.
//
// Live means the website's SSE stream, opened only while the room is on
// screen (`active`), the same rule the website follows to keep connections
// down. If the stream drops, the room polls for anything newer every few
// seconds and tries the stream again after a pause. Each (re)connect first
// fetches what was missed, since the stream does not replay.
import { useCallback, useEffect, useRef, useState } from 'react';

import { getChat, getChatBefore, sendChat, streamUrl, ChatMessage, type ChatRoom, type SentChatMessage } from '@/api/chat';
import { belongsTo, mergeMessages, prependMessages } from '@/chat/rules';
import { openSse } from '@/chat/sse';

const POLL_MS = 5000;
const RETRY_STREAM_MS = 15_000;

export type ChatRoomState = {
  messages: ChatMessage[];
  loading: boolean;
  error: unknown;
  /** The stream is up; otherwise the room is polling. */
  live: boolean;
  /** Market rooms can page back; the global route cannot. */
  canLoadOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => void;
  send: (text: string, replyToId?: number) => Promise<SentChatMessage>;
  retry: () => void;
};

export function useChat(room: ChatRoom, active: boolean): ChatRoomState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [live, setLive] = useState(false);
  const [hasMore, setHasMore] = useState(room !== null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Newest and oldest ids held, for `after` and `before`. Refs because the
  // stream and poll callbacks outlive any one render.
  const newest = useRef(0);
  const oldest = useRef(0);

  const take = useCallback(
    (incoming: ChatMessage[]) => {
      const mine = incoming.filter((m) => belongsTo(m, room));
      if (mine.length === 0) return;
      for (const m of mine) {
        if (m.id > newest.current) newest.current = m.id;
        if (oldest.current === 0 || m.id < oldest.current) oldest.current = m.id;
      }
      setMessages((cur) => mergeMessages(cur, mine));
    },
    [room],
  );

  // First load, and again on retry.
  useEffect(() => {
    let cancelled = false;
    getChat(room)
      .then((rows) => {
        if (cancelled) return;
        take(rows);
        // The route returns at most 50; fewer means there is nothing older.
        if (rows.length < 50) setHasMore(false);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [room, take, attempt]);

  // Live while on screen: the stream, or the poll while the stream is down.
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let closeStream: (() => void) | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const catchUp = () => {
      getChat(room, newest.current || undefined)
        .then(take)
        .catch(() => {});
    };
    const startPolling = () => {
      if (poll) return;
      poll = setInterval(catchUp, POLL_MS);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    const connect = () => {
      if (stopped) return;
      closeStream = openSse(streamUrl(room), {
        onOpen: () => {
          setLive(true);
          stopPolling();
          catchUp();
        },
        onData: (data) => {
          let json: unknown;
          try {
            json = JSON.parse(data);
          } catch {
            return;
          }
          const parsed = ChatMessage.safeParse(json);
          if (parsed.success) take([parsed.data]);
        },
        onClose: (failed) => {
          closeStream = null;
          setLive(false);
          if (stopped) return;
          if (!failed) {
            // A recycled connection: reopen straight away.
            connect();
            return;
          }
          startPolling();
          retry = setTimeout(connect, RETRY_STREAM_MS);
        },
      });
    };

    connect();
    return () => {
      stopped = true;
      closeStream?.();
      stopPolling();
      if (retry) clearTimeout(retry);
      setLive(false);
    };
  }, [room, active, take]);

  const loadOlder = useCallback(() => {
    if (room === null || !hasMore || loadingOlder || oldest.current === 0) return;
    setLoadingOlder(true);
    getChatBefore(room, oldest.current)
      .then(({ messages: older, hasMore: more }) => {
        for (const m of older) if (m.id < oldest.current) oldest.current = m.id;
        setMessages((cur) => prependMessages(cur, older));
        setHasMore(more);
      })
      .catch(() => {})
      .finally(() => setLoadingOlder(false));
  }, [room, hasMore, loadingOlder]);

  const send = useCallback(
    async (text: string, replyToId?: number) => {
      const row = await sendChat(room, text, replyToId);
      // The stream will deliver the same row; `take` keeps one.
      take([{ ...row, event_id: room ?? undefined }]);
      return row;
    },
    [room, take],
  );

  const retry = useCallback(() => {
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  return { messages, loading, error, live, canLoadOlder: room !== null && hasMore, loadingOlder, loadOlder, send, retry };
}
