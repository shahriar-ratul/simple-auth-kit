import { AuthClient } from '@easy-auth/auth-client';
import Config from 'react-native-config';
import { asyncStorageTokenStorage } from './tokenStorage';

// react-native-config injects keys from the repo-root .env at build time (see .env / react-native-config.d.ts).
// Falls back to the locally-running nestjs-prisma-app example if the native build step wasn't wired up
// (e.g. running the JS bundle standalone) — see README notes on Android emulator / physical device hosts.
const baseUrl = Config.API_BASE_URL ?? 'http://localhost:3001';

/** Single shared client for the whole app — screens/store import this instead of constructing their own. */
export const authClient = new AuthClient({
  baseUrl,
  storage: asyncStorageTokenStorage,
});
