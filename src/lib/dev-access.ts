// Who may open the dev screen (`mentioned://dev`).
//
// The screen can view the app as any address and drive wallet recovery by
// hand, which is right for a tester and wrong for a stranger with a deep link.
// A dev build and the non-live flavours stay open, because that is where the
// screen is used every day, often signed out. A production build opens it only
// for a wallet the website calls an admin (`ADMIN_WALLETS` there, asked through
// `/api/auth/admin`), so the list lives on the server and never in the APK.
//
// Anything short of a clear yes is a no: signed out, the check failed, or the
// phone is offline. The cost is an admin who cannot reach the screen with no
// signal, and the screen is little use without one.
import type { Flavor } from '@/config';

export type DevAccess = 'open' | 'checking' | 'denied';

export type DevAccessInput = {
  /** React Native's __DEV__: true in a dev client, false in a release APK. */
  devBuild: boolean;
  flavor: Flavor;
  /** The signed-in wallet, never the "view as" address. */
  sessionWallet: string | null;
  /** The server's answer for that wallet; undefined while it is still being asked. */
  admin: boolean | undefined;
  /** The question could not be answered. */
  failed: boolean;
};

export function devAccess({ devBuild, flavor, sessionWallet, admin, failed }: DevAccessInput): DevAccess {
  if (devBuild || flavor !== 'production') return 'open';
  if (!sessionWallet || failed) return 'denied';
  if (admin === undefined) return 'checking';
  return admin ? 'open' : 'denied';
}
