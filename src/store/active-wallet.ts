// Which wallet the app is acting as. A signed-in Openfort wallet wins; the
// Seed Vault wallet connected over MWA is the fallback, and is how positions
// are viewable before sign-in works end to end.
import { useSession } from '@/store/session';
import { useWallet } from '@/store/wallet';

export function useActiveWallet(): string | null {
  const session = useSession((s) => s.wallet);
  const viewed = useWallet((s) => s.viewedAddress);
  return session ?? viewed;
}
