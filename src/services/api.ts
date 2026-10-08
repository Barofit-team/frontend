/**
 * API 호출 공통 함수입니다.
 * 서버 주소는 .env 의 EXPO_PUBLIC_API_URL 로 설정합니다. (.env.example 참고)
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status}`);
  }

  return (await response.json()) as T;
}
