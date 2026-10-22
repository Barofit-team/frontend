import { apiFetch } from '@/services/api';
import type {
  MeResponse,
  NicknameAvailabilityResponse,
  NicknameResponse,
  OnboardingRequest,
} from '@/types/onboarding';

/**
 * 내 계정 정보 및 온보딩 프로필 조회
 * GET /api/v1/users/me
 */
export function fetchMyAccount(): Promise<MeResponse> {
  return apiFetch<MeResponse>('/api/v1/users/me', {
    method: 'GET',
    auth: true,
  });
}

/**
 * 사용 중이지 않은 랜덤 닉네임 생성 (예약하지 않음)
 * GET /api/v1/users/nicknames/random
 */
export function fetchRandomNickname(): Promise<NicknameResponse> {
  return apiFetch<NicknameResponse>('/api/v1/users/nicknames/random', {
    method: 'GET',
    auth: true,
  });
}

/**
 * 닉네임 형식 및 중복 여부 확인
 * GET /api/v1/users/nicknames/availability?nickname=...
 */
export function checkNicknameAvailability(
  nickname: string,
): Promise<NicknameAvailabilityResponse> {
  const query = new URLSearchParams({ nickname }).toString();
  return apiFetch<NicknameAvailabilityResponse>(
    `/api/v1/users/nicknames/availability?${query}`,
    {
      method: 'GET',
      auth: true,
    },
  );
}

/**
 * 온보딩 최종 저장 (닉네임 확정 + 프로필 저장 + isOnboarded = true)
 * POST /api/v1/users/me/onboarding
 */
export function submitOnboarding(payload: OnboardingRequest): Promise<MeResponse> {
  return apiFetch<MeResponse>('/api/v1/users/me/onboarding', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(payload),
  });
}
