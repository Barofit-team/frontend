import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { TokenResponse } from '@/types/auth';

/**
 * 바로핏 토큰 저장소. 기기 보안 저장소(Keychain/Keystore)에 보관합니다.
 * 웹은 SecureStore를 지원하지 않으므로 메모리에만 둡니다(새로고침하면 사라짐).
 */
const KEYS = {
  accessToken: 'barofit.accessToken',
  accessTokenExpiresAt: 'barofit.accessTokenExpiresAt',
  refreshToken: 'barofit.refreshToken',
} as const;

const memory = new Map<string, string>();
const isWeb = Platform.OS === 'web';

async function getItem(key: string): Promise<string | null> {
  return isWeb ? (memory.get(key) ?? null) : SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    memory.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    memory.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const tokenStorage = {
  getAccessToken: () => getItem(KEYS.accessToken),
  getRefreshToken: () => getItem(KEYS.refreshToken),

  async save(tokens: TokenResponse): Promise<void> {
    await Promise.all([
      setItem(KEYS.accessToken, tokens.accessToken),
      setItem(KEYS.accessTokenExpiresAt, tokens.accessTokenExpiresAt),
      setItem(KEYS.refreshToken, tokens.refreshToken),
    ]);
  },

  async clear(): Promise<void> {
    await Promise.all(Object.values(KEYS).map(deleteItem));
  },
};
