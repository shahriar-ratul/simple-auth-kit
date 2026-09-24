import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthTokens } from '@simple-auth-kit/auth-client';
import { asyncStorageTokenStorage } from '../src/api/tokenStorage';

// AsyncStorage is a native module; an in-memory map stands in for it so the storage contract
// the AuthClient depends on can be checked in plain Node.
const store = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => void store.set(key, value),
    removeItem: async (key: string) => void store.delete(key),
  },
}));

const tokens = { accessToken: 'access', refreshToken: 'refresh' } as AuthTokens;

describe('asyncStorageTokenStorage', () => {
  beforeEach(() => store.clear());

  it('returns null when nothing is stored', async () => {
    expect(await asyncStorageTokenStorage.get()).toBeNull();
  });

  it('round-trips the tokens it stored', async () => {
    await asyncStorageTokenStorage.set(tokens);
    expect(await asyncStorageTokenStorage.get()).toEqual(tokens);
  });

  it('forgets the tokens once cleared', async () => {
    await asyncStorageTokenStorage.set(tokens);
    await asyncStorageTokenStorage.clear();
    expect(await asyncStorageTokenStorage.get()).toBeNull();
  });

  it('treats a corrupt stored value as logged out instead of throwing', async () => {
    store.set('simple-auth-kit/tokens', '{not json');
    expect(await asyncStorageTokenStorage.get()).toBeNull();
  });
});
