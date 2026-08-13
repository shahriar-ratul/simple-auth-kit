import { AuthClient } from '@easy-auth/auth-client';
import Config from 'react-native-config';
import { asyncStorageTokenStorage } from './tokenStorage';
import { activeWorkspaceIdResolver } from '../workspace/activeWorkspace';

// react-native-config injects keys from the repo-root .env at build time (see .env / react-native-config.d.ts).
// Falls back to the locally-running nestjs-prisma-app-workspaces example if the native build step wasn't
// wired up (e.g. running the JS bundle standalone) — see README notes on Android emulator / physical device
// hosts.
const baseUrl = Config.API_BASE_URL ?? 'http://localhost:3005';

// This app targets the workspaces backend variant (`easy-auth add <combo> --workspaces`), so it
// configures a workspace resolver. Which calls then carry `X-Workspace-Id` is not decided here and
// not decided per call site: inside AuthClient only `scopedRequest()` can send it, so `login`,
// `signup`, `sessions`, `logout*`, `POST /workspaces` and `GET /workspaces` structurally cannot —
// you cannot already be in the workspace you are about to create or choose.
/** Single shared client for the whole app — screens/store import this instead of constructing their own. */
export const authClient = new AuthClient({
  baseUrl,
  storage: asyncStorageTokenStorage,
  workspaceId: activeWorkspaceIdResolver,
});
