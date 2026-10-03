// The gate around the integrity confirmation: what is asked of the server,
// what a refusal turns into, and that a write is never repeated.
import { ApiError } from '@/api/client';
import { friendlyTeamError } from '@/lib/arena-view';
import {
  ARENA_REFUSED,
  CHECK_FAILED,
  SAVE_FAILED,
  SESSION_EXPIRED,
  confirmAttestation,
  isAttestationRefusal,
  requiredAttestation,
  type AttestationApi,
  type AttestationTarget,
} from '@/trade/attestation';

const TRADE: AttestationTarget = { scope: 'trade', kind: 'amm', marketId: '42' };
const ARENA: AttestationTarget = { scope: 'arena' };
const apiError = (status: number, message?: string) => new ApiError('/api/attestations', status, message);

function fake(over: Partial<AttestationApi> = {}): jest.Mocked<AttestationApi> {
  return {
    getTrade: jest.fn().mockResolvedValue(null),
    getArena: jest.fn().mockResolvedValue(null),
    recordTrade: jest.fn().mockResolvedValue({ ok: true }),
    recordArena: jest.fn().mockResolvedValue({ ok: true }),
    ...over,
  } as jest.Mocked<AttestationApi>;
}

describe('requiredAttestation', () => {
  it('asks about the market being traded', async () => {
    const api = fake({ getTrade: jest.fn().mockResolvedValue('full') });
    expect(await requiredAttestation(TRADE, api)).toEqual({ required: 'full' });
    expect(api.getTrade).toHaveBeenCalledWith('amm', '42');
    expect(api.getArena).not.toHaveBeenCalled();
  });

  it('asks about the season for an Arena entry', async () => {
    const api = fake({ getArena: jest.fn().mockResolvedValue('arena') });
    expect(await requiredAttestation(ARENA, api)).toEqual({ required: 'arena' });
    expect(api.getTrade).not.toHaveBeenCalled();
  });

  it('passes through when nothing is owed', async () => {
    expect(await requiredAttestation(TRADE, fake())).toEqual({ required: null });
  });

  it('says the session expired on a 401', async () => {
    const api = fake({ getTrade: jest.fn().mockRejectedValue(apiError(401, 'Authentication required')) });
    expect(await requiredAttestation(TRADE, api)).toEqual({ error: SESSION_EXPIRED });
  });

  it('keeps the offline sentence, and hides the server wording for anything else', async () => {
    const offline = fake({ getTrade: jest.fn().mockRejectedValue(new TypeError('Network request failed')) });
    expect(await requiredAttestation(TRADE, offline)).toEqual({ error: "You're offline. Check your connection and try again." });

    const bad = fake({ getTrade: jest.fn().mockRejectedValue(apiError(400, 'kind and marketId are required')) });
    expect(await requiredAttestation(TRADE, bad)).toEqual({ error: CHECK_FAILED });

    const down = fake({ getTrade: jest.fn().mockRejectedValue(apiError(500, 'Failed to check confirmation')) });
    expect(await requiredAttestation(TRADE, down)).toEqual({ error: CHECK_FAILED });
  });
});

describe('confirmAttestation', () => {
  it('records the variant that was shown, for that market', async () => {
    const api = fake();
    expect(await confirmAttestation(TRADE, 'full', api)).toEqual({ status: 'saved' });
    expect(api.recordTrade).toHaveBeenCalledWith('amm', '42', 'full');
    expect(api.recordTrade).toHaveBeenCalledTimes(1);
  });

  it('records the Arena confirmation for the season', async () => {
    const api = fake();
    expect(await confirmAttestation(ARENA, 'arena', api)).toEqual({ status: 'saved' });
    expect(api.recordArena).toHaveBeenCalledTimes(1);
    expect(api.recordTrade).not.toHaveBeenCalled();
  });

  it('never records an Arena sheet against a market', async () => {
    const api = fake();
    expect(await confirmAttestation(TRADE, 'arena', api)).toEqual({ status: 'error', message: SAVE_FAILED });
    expect(api.recordTrade).not.toHaveBeenCalled();
  });

  it('switches to the sheet that is due on a variant mismatch, without posting again', async () => {
    const api = fake({
      recordTrade: jest.fn().mockRejectedValue(apiError(409, 'VARIANT_MISMATCH')),
      getTrade: jest.fn().mockResolvedValue('full'),
    });
    expect(await confirmAttestation(TRADE, 'compact', api)).toEqual({ status: 'switch', variant: 'full' });
    expect(api.recordTrade).toHaveBeenCalledTimes(1);
  });

  it('counts a mismatch as saved when nothing is owed any more', async () => {
    const api = fake({ recordTrade: jest.fn().mockRejectedValue(apiError(409, 'VARIANT_MISMATCH')) });
    expect(await confirmAttestation(TRADE, 'compact', api)).toEqual({ status: 'saved' });
  });

  it('does not retry a failed save', async () => {
    const api = fake({ recordTrade: jest.fn().mockRejectedValue(apiError(500, 'Failed to record confirmation')) });
    expect(await confirmAttestation(TRADE, 'full', api)).toEqual({ status: 'error', message: SAVE_FAILED });
    expect(api.recordTrade).toHaveBeenCalledTimes(1);
  });

  it('says so when the season ended while the sheet was open', async () => {
    const api = fake({ recordArena: jest.fn().mockRejectedValue(apiError(409, 'The Arena has ended')) });
    expect(await confirmAttestation(ARENA, 'arena', api)).toEqual({ status: 'error', message: 'This season has ended.' });
  });

  it('says the session expired on a 401', async () => {
    const api = fake({ recordTrade: jest.fn().mockRejectedValue(apiError(401)) });
    expect(await confirmAttestation(TRADE, 'full', api)).toEqual({ status: 'error', message: SESSION_EXPIRED });
  });
});

describe('isAttestationRefusal', () => {
  it('recognises the code the RPC proxy and the team routes answer with', () => {
    expect(isAttestationRefusal('ATTESTATION_REQUIRED')).toBe(true);
    expect(isAttestationRefusal('Transaction rejected (UNDECODABLE)')).toBe(false);
    expect(isAttestationRefusal('Blockhash not found')).toBe(false);
  });

  it('turns a refused team entry into a sentence', () => {
    expect(friendlyTeamError(new ApiError('/api/teams/join', 403, 'ATTESTATION_REQUIRED'))).toBe(ARENA_REFUSED);
  });
});
