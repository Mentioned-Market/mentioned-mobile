// The dev screen can view the app as any address, so in a store build it must
// open for an admin wallet and for nobody else. These pin that a failed or
// unanswered check never opens it.
import { devAccess, type DevAccessInput } from '@/lib/dev-access';

const WALLET = '49GT1N8mRLp4Q9JYJDRR3YopGtfHFGTrwg6cmbm3u2fY';

const store = (over: Partial<DevAccessInput> = {}): DevAccessInput => ({
  devBuild: false,
  flavor: 'production',
  sessionWallet: WALLET,
  admin: undefined,
  failed: false,
  ...over,
});

describe('devAccess', () => {
  it('is open in a dev build, signed in or not', () => {
    expect(devAccess(store({ devBuild: true, sessionWallet: null }))).toBe('open');
  });

  it('is open on the non-live flavours, where testers use it', () => {
    expect(devAccess(store({ flavor: 'staging', sessionWallet: null }))).toBe('open');
    expect(devAccess(store({ flavor: 'devnet', admin: false }))).toBe('open');
  });

  it('opens a production build for an admin wallet', () => {
    expect(devAccess(store({ admin: true }))).toBe('open');
  });

  it('refuses a production build for anyone else', () => {
    expect(devAccess(store({ admin: false }))).toBe('denied');
  });

  it('refuses a production build with nobody signed in, whatever the server said', () => {
    expect(devAccess(store({ sessionWallet: null }))).toBe('denied');
    expect(devAccess(store({ sessionWallet: null, admin: true }))).toBe('denied');
  });

  it('waits while the server has not answered, rather than opening', () => {
    expect(devAccess(store())).toBe('checking');
  });

  it('refuses when the check failed, so being offline is not a way in', () => {
    expect(devAccess(store({ failed: true }))).toBe('denied');
    expect(devAccess(store({ failed: true, admin: true }))).toBe('denied');
  });
});
