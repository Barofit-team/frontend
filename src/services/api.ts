import { tokenStorage } from '@/services/tokenStorage';
import type { TokenResponse } from '@/types/auth';

/**
 * API 호출 공통 함수입니다.
 * 서버 주소는 .env 의 EXPO_PUBLIC_API_URL 로 설정합니다. (.env.example 참고)
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

/**
 * 백엔드 에러 응답(RFC 9457 Problem Details + code).
 * 화면 분기는 detail(문구)이 아니라 code로 합니다.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

type ApiFetchInit = RequestInit & {
  /** true면 저장된 Access Token을 Authorization 헤더에 붙이고, 만료 시 refresh 후 한 번 재시도합니다. */
  auth?: boolean;
};

let onAuthFailure: (() => void) | null = null;

/** 세션을 되살릴 수 없을 때(재로그인 필요) 호출할 동작을 등록합니다. */
export function setOnAuthFailure(handler: () => void) {
  onAuthFailure = handler;
}

export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const { auth = false, ...requestInit } = init ?? {};
  let response = await send(path, requestInit, auth ? await tokenStorage.getAccessToken() : null);

  if (auth && response.status === 401) {
    const error = await toApiError(response);
    if (error.code !== 'AUTH_TOKEN_EXPIRED') {
      await failSession();
      throw error;
    }
    const accessToken = await refreshAccessToken();
    if (!accessToken) {
      throw error;
    }
    response = await send(path, requestInit, accessToken);
  }

  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

let refreshing: Promise<string | null> | null = null;

/**
 * Refresh Token은 한 번만 쓸 수 있으므로, 여러 요청이 동시에 만료돼도 refresh는 하나만 보냅니다(single-flight).
 * 같은 토큰으로 두 번 보내면 서버가 재사용으로 판단해 세션 전체를 폐기합니다.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function doRefresh(): Promise<string | null> {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) {
    await failSession();
    return null;
  }
  try {
    const tokens = await apiFetch<TokenResponse>('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    await tokenStorage.save(tokens);
    return tokens.accessToken;
  } catch (error) {
    // 네트워크 오류는 세션을 지우지 않습니다. 401(만료·폐기·탈퇴)만 재로그인으로 보냅니다
    if (error instanceof ApiError && error.status === 401) {
      await failSession();
    }
    return null;
  }
}

async function failSession() {
  await tokenStorage.clear();
  onAuthFailure?.();
}

async function send(path: string, init: RequestInit, accessToken: string | null): Promise<Response> {
  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', `서버에 연결할 수 없습니다. (${BASE_URL || 'EXPO_PUBLIC_API_URL 미설정'})`);
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { code?: string; detail?: string };
    return new ApiError(response.status, body.code ?? 'UNKNOWN', body.detail ?? `API 요청 실패: ${response.status}`);
  } catch {
    return new ApiError(response.status, 'UNKNOWN', `API 요청 실패: ${response.status}`);
  }
}
