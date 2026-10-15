/**
 * 백엔드 인증 API 규격 (backend_baro docs/identity-service.md 4장)
 */
export type SocialProvider = 'KAKAO' | 'GOOGLE';

export interface AuthUser {
  id: string;
  nickname: string | null;
  profileImageUrl: string | null;
  role: 'USER' | 'ADMIN';
}

/** POST /api/v1/auth/social-login/code 응답 */
export interface SocialLoginResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  isOnboarded: boolean;
  user: AuthUser;
}

/** POST /api/v1/auth/refresh 응답 */
export interface TokenResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
}
