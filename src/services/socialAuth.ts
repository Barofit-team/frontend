import * as Crypto from 'expo-crypto';

import type { SocialProvider } from '@/types/auth';

/**
 * WebView 소셜 로그인(OAuth 인가 코드) 요청을 만듭니다.
 * client secret이 필요한 코드 교환은 백엔드가 하므로, 앱에는 공개 식별자만 둡니다.
 */
const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY ?? '';
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

/**
 * 카카오·구글 콘솔과 백엔드(SOCIAL_REDIRECT_URIS)에 등록된 주소와 같아야 합니다.
 * 실제로 열리는 페이지가 아니라, WebView가 이 주소로 이동하려는 순간 code를 가로챕니다.
 */
export const OAUTH_REDIRECT_URI = process.env.EXPO_PUBLIC_OAUTH_REDIRECT_URI ?? 'http://localhost:8081';

/** 로그인 시도 하나의 값. state는 앱이, nonce는 서버가 확인합니다 */
export interface SocialLoginRequest {
  provider: SocialProvider;
  url: string;
  state: string;
  nonce: string;
}

export function missingClientKey(provider: SocialProvider): string | null {
  if (provider === 'KAKAO' && !KAKAO_REST_API_KEY) return 'EXPO_PUBLIC_KAKAO_REST_API_KEY';
  if (provider === 'GOOGLE' && !GOOGLE_CLIENT_ID) return 'EXPO_PUBLIC_GOOGLE_CLIENT_ID';
  return null;
}

export function createSocialLoginRequest(provider: SocialProvider): SocialLoginRequest {
  // state: 다른 곳에서 시작된 로그인 응답을 받지 않도록(CSRF), nonce: ID Token 재사용 방지
  const state = Crypto.randomUUID();
  const nonce = Crypto.randomUUID();
  const params: Record<string, string> =
    provider === 'KAKAO'
      ? {
          client_id: KAKAO_REST_API_KEY,
          redirect_uri: OAUTH_REDIRECT_URI,
          response_type: 'code',
          state,
          nonce,
        }
      : {
          client_id: GOOGLE_CLIENT_ID,
          redirect_uri: OAUTH_REDIRECT_URI,
          response_type: 'code',
          scope: 'openid profile email',
          prompt: 'select_account',
          state,
          nonce,
        };
  const base =
    provider === 'KAKAO' ? 'https://kauth.kakao.com/oauth/authorize' : 'https://accounts.google.com/o/oauth2/v2/auth';
  return { provider, url: `${base}?${toQueryString(params)}`, state, nonce };
}

export type RedirectResult =
  | { type: 'code'; code: string }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

/** WebView가 이동하려는 주소가 로그인 결과(redirect_uri)인지 확인합니다 */
export function isOAuthRedirect(url: string): boolean {
  return url.startsWith(OAUTH_REDIRECT_URI);
}

export function parseOAuthRedirect(url: string, expectedState: string): RedirectResult {
  const params = parseQueryString(url);
  const error = params.get('error');
  if (error) {
    // 사용자가 동의 화면에서 취소한 경우: 카카오 access_denied, 구글 access_denied
    return error === 'access_denied' ? { type: 'cancelled' } : { type: 'error', message: error };
  }
  if (params.get('state') !== expectedState) {
    return { type: 'error', message: '로그인 요청 정보가 일치하지 않습니다.' };
  }
  const code = params.get('code');
  return code ? { type: 'code', code } : { type: 'error', message: '인가 코드가 없습니다.' };
}

// React Native의 URL/URLSearchParams 구현은 플랫폼·버전에 따라 일부 기능이 없어 직접 처리합니다
function toQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function parseQueryString(url: string): Map<string, string> {
  const query = url.split('#')[0].split('?')[1] ?? '';
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const separator = pair.indexOf('=');
    const key = separator < 0 ? pair : pair.slice(0, separator);
    const value = separator < 0 ? '' : pair.slice(separator + 1);
    params.set(decodeURIComponent(key), decodeURIComponent(value.replace(/\+/g, ' ')));
  }
  return params;
}
