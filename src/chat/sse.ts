// A minimal Server-Sent Events reader for the chat stream.
//
// React Native has no EventSource. Its XMLHttpRequest does report a response
// as it arrives (progress events carry the growing `responseText`), which is
// all SSE needs, so there is no library: `parseSse` below is the whole format
// as the chat route uses it (data lines, comments, blank-line separators).
//
// A connection is recycled every `MAX_AGE_MS`: `responseText` only grows, and
// a room left open for an hour would otherwise hold every heartbeat since.

/** Split a buffer into complete events' data, and the unfinished tail to keep. */
export function parseSse(buffer: string): { events: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n?/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events: string[] = [];
  for (const block of blocks) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(line.startsWith('data: ') ? 6 : 5));
    if (data.length > 0) events.push(data.join('\n'));
  }
  return { events, rest };
}

const MAX_AGE_MS = 5 * 60_000;

type Handlers = {
  onOpen: () => void;
  onData: (data: string) => void;
  /** The stream failed or ended. Called at most once; the caller decides whether to retry. */
  onClose: (error: boolean) => void;
};

/** Open a stream; returns a function that closes it without calling `onClose`. */
export function openSse(url: string, { onOpen, onData, onClose }: Handlers): () => void {
  const xhr = new XMLHttpRequest();
  let seen = 0;
  let buffer = '';
  let done = false;
  let opened = false;

  const finish = (error: boolean) => {
    if (done) return;
    done = true;
    clearTimeout(recycle);
    onClose(error);
  };
  // Ending the connection on purpose is not an error; the caller reconnects.
  const recycle = setTimeout(() => {
    xhr.abort();
    finish(false);
  }, MAX_AGE_MS);

  xhr.open('GET', url);
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('Cache-Control', 'no-cache');
  xhr.onreadystatechange = () => {
    if (xhr.readyState >= 2 && !opened) {
      if (xhr.status !== 200) {
        xhr.abort();
        finish(true);
        return;
      }
      opened = true;
      onOpen();
    }
  };
  xhr.onprogress = () => {
    const text = xhr.responseText;
    if (text.length <= seen) return;
    const { events, rest } = parseSse(buffer + text.slice(seen));
    seen = text.length;
    buffer = rest;
    for (const e of events) onData(e);
  };
  xhr.onerror = () => finish(true);
  // The server closed the stream (a deploy, a proxy timeout).
  xhr.onload = () => finish(true);
  xhr.send();

  return () => {
    done = true;
    clearTimeout(recycle);
    xhr.abort();
  };
}
