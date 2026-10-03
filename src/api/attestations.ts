// Trading integrity confirmations, as the website's /api/attestations serves
// them. The wallet always comes from the session bearer, never the body: a
// confirmation is only worth anything if the wallet itself made it.
//
// The server decides which confirmation is due. A POST for the wrong one
// answers 409 VARIANT_MISMATCH, which the gate handles by asking again (see
// src/trade/attestation.ts).
import { z } from 'zod';

import { get, post, q } from '@/api/client';
import type { AttestationMarketKind, TradeAttestationVariant } from '@/lib/attestation';

const Required = z.object({ required: z.enum(['full', 'compact', 'arena']).nullable() });
const Recorded = z.object({ ok: z.boolean() });

/** Which trading confirmation the signed-in wallet still owes for this market, or null. */
export const getTradeAttestation = (kind: AttestationMarketKind, marketId: string) =>
  get(`/api/attestations${q({ kind, marketId })}`, Required).then((r) => r.required);

/** Whether the signed-in wallet still owes the current season's Arena confirmation. */
export const getArenaAttestation = () => get(`/api/attestations${q({ scope: 'arena' })}`, Required).then((r) => r.required);

export const recordTradeAttestation = (kind: AttestationMarketKind, marketId: string, variant: TradeAttestationVariant) =>
  post('/api/attestations', { kind, marketId, variant }, Recorded);

export const recordArenaAttestation = () => post('/api/attestations', { scope: 'arena' }, Recorded);
