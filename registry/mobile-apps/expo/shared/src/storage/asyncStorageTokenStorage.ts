import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthTokens, TokenStorage } from "@easy-auth/auth-client";

/**
 * TokenStorage backed by @react-native-async-storage/async-storage.
 *
 * Deliberately unencrypted (plain AsyncStorage rather than Keychain-backed secure
 * storage) — a project-level decision, not an oversight. The whole `AuthTokens`
 * object is JSON-stringified into a single storage key.
 */
const STORAGE_KEY = "easy-auth/tokens";

export const asyncStorageTokenStorage: TokenStorage = {
  async get(): Promise<AuthTokens | null> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthTokens;
    } catch {
      // Corrupt/partial value — treat as logged out rather than throwing.
      return null;
    }
  },

  async set(tokens: AuthTokens): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
};
