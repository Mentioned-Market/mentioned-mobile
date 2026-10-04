// Signing in must finish once however many copies of the sign-in screen are
// mounted; three copies used to mean three sessions and three toasts.
import { endFinish, finishRunning, tryStartFinish } from '@/auth/finish-lock';

afterEach(endFinish);

describe('the sign-in finish lock', () => {
  it('lets the first copy through and turns the others away', () => {
    expect(tryStartFinish()).toBe(true);
    expect(tryStartFinish()).toBe(false);
    expect(tryStartFinish()).toBe(false);
    expect(finishRunning()).toBe(true);
  });

  it('opens again once the finish has ended, so a failure can be retried', () => {
    expect(tryStartFinish()).toBe(true);
    endFinish();
    expect(finishRunning()).toBe(false);
    expect(tryStartFinish()).toBe(true);
  });

  it('is safe to end when nothing was running', () => {
    endFinish();
    expect(tryStartFinish()).toBe(true);
  });
});
