import nacl from 'tweetnacl';
import bs58 from 'bs58';

import { ApiError } from '@/api/client';
import type { PaidMajorityListEntry } from '@/api/paidMajority';
import { SeekerStatus } from '@/api/seeker';
import { base64ToBytes, bytesToBase64 } from '@/lib/bytes';
import { freePickElsewhereNote, freePickMarket, freePickUse, grantAmountText, seekerCard, seekerErrorMessage, seekerHomeOffer, seekerPerkWallet, sendingLabel, signatureFromSignedPayload } from '@/lib/seeker-perk';
import { buildSeekerLinkMessage, isValidSeekerLinkMessage } from '@/lib/seekerLinkMessage';

const NO_PICK: SeekerStatus['freePick'] = { status: 'unavailable', usdcBaseUnits: '1000000', marketId: null, word: null, signature: null };

const status = (over: Partial<SeekerStatus> = {}, grant: Partial<SeekerStatus['grant']> = {}): SeekerStatus => ({
  linked: false,
  seekerWallet: null,
  verifiedAt: null,
  freePick: NO_PICK,
  ...over,
  grant: { status: 'available', usdcBaseUnits: '1000000', lamports: '6000000', signature: null, ...grant },
});

/** A status from a server that offers the free pick: the cash half is always off. */
const picking = (pick: Partial<SeekerStatus['freePick']> = {}, linked = true): SeekerStatus =>
  status({ linked, freePick: { ...NO_PICK, status: 'available', ...pick } }, { status: 'unavailable' });

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

  it('never shows a wallet timeout as a Java exception', () => {
    const said = seekerErrorMessage(new Error('java.util.concurrent.TimeoutException: Timed out waiting for response with id=1'));
    expect(said).toBe('The wallet did not answer in time. Nothing was linked. Try again.');
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

describe('seekerHomeOffer', () => {
  it('leads with the money when a Seeker can still be linked for the stake', () => {
    const offer = seekerHomeOffer(status())!;
    expect(offer.action).toBe('link');
    expect(offer.amount).toBe('$1.00');
    expect(offer.title).toContain(offer.amount);
    expect(offer.subtitle).toContain('0.006 SOL');
  });

  it('offers the collect when linked with the stake still waiting', () => {
    const offer = seekerHomeOffer(status({ linked: true }))!;
    expect(offer.action).toBe('claim');
    expect(offer.title).toContain('$1.00');
  });

  // Home is for the money. With none on offer, the link stays on Me only.
  it('shows nothing when there is no stake to promise', () => {
    expect(seekerHomeOffer(status({}, { status: 'unavailable' }))).toBeNull();
    expect(seekerHomeOffer(status({ linked: true }, { status: 'processing' }))).toBeNull();
    expect(seekerHomeOffer(undefined)).toBeNull();
  });

  it('celebrates once when the stake lands, then goes', () => {
    const funded = status({ linked: true }, { status: 'funded' });
    const offer = seekerHomeOffer(funded, true)!;
    expect(offer.celebrate).toBe(true);
    // The component draws `amount` in gold by finding it in the title.
    expect(offer.title).toContain(offer.amount);
    expect(seekerHomeOffer(funded, false)).toBeNull();
  });
});

describe('the free pick', () => {
  it('reads a status from a server that has never heard of it as no pick', () => {
    const parsed = SeekerStatus.parse({ linked: true, seekerWallet: null, verifiedAt: null, grant: status().grant });
    expect(parsed.freePick.status).toBe('unavailable');
    expect(seekerCard(parsed)!.action).toBe('claim');
  });

  it('offers the link with a pick, not with cash', () => {
    const card = seekerCard(picking({}, false))!;
    expect(card.action).toBe('link');
    expect(card.body).toContain('$1.00');
    expect(card.body).not.toContain('SOL');
  });

  it('sends a linked Seeker to the markets, with nothing to collect', () => {
    const card = seekerCard(picking())!;
    expect([card.action, card.verified]).toEqual(['pick', true]);
    expect(card.body).toContain('Most said wins');
  });

  it('never presents a pick that was sent as failed', () => {
    const card = seekerCard(picking({ status: 'processing' }))!;
    expect(card.action).toBe('check-pick');
    expect(card.body).not.toMatch(/fail/i);
  });

  it('names the word once used, and celebrates only the moment it lands', () => {
    const used = picking({ status: 'used', word: 'penalty', marketId: '7' });
    const quiet = seekerCard(used)!;
    expect([quiet.action, quiet.celebrate]).toEqual(['positions', undefined]);
    expect(quiet.body).toContain('"penalty"');
    expect(seekerCard(used, true)!.celebrate).toBe(true);
  });

  it('never promises cash it cannot withdraw', () => {
    for (const s of [picking({}, false), picking(), picking({ status: 'processing' }), picking({ status: 'used', word: 'penalty' })]) {
      for (const just of [false, true]) {
        const c = seekerCard(s, just)!;
        const text = `${c.title} ${c.body} ${c.cta ?? ''}`;
        expect(text).not.toMatch(/landed in your wallet|collect|welcome stake/i);
        expect(text).not.toMatch(/\bbet(s|ting)?\b/i);
        expect(text).not.toContain('—');
      }
    }
  });

  it('is on Home while it is unused, and gone once it is', () => {
    expect(seekerHomeOffer(picking({}, false))!.action).toBe('link');
    const ready = seekerHomeOffer(picking())!;
    expect(ready.action).toBe('pick');
    expect(ready.title).toContain(ready.amount);
    expect(seekerHomeOffer(picking({ status: 'processing' }))).toBeNull();
    expect(seekerHomeOffer(picking({ status: 'used' }))).toBeNull();
  });

  it('says which markets it is for, everywhere it is offered', () => {
    const texts = [
      seekerCard(picking({}, false))!.body,
      seekerCard(picking())!.body,
      seekerHomeOffer(picking({}, false))!.subtitle,
      seekerHomeOffer(picking())!.subtitle,
      freePickElsewhereNote(picking())!,
    ];
    for (const t of texts) expect(t).toContain('"Most said wins"');
  });

  it('only mentions it on another kind of market to someone who has it unused', () => {
    expect(freePickElsewhereNote(undefined)).toBeNull();
    expect(freePickElsewhereNote(picking({}, false))).toBeNull();
    expect(freePickElsewhereNote(picking({ status: 'used' }))).toBeNull();
    expect(freePickElsewhereNote(status({ linked: true }))).toBeNull();
  });

  describe('freePickMarket', () => {
    const NOW = 1_791_000_000_000;
    const market = (marketId: string, over: Partial<PaidMajorityListEntry> = {}) =>
      ({ marketId, status: 0, unitPrice: '1000000', lockTs: String(NOW / 1000 + 3600), ...over }) as PaidMajorityListEntry;

    it('opens the open market that closes soonest', () => {
      const list = [market('1', { lockTs: String(NOW / 1000 + 7200) }), market('2'), market('3', { lockTs: String(NOW / 1000 + 9000) })];
      expect(freePickMarket(list, picking(), NOW)).toBe('/majority/2');
    });

    it('skips a market that is closed, about to lock, or costs more than the pick covers', () => {
      const list = [
        market('1', { status: 1 }),
        market('2', { lockTs: String(NOW / 1000 - 10) }),
        market('3', { lockTs: String(NOW / 1000 + 30) }),
        market('4', { unitPrice: '5000000' }),
      ];
      expect(freePickMarket(list, picking(), NOW)).toBeNull();
      expect(freePickMarket([...list, market('5')], picking(), NOW)).toBe('/majority/5');
    });

    it('goes nowhere without an unused pick', () => {
      expect(freePickMarket([market('1')], picking({ status: 'used' }), NOW)).toBeNull();
      expect(freePickMarket([market('1')], undefined, NOW)).toBeNull();
    });
  });

  describe('freePickUse', () => {
    const UNIT = 1_000_000n;

    it('makes a basket of exactly one word free', () => {
      expect(freePickUse(picking(), 1, UNIT)).toEqual({ free: true });
    });

    it('says how to use it when the basket is empty or bigger', () => {
      expect(freePickUse(picking(), 0, UNIT)).toMatchObject({ free: false });
      const many = freePickUse(picking(), 3, UNIT)!;
      expect(many.free).toBe(false);
      expect(many.free === false && many.note).toMatch(/one word/);
    });

    it('is nothing without a linked Seeker, or once used or in flight', () => {
      expect(freePickUse(undefined, 1, UNIT)).toBeNull();
      expect(freePickUse(picking({}, false), 1, UNIT)).toBeNull();
      expect(freePickUse(picking({ status: 'processing' }), 1, UNIT)).toBeNull();
      expect(freePickUse(picking({ status: 'used' }), 1, UNIT)).toBeNull();
      expect(freePickUse(status({ linked: true }), 1, UNIT)).toBeNull();
    });

    it('is not offered on a market that costs more than it covers', () => {
      expect(freePickUse(picking(), 1, 2_000_000n)).toBeNull();
      expect(freePickUse(picking({ usdcBaseUnits: '2000000' }), 1, 2_000_000n)).toEqual({ free: true });
    });
  });
});

describe('seekerPerkWallet', () => {
  const WALLET = '49GT1N8mRLp4Q9JYJDRR3YopGtfHFGTrwg6cmbm3u2fY';

  it('is the session wallet for an embedded account', () => {
    expect(seekerPerkWallet(WALLET, 'openfort')).toBe(WALLET);
    expect(seekerPerkWallet(WALLET, 'privy')).toBe(WALLET);
  });

  it('is nobody for an account signed in with the Seeker itself', () => {
    expect(seekerPerkWallet(WALLET, 'seeker')).toBeNull();
  });

  it('is nobody when signed out', () => {
    expect(seekerPerkWallet(null, 'openfort')).toBeNull();
  });
});
