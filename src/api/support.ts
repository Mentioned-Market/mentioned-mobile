// Reporting a bug from inside the app.
//
// The route posts to a Discord channel, so what arrives has to be enough to act
// on without a reply: which build, which phone, which cluster, which wallet.
// Nobody writes that in the box, so the app attaches it.
import { z } from 'zod';

import { post } from './client';

/** The server's own limit. Shown as a counter rather than discovered at send. */
export const BUG_REPORT_MAX = 300;

export const reportBug = (message: string, debugInfo: Record<string, string>) =>
  post('/api/bug-report', { message, debugInfo }, z.object({ success: z.boolean() }));
