// Chat rooms match the website's names, a message is never shown twice however
// it arrives, and a failed send says something the player can act on.
import { ApiError } from '@/api/client';
import type { ChatMessage } from '@/api/chat';
import { CHAT_KEEP, RUN_GAP_MS, belongsTo, chatEventId, mergeMessages, prependMessages, profileHref, quote, reportText, sendError, sendable, startsRun } from '@/chat/rules';
import { parseSse } from '@/chat/sse';

const msg = (id: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  wallet: 'w',
  username: 'u',
  message: `m${id}`,
  created_at: '2026-09-26T12:00:00Z',
  ...over,
});

describe('chatEventId', () => {
  // The website's EventChat eventIds: a mismatch here is a silent empty room.
  it('names each market family the way the website does', () => {
    expect(chatEventId('paid-yesno', '17')).toBe('paid_17');
    expect(chatEventId('paid-majority', '17')).toBe('paidmaj_17');
    expect(chatEventId('free-yesno', 17)).toBe('custom_17');
    expect(chatEventId('free-majority', 17)).toBe('custom_17');
  });
});

describe('mergeMessages', () => {
  it('keeps one of each message, oldest first', () => {
    const merged = mergeMessages([msg(1), msg(3)], [msg(2), msg(3)]);
    expect(merged.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it('returns the same list when nothing new arrived', () => {
    const current = [msg(1), msg(2)];
    expect(mergeMessages(current, [msg(2)])).toBe(current);
    expect(mergeMessages(current, [])).toBe(current);
  });

  it('keeps only the newest when the room runs long', () => {
    const many = Array.from({ length: CHAT_KEEP + 20 }, (_, i) => msg(i + 1));
    const merged = mergeMessages([], many);
    expect(merged).toHaveLength(CHAT_KEEP);
    expect(merged[merged.length - 1].id).toBe(CHAT_KEEP + 20);
  });
});

describe('prependMessages', () => {
  it('puts an older page in front without duplicating the overlap', () => {
    expect(prependMessages([msg(5), msg(6)], [msg(3), msg(4), msg(5)]).map((m) => m.id)).toEqual([3, 4, 5, 6]);
  });
});

describe('belongsTo', () => {
  it('tells the global room from a market room', () => {
    expect(belongsTo(msg(1), null)).toBe(true);
    expect(belongsTo(msg(1, { event_id: 'paid_1' }), null)).toBe(false);
    expect(belongsTo(msg(1, { event_id: 'paid_1' }), 'paid_1')).toBe(true);
    expect(belongsTo(msg(1, { event_id: 'paid_2' }), 'paid_1')).toBe(false);
  });
});

describe('sendable', () => {
  it('trims, refuses blank text, and cuts at the server limit', () => {
    expect(sendable('  hi  ')).toBe('hi');
    expect(sendable('   ')).toBeNull();
    expect(sendable('x'.repeat(250))).toHaveLength(200);
  });
});

describe('sendError', () => {
  it('turns each failure into something to act on', () => {
    expect(sendError(new ApiError('/api/chat', 401))).toBe('Sign in to chat.');
    expect(sendError(new ApiError('/api/chat', 429, 'Slow down'))).toMatch(/five seconds/);
    expect(sendError(new ApiError('/api/chat', 400, 'Message contains prohibited language'))).toMatch(/not allowed/);
    expect(sendError(new Error('network'))).toMatch(/connection/);
  });
});

describe('quote', () => {
  it('leaves short text alone and cuts long text at a word', () => {
    expect(quote('hello there')).toBe('hello there');
    const q = quote('the quick brown fox jumps over the lazy dog again and again', 30);
    expect(q.endsWith('…')).toBe(true);
    expect(q.length).toBeLessThanOrEqual(31);
    expect(q).not.toMatch(/ …$/);
  });
});

describe('parseSse', () => {
  it('reads data events and skips comments and heartbeats', () => {
    const { events, rest } = parseSse(': connected\n\ndata: {"id":1}\n\n: heartbeat\n\ndata: {"id":2}\n\n');
    expect(events).toEqual(['{"id":1}', '{"id":2}']);
    expect(rest).toBe('');
  });

  it('keeps an unfinished event for the next chunk', () => {
    const first = parseSse('data: {"id":1}\n\ndata: {"id"');
    expect(first.events).toEqual(['{"id":1}']);
    const second = parseSse(`${first.rest}:2}\n\n`);
    expect(second.events).toEqual(['{"id":2}']);
  });

  it('accepts CRLF line endings and data with no space after the colon', () => {
    expect(parseSse('data:{"id":3}\r\n\r\n').events).toEqual(['{"id":3}']);
  });
});

describe('profileHref', () => {
  it("opens a named player's profile, and an unnamed wallet's positions", () => {
    expect(profileHref({ wallet: 'W', username: 'taylor' })).toBe('/u/taylor');
    expect(profileHref({ wallet: '49GTxyz', username: '49GT...u2fY' })).toBe('/positions?wallet=49GTxyz');
  });
});

describe('reportText', () => {
  it('names the message, the room and the author, and fits the limit', () => {
    const r = reportText(msg(9, { username: 'x', wallet: 'W', message: 'y'.repeat(500) }), 'paid_1', 300);
    expect(r).toContain('message 9');
    expect(r).toContain('market chat paid_1');
    expect(r).toContain('(W)');
    expect(r.length).toBeLessThanOrEqual(300);
  });
});

describe('startsRun', () => {
  const at = (id: number, wallet: string, ms: number) => msg(id, { wallet, created_at: new Date(Date.parse('2026-09-26T12:00:00Z') + ms).toISOString() });

  it('starts a run on the first message and on a change of author', () => {
    expect(startsRun(at(1, 'a', 0), undefined)).toBe(true);
    expect(startsRun(at(2, 'b', 1000), at(1, 'a', 0))).toBe(true);
  });

  it('continues a run from the same author close together', () => {
    expect(startsRun(at(2, 'a', 60_000), at(1, 'a', 0))).toBe(false);
  });

  it('starts again after a long pause', () => {
    expect(startsRun(at(2, 'a', RUN_GAP_MS + 1), at(1, 'a', 0))).toBe(true);
  });
});
