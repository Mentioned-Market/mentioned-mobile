// Must run before any Solana import. @solana/kit derives PDAs with
// crypto.subtle.digest('SHA-256'), which Hermes does not provide.
import { install } from 'react-native-quick-crypto';
install();
