// Chat: the global room and one room per market, the same rooms the website
// shows. Reads are public; a send needs the session bearer, which the client
// attaches, and is never retried (a retried send posts the message twice).
//
// Live updates come from the website's SSE stream (`streamUrl`), read by
// src/chat/sse.ts. The GET routes are for the first load, older pages and the
// fallback poll when the stream is down.
import { z } from 'zod';

import { API_BASE } from '@/config';

import { get, post } from './client';

export const ChatMessage = z.object({
  id: z.number(),
  wallet: z.string(),
  username: z.string(),
  message: z.string(),
  created_at: z.string(),
  event_id: z.string().optional(),
  /** Market rooms only; the global room's rows carry no profile join. */
  pfp_emoji: z.string().nullable().optional(),
  reply_to_id: z.number().nullable().optional(),
  reply_to_username: z.string().nullable().optional(),
  reply_to_message: z.string().nullable().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

const Achievement = z.object({ id: z.string(), emoji: z.string(), title: z.string(), points: z.number() });
const Sent = ChatMessage.extend({ newAchievements: z.array(Achievement).default([]) });
export type SentChatMessage = z.infer<typeof Sent>;

/** The server's own limit; longer text is cut, so the composer stops there. */
export const CHAT_MAX = 200;

/**
 * Which room. `null` is the global room; anything else is a market's event id
 * (`chatEventId` in src/chat/rooms.ts builds them).
 */
export type ChatRoom = string | null;

const q = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};

/** The newest 50, oldest first; with `after`, only what came after that id. */
export const getChat = (room: ChatRoom, after?: number) =>
  room === null ? get(`/api/chat${q({ after })}`, z.array(ChatMessage)) : get(`/api/chat/event${q({ eventId: room, after })}`, z.array(ChatMessage));

/** Fifty messages before `before`, oldest first. Market rooms only: the global route has no paging. */
export const getChatBefore = (eventId: string, before: number) =>
  get(`/api/chat/event${q({ eventId, before })}`, z.object({ messages: z.array(ChatMessage), hasMore: z.boolean() }));

export const sendChat = (room: ChatRoom, message: string, replyToId?: number) =>
  room === null ? post('/api/chat', { message, replyToId }, Sent) : post('/api/chat/event', { message, eventId: room, replyToId }, Sent);

/** The newest global message id, and how many came after `after`. Cheap: served from memory on the web. */
export const getGlobalChatLatest = (after?: number) => get(`/api/chat/latest-id${q({ after })}`, z.object({ latestId: z.number(), count: z.number() }));

/** The SSE stream for a room. */
export const streamUrl = (room: ChatRoom) => `${API_BASE}/api/chat/stream?channel=${encodeURIComponent(room === null ? 'global' : `event_${room}`)}`;
