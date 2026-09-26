import nacl from 'tweetnacl';
import bs58 from 'bs58';

import { ApiError } from '@/api/client';
import { SeekerStatus } from '@/api/seeker';
import { base64ToBytes, bytesToBase64 } from '@/lib/bytes';
import { grantAmountText, seekerCard, seekerErrorMessage, sendingLabel, signatureFromSignedPayload } from '@/lib/seeker-perk';
import { buildSeekerLinkMessage, isValidSeekerLinkMessage } from '@/lib/seekerLinkMessage';

const status = (over: Partial<SeekerStatus> = {}, grant: Partial<SeekerStatus['grant']> = {}): SeekerStatus => ({
  linked: false,
  seekerWallet: null,
  verifiedAt: null,
  ...over,
  grant: { status: 'available', usdcBaseUnits: '1000000', lamports: '6000000', signature: null, ...grant },
});

describe('signatureFromSignedPayload', () => {
  it('takes the signature Seed Vault appends to the message', () => {
    const msg = new TextEncoder().encode('hello');
    const sig = new Uint8Array(64).map((_, i) => i);
    const signed = new Uint8Array([...msg, ...sig]);
    expect(Array.from(signatureFromSignedPayload(signed))).toEqual(Array.from(sig));
  });

  it('accepts a bare signature', () => {
    const sig = new Uint8Array(64).fill(7);
    expect(Array.from(signatureFromSignedPayload(sig))).toEqual(Array.from(sig));
  });

  it('refuses anything shorter than a signature', () => {
    expect(() => signatureFromSignedPayload(new Uint8Array(10))).toThrow('no signature');
  });
});

describe('the link message end to end', () => {
  // What the server does with what the app sends: rebuild, compare, verify.
  it('verifies as the server verifies it', () => {
    const kp = nacl.sign.keyPair();
    const seeker = bs58.encode(kp.publicKey);
    const account = 'Acc0unt111111111111111111111111111111111111';
    const now = 1_790_000_000;
    const message = buildSeekerLinkMessage(seeker, account, now);
    const signed = new Uint8Array([...new TextEncoder().encode(message), ...nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey)]);
    const signature = bytesToBase64(signatureFromSignedPayload(signed));

    expect(isValidSeekerLinkMessage(message, seeker, account, now + 60)).toBe(true);
    expect(nacl.sign.detached.verify(new TextEncoder().encode(message), base64ToBytes(signature), bs58.decode(seeker))).toBe(true);
  });
});

describe('bytesToBase64', () => {
  it('round trips every byte value', () => {
    const all = new Uint8Array(256).map((_, i) => i);
    expect(Array.from(base64ToBytes(bytesToBase64(all)))).toEqual(Array.from(all));
  });
});

describe('grantAmountText', () => {
  it('reads dollars and SOL', () => {
    expect(grantAmountText(status().grant)).toBe('$1.00 and 0.006 SOL');
  });
});

describe('seekerCard', () => {
  it('shows nothing before the status is known', () => {
    expect(seekerCard(undefined)).toBeNull();
  });

  it('offers the link with the stake when the stake is running', () => {
    const card = seekerCard(status())!;
    expect(card.action).toBe('link');
    expect(card.body).toContain('$1.00 and 0.006 SOL');
    expect(card.verified).toBe(false);
  });

  it('offers the link without promising a stake when it is off', () => {
    const card = seekerCard(status({}, { status: 'unavailable' }))!;
    expect(card.action).toBe('link');
    expect(card.body).not.toContain('$');
  });

  it('offers to collect once linked', () => {
    const card = seekerCard(status({ linked: true }))!;
    expect([card.action, card.verified]).toEqual(['claim', true]);
  });

  it('never presents an unfinished stake as failed', () => {
    const card = seekerCard(status({ linked: true }, { status: 'processing' }))!;
    expect(card.action).toBe('check');
    expect(card.body).toMatch(/on its way/);
    expect(card.body).not.toMatch(/fail/i);
  });

  it('points to the transaction on later visits once paid', () => {
    const card = seekerCard(status({ linked: true }, { status: 'funded' }))!;
    expect(card.action).toBe('history');
    expect(card.body).toContain('received');
    expect(card.celebrate).toBeFalsy();
  });

  it('announces the stake loudly the moment it lands', () => {
    const card = seekerCard(status({ linked: true }, { status: 'funded' }), true)!;
    expect(card.celebrate).toBe(true);
    expect(card.body).toContain('+$1.00 and +0.006 SOL');
    expect(card.action).toBe('pick');
  });

  it('only celebrates a stake that has actually landed', () => {
    expect(seekerCard(status({ linked: true }, { status: 'processing' }), true)!.celebrate).toBeFalsy();
  });

  it('names the amounts while sending', () => {
    expect(sendingLabel(status().grant)).toBe('Sending $1.00 and 0.006 SOL');
  });

  it('has nothing to do when linked and the stake is off', () => {
    expect(seekerCard(status({ linked: true }, { status: 'unavailable' }))!.action).toBeNull();
  });

  it('never uses the word bet or an em dash', () => {
    const all = (['available', 'unavailable', 'processing', 'funded'] as const).flatMap((g) =>
      [false, true].flatMap((linked) => [false, true].map((just) => seekerCard(status({ linked }, { status: g }), just)!)),
    );
    for (const c of all) {
      const text = `${c.title} ${c.body} ${c.cta ?? ''}`;
      expect(text).not.toMatch(/\bbet(s|ting)?\b/i);
      expect(text).not.toContain('—');
    }
  });
});

describe('seekerErrorMessage', () => {
  it('shows the server sentence for a coded refusal', () => {
    const e = new ApiError('/api/seeker/link', 503, 'Could not check your Seeker right now, please try again', 'CHECK_FAILED');
    expect(seekerErrorMessage(e)).toBe('Could not check your Seeker right now, please try again');
  });

  it('falls back to the general mapping without a sentence', () => {
    expect(seekerErrorMessage(new ApiError('/api/seeker/grant', 500))).toBe('Mentioned is having trouble. Try again shortly.');
  });

  it('says plainly when the wallet was declined', () => {
    expect(seekerErrorMessage(new Error('User declined the request'))).toBe('The wallet did not approve it. Nothing was linked.');
  });
});

describe('SeekerStatus schema', () => {
  it('parses what the server sends', () => {
    expect(
      SeekerStatus.safeParse({
        linked: true,
        seekerWallet: 'FoHWAQ4TwzhdaBzbW7NhTn1A2R19iyU4PQ43FMjAeZT',
        verifiedAt: '2026-09-25T10:00:00.000Z',
        grant: { status: 'funded', usdcBaseUnits: '1000000', lamports: '6000000', signature: 'sig' },
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown grant state', () => {
    expect(SeekerStatus.safeParse(status({}, { status: 'lost' as never })).success).toBe(false);
  });
});
