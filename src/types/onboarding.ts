/**
 * 백엔드 온보딩 & 프로필 API 규격 (backend_baro docs/onboarding-api.md)
 */

export type Gender = 'MALE' | 'FEMALE';

/** 운동 목표 (1개 선택) */
export type ExerciseGoal =
  | 'WEIGHT_LOSS'
  | 'STRENGTH'
  | 'ENDURANCE'
  | 'POSTURE';

/** 하위 호환용 별칭 */
export type WorkoutGoal = ExerciseGoal;

/** 희망 주간 운동 빈도 (주 2~6회) */
export type WeeklyWorkoutDays = 2 | 3 | 4 | 5 | 6;

/** 운동 경험 수준 (NOVICE 외에는 루틴 난이도 Difficulty와 동일) */
export type ExperienceLevel =
  | 'NOVICE'
  | 'BEGINNER'
  | 'INTERMEDIATE'
  | 'ADVANCED';

/** 백엔드 전송용 불편 부위 Enum ('해당 없음'은 빈 배열 [] 로 전송) */
export type DiscomfortArea =
  | 'NECK_SHOULDER'
  | 'ARM_WRIST'
  | 'BACK'
  | 'LEG_ANKLE';

/** 프런트 UI 선택 상태용 ('NONE'은 '해당 없음' 카드 선택 상태) */
export type DiscomfortSelection = 'NONE' | DiscomfortArea;

/** 코칭 스타일 (1개 선택) */
export type CoachingStyle =
  | 'FRIENDLY'
  | 'CALM'
  | 'SPARTA'
  | 'ANALYTICAL';

export type PersonaTone = 'gentle' | 'spartan' | 'analytical';

export const COACHING_STYLE_TO_PERSONA: Record<CoachingStyle, PersonaTone> = {
  FRIENDLY: 'gentle',
  CALM: 'gentle',
  SPARTA: 'spartan',
  ANALYTICAL: 'analytical',
};

/** 닉네임 정책: 2~10자, 한글(완성형)·영문·숫자 */
export const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9]{2,10}$/;

export type NicknameAvailabilityReason =
  | 'AVAILABLE'
  | 'INVALID_FORMAT'
  | 'DUPLICATED'
  | null;

/** GET /api/v1/users/nicknames/random 응답 */
export interface NicknameResponse {
  nickname: string;
}

/** GET /api/v1/users/nicknames/availability 응답 */
export interface NicknameAvailabilityResponse {
  nickname: string;
  available: boolean;
  reason: NicknameAvailabilityReason;
}

/** POST /api/v1/users/me/onboarding 요청 바디 */
export interface OnboardingRequest {
  nickname: string;
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  goal: ExerciseGoal;
  experienceLevel: ExperienceLevel;
  weeklyWorkoutDays: WeeklyWorkoutDays;
  discomfortAreas: DiscomfortArea[];
  coachingStyle: CoachingStyle;
}

/** GET /api/v1/users/me 및 POST /api/v1/users/me/onboarding 의 profile 필드 */
export interface ProfileResponse {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  goal: ExerciseGoal;
  experienceLevel: ExperienceLevel;
  weeklyWorkoutDays: WeeklyWorkoutDays;
  discomfortAreas: DiscomfortArea[];
  coachingStyle: CoachingStyle;
}

/** GET /api/v1/users/me 및 POST /api/v1/users/me/onboarding 응답 */
export interface MeResponse {
  id: string;
  nickname: string | null;
  profileImageUrl: string | null;
  role: 'USER' | 'ADMIN';
  isOnboarded: boolean;
  profile: ProfileResponse | null;
}

export interface OnboardingProfile {
  nickname: string;
  gender: Gender;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  goal: ExerciseGoal | null;
  weeklyWorkoutDays: WeeklyWorkoutDays | null;
  experienceLevel: ExperienceLevel | null;
  discomfortSelections: DiscomfortSelection[];
  coachingStyle: CoachingStyle | null;
}
